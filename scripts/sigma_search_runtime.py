"""Latest-request-only worker protocol with cooperative search cancellation.

The stdin reader remains responsive while Python/ONNX searches. Deadlines stop
MCTS between completed iterations; interrupted post-processing falls back to a
completed, legal root candidate, never a half-evaluated tactical override.
Offline requests without `ms` retain the fixed simulation-count behaviour.
"""
import json
import sys
import threading
import time


class SearchCancelled(Exception):
    pass


class BudgetExpired(Exception):
    pass


CURRENT = None


class Control:
    def __init__(self, request):
        self.cancelled = threading.Event()
        self.started = time.perf_counter()
        ms = request.get('ms')
        self.deadline = self.started + max(1, ms) / 1000 if ms is not None else float('inf')
        # Leave time for the existing root safeguards and response encoding.
        self.search_deadline = self.deadline - min(.035, max(0, (ms or 0) / 1000 * .12))
        self.searching = False
        self.fallback = None
        self.simulations = 0
        self.budget_limited = False

    def check(self):
        if self.cancelled.is_set():
            raise SearchCancelled()
        if not self.searching and self.fallback is not None and time.perf_counter() >= self.deadline:
            raise BudgetExpired()

    def stop(self):
        self.check()
        self.budget_limited = time.perf_counter() >= self.search_deadline
        return self.budget_limited


def checkpoint():
    if CURRENT is not None:
        CURRENT.check()


def timed_search(agent, state):
    if CURRENT is None:
        return agent.search(state)
    CURRENT.searching = True
    try:
        root = agent.search(state, stop=CURRENT.stop)
        CURRENT.simulations = agent.completed_simulations
        return root
    finally:
        CURRENT.searching = False


def remember_candidate(state, selected, root, to_action, value, legal_count):
    if CURRENT is None:
        return
    # Statistics belong exclusively to fully completed MCTS iterations.
    children = sorted(root.children, key=lambda c: c.visit_count, reverse=True) if root else []
    CURRENT.fallback = {
        'pv': [to_action(state, selected)], 'value': float(value[0][0]),
        'legalCount': legal_count, 'simulations': CURRENT.simulations,
        'mode': 'puct', 'budgetLimited': True,
        'diagnostics': {'rootChildren': [
            {'action': to_action(state, c.action), 'visits': c.visit_count,
             'qFromRoot': -c.q_value if c.visit_count else None, 'prior': c.base_prior}
            for c in children[:12]]},
    }


def install_checkpoints(state_class):
    original = state_class.next
    def next_checked(self, *args, **kwargs):
        checkpoint()
        return original(self, *args, **kwargs)
    state_class.next = next_checked


def serve(choose, namespace):
    global CURRENT
    condition = threading.Condition()
    slot = None
    active = None
    eof = False

    def read_requests():
        nonlocal slot, active, eof
        try:
            for line in sys.stdin:
                try:
                    request = json.loads(line)
                except (ValueError, TypeError):
                    continue
                with condition:
                    if request.get('cancel'):
                        if active is not None and active[0] == request.get('id'):
                            active[1].cancelled.set()
                        if slot is not None and slot[0].get('id') == request.get('id'):
                            slot = None
                    else:
                        if active is not None:
                            active[1].cancelled.set()
                        slot = (request, Control(request))
                    condition.notify()
        finally:
            with condition:
                eof = True
                condition.notify()

    print(json.dumps({'ready': True}), flush=True)
    threading.Thread(target=read_requests, daemon=True).start()
    while True:
        with condition:
            condition.wait_for(lambda: slot is not None or eof)
            if slot is None:
                return
            request, control = slot
            slot = None
            active = (request.get('id'), control)
        CURRENT = control
        try:
            control.check()
            result = choose(request['state'], set(request['allowed']), request.get('history', []))
        except BudgetExpired:
            result = control.fallback
        except SearchCancelled:
            namespace['PERSISTENT_AGENT'] = None
            result = None
        except Exception as error:
            import traceback
            traceback.print_exc(file=sys.stderr)
            result = {'error': str(error)}
        finally:
            CURRENT = None
        with condition:
            if result is not None and not control.cancelled.is_set():
                result.update(id=request.get('id'), done=True,
                              elapsedMs=(time.perf_counter() - control.started) * 1000)
                if 'error' not in result:
                    result['simulations'] = control.simulations
                    result['budgetLimited'] = bool(result.get('budgetLimited') or control.budget_limited)
                print(json.dumps(result), flush=True)
            active = None
