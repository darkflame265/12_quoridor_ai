"""Sigma3 opt-in exact two-own-turn pawn-goal attack verification.

A returned action is a proof of winning by the attacker's NEXT turn at
latest, against EVERY legal opponent reply. No selective defense sampling.
Absence of a result does not mean the position is drawn/lost.
"""
from game import PawnAction
from sigma3_tactical import immediate_pawn_win

def find_forced_goal_two_turns(state, candidates=None, reply_cap=140):
    side=state.get_current_player()
    actions=state.get_legal_actions()
    if candidates is not None:
        keys=set(id(a) for a in candidates)
        # Exact action equality; MCTS action objects may differ in identity.
        actions=[a for a in actions if any(a==c for c in candidates)]
    me=state.player1pos if side==1 else state.player2pos
    grid=state.p1_dist if side==1 else state.p2_dist
    if grid[me[1]][me[0]]>3:
        return None
    # A forced win is not necessarily the FASTEST forced win. Avoid changing
    # a legal immediate goal into a slower three-turn route.
    for action in actions:
        if state.next(action).winner()==side:
            return {'action':action,'kind':'immediate','defenderReplies':0}
    for action in actions:
        after=state.next(action)
        if after.winner()==side:
            return {'action':action,'kind':'immediate','defenderReplies':0}
        if after.winner():
            continue
        own=after.player1pos if side==1 else after.player2pos
        own_grid=after.p1_dist if side==1 else after.p2_dist
        if own_grid[own[1]][own[0]]>2:
            continue
        replies=after.get_legal_actions()
        if len(replies)>reply_cap:
            continue
        forced=True
        for defense in replies:
            next_state=after.next(defense)
            if next_state.winner() or not immediate_pawn_win(next_state):
                forced=False
                break
        if forced:
            return {'action':action,'kind':'two','defenderReplies':len(replies)}
    return None


def find_forced_three_turn_race(state, candidates=None, reply_cap=140):
    """Exact existential attack with up to three of our turns, if opponent has 0 walls.

    The first move may be a wall or pawn move. Subsequent attack moves are
    restricted to pawns (a conservative proof subset), but ALL opponent
    replies are enumerated, so returned wins are sound. There is no result
    if any opponent reply is omitted.  An opponent obtaining a goal is an
    immediate refutation.
    """
    side=state.get_current_player()
    enemy=2 if side==1 else 1
    if (state.walls_p1 if enemy==1 else state.walls_p2)!=0:
        return None
    my_pos=state.player1pos if side==1 else state.player2pos
    my_dist=state.p1_dist if side==1 else state.p2_dist
    if my_dist[my_pos[1]][my_pos[0]]>4:
        return None
    all_actions=state.get_legal_actions()
    if candidates is not None:
        all_actions=[a for a in all_actions if any(a==c for c in candidates)]
    memo={}
    def winning_after_opponent(next_state):
        if next_state.winner()==side:
            return True
        if next_state.winner()==enemy:
            return False
        # Our second turn: either win immediately or make a pawn move such
        # that every enemy response allows immediate goal on our third turn.
        k=next_state._position_key()
        if k in memo:
            return memo[k]
        if immediate_pawn_win(next_state):
            memo[k]=True
            return True
        for second in (a for a in next_state.get_legal_actions()
                       if isinstance(a,PawnAction)):
            mid=next_state.next(second)
            if mid.winner()==side:
                memo[k]=True
                return True
            if mid.winner()==enemy:
                continue
            opp=mid.get_legal_actions()
            if len(opp)>reply_cap:
                continue
            if all((lambda p:p.winner()==side or
                    (not p.winner() and immediate_pawn_win(p)))(mid.next(r))
                   for r in opp):
                memo[k]=True
                return True
        memo[k]=False
        return False
    for first in all_actions:
        if state.next(first).winner()==side:
            return {'action':first,'kind':'one','defenderReplies':0}
    # Two-turn proofs beat longer plans, including speculative wall attacks.
    short=find_forced_goal_two_turns(state,all_actions,reply_cap)
    if short:
        return {'action':short['action'],'kind':short['kind'],'defenderReplies':short['defenderReplies']}
    for first in all_actions:
        after=state.next(first)
        if after.winner()==side:
            return {'action':first,'kind':'one','defenderReplies':0}
        if after.winner()==enemy:
            continue
        opponent=after.get_legal_actions()
        if len(opponent)>reply_cap:
            continue
        if all(winning_after_opponent(after.next(r)) for r in opponent):
            return {'action':first,'kind':'three','defenderReplies':len(opponent)}
    return None
