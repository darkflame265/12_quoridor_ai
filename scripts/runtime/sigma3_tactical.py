"""Exact, bounded tactical proofs for Sigma3. No neural-network heuristics.

A positive result proves the opponent can force a pawn goal in at most two
of their turns. A negative/unknown result is NOT a proof of safety.
"""
from game import PawnAction

def immediate_pawn_win(state):
    """Side to move can legally finish now by moving its pawn."""
    side=state.get_current_player()
    pos=state.player1pos if side==1 else state.player2pos
    grid=state.p1_dist if side==1 else state.p2_dist
    if grid[pos[1]][pos[0]]>1:
        return False
    return any(state.next(a).winner()==side
               for a in state.get_legal_actions() if isinstance(a,PawnAction))

def enemy_two_turn_force(after_our_action, reply_cap=140):
    """Sound witness for enemy's forced goal after ONE enemy pawn move.

    The player to move is the enemy. For some pawn first move, every legal
    defender action must fail to stop the enemy's pawn reaching goal next.
    Restrict to <=reply_cap legal defender actions; overflow is UNKNOWN.
    """
    enemy=after_our_action.get_current_player()
    other=2 if enemy==1 else 1
    if immediate_pawn_win(after_our_action):
        return {'kind':'one','enemyFirst':None,'defenderReplies':0}
    pos=after_our_action.player1pos if enemy==1 else after_our_action.player2pos
    grid=after_our_action.p1_dist if enemy==1 else after_our_action.p2_dist
    if grid[pos[1]][pos[0]]>2:
        return None
    for first in (a for a in after_our_action.get_legal_actions()
                  if isinstance(a,PawnAction)):
        middle=after_our_action.next(first)
        if middle.winner()==enemy:
            return {'kind':'one','enemyFirst':first,'defenderReplies':0}
        defender=middle.get_legal_actions()
        if len(defender)>reply_cap:
            continue
        forced=True
        for defense in defender:
            after_defense=middle.next(defense)
            if after_defense.winner()==other or not immediate_pawn_win(after_defense):
                forced=False
                break
        if forced:
            return {'kind':'two','enemyFirst':first,'defenderReplies':len(defender)}
    return None

def choose_exact_escape(state, selected, candidates, reply_cap=140):
    """Change selected action only if a proven forced loss has a proven escape.

    This is a bounded witness check, not a full game-theoretic evaluation.
    Candidates must be prevalidated legal actions.
    """
    chosen=state.next(selected)
    danger=enemy_two_turn_force(chosen,reply_cap)
    if not danger:
        return None
    for action in candidates:
        if action==selected:
            continue
        next_state=state.next(action)
        if next_state.winner()==state.get_current_player():
            return {'action':action,'threat':danger,'tested':1}
        if enemy_two_turn_force(next_state,reply_cap) is None:
            return {'action':action,'threat':danger,'tested':1}
    return None
