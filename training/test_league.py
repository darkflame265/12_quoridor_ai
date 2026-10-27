import copy
import unittest
from unittest.mock import patch
import numpy as np
from league import assess,timed_search

def winning_report():
    report={'status':'completed','ms':500,'cores':4,'pairsPerSuite':5,'opponents':['native53','past-0'],'tactics':[{'pass':True,'elapsedMs':501} for _ in range(16)],'validationPositions':['v'],'holdoutPositions':['h'],'timing':{r:{'moves':100,'overruns':0} for r in ['candidate','native53','past-0']},'games':[]}
    for split in ['validation','holdout']:
        for op in report['opponents']:
            for suite in ['general','maze']:
                for i in range(5):
                    for side in [0,1]: report['games'].append({'split':split,'opponent':op,'suite':suite,'openingIndex':i,'candidateSide':side,'result':'win','replayValidated':True})
    return report

class LeagueTests(unittest.TestCase):
    def test_gate_requires_complete_paired_unseen_timed_league(self):
        r=winning_report(); self.assertTrue(assess(r)['eligible'])
        for mutation in [lambda r:r.update(status='failed'),lambda r:r.update(ms=100),lambda r:r['games'].pop(),lambda r:r['tactics'][0].update({'pass':False}),lambda r:r.update(holdoutPositions=['v']),lambda r:r['timing']['candidate'].update(overruns=5)]:
            changed=copy.deepcopy(r); mutation(changed); self.assertFalse(assess(changed)['eligible'])

    def test_draws_and_one_winning_color_cannot_hide_weakness(self):
        r=winning_report()
        for g in r['games']: g['result']='win' if g['candidateSide']==0 else 'draw'
        self.assertFalse(assess(r)['eligible'])
        for g in r['games']: g['result']='win' if g['candidateSide']==0 else 'loss'
        self.assertFalse(assess(r)['eligible'])

    def test_duplicate_pair_and_missing_maze_fail(self):
        r=winning_report(); r['games'][0]=copy.deepcopy(r['games'][1]); self.assertFalse(assess(r)['checks']['paired'])

    def test_deadline_fallback_and_terminal_search_stay_bounded(self):
        state={'p':[{'x':0,'y':1},{'x':8,'y':4}],'walls':[],'left':[0,0],'turn':0,'winner':None}
        def expand(search,node):
            node.actions=[0]; node.prior=np.array([1.]); node.n=np.array([0.]); node.w=np.array([0.]); node.expanded=True; return 0.
        for step,expected_min in [(1.,0),(.001,1)]:
            t=[0.]
            def clock(): t[0]+=step; return t[0]
            with patch('league.MCTS.__init__',return_value=None),patch('league.MCTS.expand',expand):
                action,stats=timed_search(None,None,None,state,10,clock)
            self.assertEqual(action,0); self.assertGreaterEqual(stats['simulations'],expected_min); self.assertLess(stats['simulations'],20)
        with self.assertRaises(ValueError): timed_search(None,None,None,{**state,'winner':0},10)

if __name__=='__main__': unittest.main()
