import sys
sys.path[:0]=['vendor/sigma-quoridor','scripts']
from game import State
from mcts import MCTSNode
from sigma3_prior_guidance import guide_root_priors

root=MCTSNode(State(boardsize=9))
state=root.state
legal=state.get_legal_actions()
root.children=[
 MCTSNode(None,parent=root,action=action,prior=1/len(legal),parent_state=state)
 for action in legal
]
before=state._position_key()
guided=guide_root_priors(root)
assert guided==12
assert len(root.children)==len(legal)
assert all(x.prior>0 and x.base_prior>0 for x in root.children)
assert abs(sum(x.prior for x in root.children)-1)<1e-9
assert abs(sum(x.base_prior for x in root.children)-1)<1e-9
assert state._position_key()==before
assert len({round(x.base_prior,10) for x in root.children})>1
print('PASS prior guidance: normalized, bounded, legal, root preserved')
