"""Sigma3 experimental root move stress-test using exhaustive legal enemy replies.

These are bounded *static* path-race estimates, not proofs of optimal moves.
Use only as a guard for comparable MCTS candidates, never to replace
immediate goal or other exact terminal decisions.
"""
def race_margin(state, own):
    me=state.player1pos if own==1 else state.player2pos
    them=state.player2pos if own==1 else state.player1pos
    mg=state.p1_dist if own==1 else state.p2_dist
    og=state.p2_dist if own==1 else state.p1_dist
    return mg[me[1]][me[0]]-og[them[1]][them[0]]

def worst_enemy_reply(root, action, max_replies=140):
    side=root.get_current_player()
    enemy=2 if side==1 else 1
    after=root.next(action)
    if after.winner()==side:return (-1000,0)
    if after.winner()==enemy:return (1000,0)
    replies=after.get_legal_actions()
    if len(replies)>max_replies:return None
    worst=-1000
    for reply in replies:
        follow=after.next(reply)
        if follow.winner()==enemy:return (1000,len(replies))
        if follow.winner()==side:score=-1000
        else:score=race_margin(follow,side)
        if score>worst:worst=score
    return worst,len(replies)

def root_stress_guard(state, selected, choices, q_tolerance=0.075,
                      improvement=2, visit_fraction=0.20):
    if not choices:return None
    lead=choices[0]
    selected_node=next((c for c in choices if c.action==selected),None)
    if selected_node is None or selected_node.visit_count<8:return None
    candidates=[c for c in choices[:8] if c.action==selected or
                (c.visit_count>=max(6,lead.visit_count*visit_fraction)
                 and -c.q_value>=-selected_node.q_value-q_tolerance)]
    if len(candidates)<2:return None
    baseline=worst_enemy_reply(state,selected)
    if baseline is None or baseline[0]<=-100:return None
    ranked=[]
    for c in candidates:
        if c.action==selected:continue
        risk=worst_enemy_reply(state,c.action)
        if risk is not None and baseline[0]-risk[0]>=improvement:
            ranked.append((risk[0],-c.visit_count,c,risk[1]))
    if not ranked:return None
    new_risk,_,best,replies=min(ranked,key=lambda v:(v[0],v[1]))
    return {'action':best.action,'oldRisk':baseline[0],
            'newRisk':new_risk,'replyCount':replies,
            'compared':len(candidates)}
