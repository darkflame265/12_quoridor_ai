import copy
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import numpy as np
import torch
from train import ROOT,Bridge,PolicyValue,MCTS,Node,features
from batch_selfplay import (RulePool,BatchedEvaluator,generate_games,collect,parser,
                            load_dataset,verify_game,sha_file,atomic_json)

class BatchedSelfPlayTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): torch.set_num_threads(1)

    def test_transient_windows_rename_preserves_the_previous_manifest(self):
        import os
        original=os.replace
        with tempfile.TemporaryDirectory() as temporary:
            file=Path(temporary)/'manifest.json'; file.write_text('{"old":true}',encoding='utf-8'); calls=[]
            def rename(source,target):
                calls.append(1)
                if len(calls)<3:
                    self.assertEqual(json.loads(file.read_text()),{'old':True}); error=PermissionError('temporary sharing failure'); error.winerror=5; raise error
                original(source,target)
            with patch('batch_selfplay.os.replace',side_effect=rename),patch('batch_selfplay.time.sleep'):
                atomic_json(file,{'new':True})
            self.assertEqual(json.loads(file.read_text()),{'new':True}); self.assertEqual(len(calls),3)

    def test_parallel_rules_and_eviction_preserve_request_order(self):
        bridge=Bridge(); pool=RulePool(2,cache_limit=1)
        try:
            states=[bridge.call(op='initial')['state']]+[f['state'] for f in bridge.call(op='tactics')[:2]]
            states.append(states[0]); actual=pool.inspect_many(states)
            self.assertEqual(actual,[bridge.inspect(s) for s in states]); self.assertEqual(len({b.proc.pid for b in pool.bridges}),2)
        finally: pool.close(); bridge.close()
        self.assertTrue(all(b.proc.poll() is not None for b in pool.bridges))

    def test_streaming_puct_matches_serial_search_with_tiny_caches(self):
        torch.manual_seed(71); model=PolicyValue(16).eval(); bridge=Bridge()
        try:
            fixtures=bridge.call(op='tactics'); states=[bridge.call(op='initial')['state'],fixtures[0]['state'],fixtures[8]['state'],fixtures[1]['state']]
            expected=[MCTS(model,bridge,np.random.default_rng(i),8,.8).search(s,noise=True,temperature=1) for i,s in enumerate(states)]
            with RulePool(2,cache_limit=1) as rules:
                evaluator=BatchedEvaluator(model,rules,max_batch=2,cache_limit=1)
                streams={i:MCTS(None,None,np.random.default_rng(i),8,.8).search_stream(s,noise=True,temperature=1) for i,s in enumerate(states)}
                pending={i:next(stream) for i,stream in streams.items()}; actual={}
                while pending:
                    ids=list(pending); values=evaluator.expand([pending[i] for i in ids],.8)
                    for i,value in zip(ids,values):
                        try: pending[i]=streams[i].send(value)
                        except StopIteration as done: actual[i]=done.value; del pending[i]
                self.assertIn('2',evaluator.histogram)
                for i,(action,pi) in actual.items(): self.assertEqual(action,expected[i][0]); np.testing.assert_allclose(pi,expected[i][1],atol=1e-6)
        finally: bridge.close()

    @unittest.skipUnless(torch.cuda.is_available(),'CUDA not installed in this Python environment')
    def test_gpu_batch_predictions_match_cpu(self):
        torch.manual_seed(19); cpu=PolicyValue(16).eval(); gpu=copy.deepcopy(cpu).to('cuda').eval(); bridge=Bridge()
        try:
            states=[bridge.call(op='initial')['state']]+[f['state'] for f in bridge.call(op='tactics')[:3]]
            with RulePool(1) as rules:
                a=[Node(copy.deepcopy(s)) for s in states]; b=[Node(copy.deepcopy(s)) for s in states]
                old=BatchedEvaluator(cpu,rules,4); new=BatchedEvaluator(gpu,rules,4)
                np.testing.assert_allclose(old.expand(a,.3),new.expand(b,.3),atol=1e-5)
                for x,y in zip(a,b): np.testing.assert_allclose(x.prior,y.prior,atol=1e-6)
                self.assertEqual(new.rows,4); self.assertEqual(new.calls,1)
        finally: bridge.close()

    def test_game_random_streams_do_not_depend_on_concurrency(self):
        torch.manual_seed(17); model=PolicyValue(16).eval(); bridge=Bridge()
        args=SimpleNamespace(games=3,parallel_games=1,rules_workers=1,inference_batch=1,simulations=4,max_plies=24,bootstrap=1.,seed=43)
        try:
            serial=list(generate_games(model,bridge,args)); args.parallel_games=3; args.rules_workers=2; args.inference_batch=4
            metrics={}; batched=list(generate_games(model,bridge,args,metrics=metrics))
            self.assertEqual(len(serial),len(batched)); self.assertGreater(metrics['inference']['meanBatch'],1)
            for (old,old_game),(new,new_game) in zip(serial,batched):
                self.assertEqual(old_game,new_game); self.assertEqual(len(old),len(new))
                for a,b in zip(old,new):
                    for x,y in zip(a,b): np.testing.assert_allclose(x,y,atol=1e-6)
        finally: bridge.close()

    def test_collection_resumes_without_rewriting_completed_games_and_rejects_tampering(self):
        with tempfile.TemporaryDirectory() as temporary:
            args=parser().parse_args(['--device','cpu','--out',temporary,'--games','2','--parallel-games','2','--rules-workers','1','--inference-batch','4','--simulations','4','--max-plies','100','--bootstrap','1','--max-new-games','1'])
            partial=collect(args); self.assertEqual(partial['status'],'partial'); first=copy.deepcopy(partial['entries'][0]); before=sha_file(Path(temporary)/first['samples'])
            wrong=copy.copy(args); wrong.resume=True; wrong.simulations+=1
            with self.assertRaisesRegex(ValueError,'configuration'): collect(wrong)
            args.resume=True; args.max_new_games=0; completed=collect(args); self.assertEqual(completed['status'],'completed'); self.assertEqual(len(completed['entries']),2)
            self.assertEqual(before,sha_file(Path(temporary)/first['samples'])); examples,meta=load_dataset(temporary)
            self.assertEqual(len(examples),sum(e['trainingSamples'] for e in completed['entries'])); self.assertGreater(len(examples),0); self.assertEqual(meta['games'],2)
            file=Path(temporary)/first['samples']; file.write_bytes(file.read_bytes()+b'tamper')
            with self.assertRaisesRegex(ValueError,'changed'): load_dataset(temporary)

    def test_capped_games_cannot_be_labeled_as_draws(self):
        bridge=Bridge()
        try:
            s=bridge.call(op='initial')['state']; pi=np.zeros((1,209),np.float32); pi[0,67]=1
            game={'trainingSamples':1,'records':[],'openingPlies':0,'plies':0,'winner':None,'reason':'ply cap'}
            with self.assertRaisesRegex(ValueError,'Capped'): verify_game(game,features(s)[None,:],pi,np.zeros(1,np.float32),bridge)
        finally: bridge.close()

    def test_actual_capped_selfplay_has_no_value_labels(self):
        bridge=Bridge(); args=SimpleNamespace(games=1,parallel_games=1,rules_workers=1,inference_batch=1,simulations=1,max_plies=1,bootstrap=1.,seed=43)
        try:
            results=list(generate_games(PolicyValue(16).eval(),bridge,args)); examples,game=results[0]
            self.assertEqual(game['reason'],'ply cap'); self.assertEqual(game['plies'],1); self.assertEqual(examples,[])
            args.parallel_games=0
            with self.assertRaisesRegex(ValueError,'budget'): list(generate_games(PolicyValue(16).eval(),bridge,args))
        finally: bridge.close()

if __name__=='__main__': unittest.main()
