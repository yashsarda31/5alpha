"""Bounded process-local cache; successful snapshots only, shared in-flight work."""
import asyncio
from collections import OrderedDict
from copy import deepcopy
import time


class FundamentalsCache:
    def __init__(self, ttl=600, limit=128, timeout=70):
        self.ttl, self.limit, self.timeout = ttl, limit, timeout
        self.values = OrderedDict()
        self.pending = {}

    async def get(self, symbol, loader):
        now = time.monotonic()
        cached = self.values.get(symbol)
        if cached and now - cached[0] < self.ttl:
            self.values.move_to_end(symbol)
            return deepcopy(cached[1])
        self.values.pop(symbol, None)
        if symbol not in self.pending:
            if len(self.pending) >= 16:
                raise RuntimeError('Company research is busy. Please retry shortly.')

            async def load():
                try:
                    result = await asyncio.wait_for(loader(), self.timeout)
                    self.values[symbol] = (time.monotonic(), deepcopy(result))
                    while len(self.values) > self.limit:
                        self.values.popitem(last=False)
                    return result
                finally:
                    self.pending.pop(symbol, None)

            task = asyncio.create_task(load())
            # Retrieve exceptions even if every browser disconnects.
            task.add_done_callback(lambda task: task.exception() if not task.cancelled() else None)
            self.pending[symbol] = task
        return deepcopy(await asyncio.shield(self.pending[symbol]))
