"""Exact ordered action parity on deterministic reachable boards."""
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'vendor/sigma-quoridor'))
from game import State
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "runtime"))
from sigma_fast_walls import install_fast_walls

original = State._get_legal_wall_actions
install_fast_walls(State)
optimized = State._get_legal_wall_actions
rng = random.Random(61106)
checked = 0
for _ in range(6):
    state = State(boardsize=9, walls_p1=10, walls_p2=10)
    for ply in range(45):
        # Compare on the same state before next() can populate new caches.
        expected = original(state)
        actual = optimized(state)
        assert expected == actual, (ply, expected, actual)
        checked += 1
        if state.is_finished():
            break
        actions = state.get_legal_actions()
        state = state.next(rng.choice(actions))
print(f'PASS ordered legal wall sets match on {checked} reachable positions')
