import unittest
import random
import numpy as np
from train import Bridge,PolicyValue,MCTS,features,canonical_action,apply_action,action_object

class TrainingTests(unittest.TestCase):
    def test_canonical_action_is_involution(self):
        for a in range(209):
            self.assertEqual(canonical_action(canonical_action(a,1),1),a)
            self.assertEqual(canonical_action(a,0),a)
    def test_python_transitions_match_independent_rules(self):
        bridge=Bridge();rng=random.Random(13)
        try:
            s=bridge.call(op='initial')['state'];records=[]
            for _ in range(40):
                if s['winner'] is not None: break
                a=rng.choice(bridge.inspect(s)['actions']);s=apply_action(s,a);records.append(action_object(a))
            self.assertEqual(bridge.call(op='validate',records=records)['state'],s)
        finally: bridge.close()
    def test_puct_emits_only_legal_actions_and_normalized_targets(self):
        bridge=Bridge()
        try:
            s=bridge.call(op='initial')['state'];search=MCTS(PolicyValue(16).eval(),bridge,np.random.default_rng(13),simulations=8,bootstrap=.8)
            a,pi=search.search(s);self.assertIn(a,bridge.inspect(s)['actions']);self.assertAlmostEqual(float(pi.sum()),1,places=5)
            legal={canonical_action(a,s['turn']) for a in bridge.inspect(s)['actions']}
            self.assertTrue(all(i in legal for i,p in enumerate(pi) if p>0));self.assertEqual(features(s).shape,(292,))
        finally: bridge.close()
if __name__=='__main__':unittest.main()
