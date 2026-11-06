"""Bounded exact-input ONNX memoization; never reuses evaluations across inputs."""
from collections import OrderedDict


class CachedInference:
    def __init__(self, session, capacity=2048):
        self.session = session
        self.capacity = capacity
        self.entries = OrderedDict()

    def run(self, output_names, inputs):
        tensor = inputs['input']
        key = (tuple(tensor.shape), tensor.dtype.str, tensor.tobytes())
        if key in self.entries:
            result = self.entries.pop(key)
            self.entries[key] = result
            return result
        result = self.session.run(output_names, inputs)
        self.entries[key] = result
        if len(self.entries) > self.capacity:
            self.entries.popitem(last=False)
        return result
