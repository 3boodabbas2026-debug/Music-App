"""In-memory pub/sub for job status. One process only.

This is the seam to swap for Redis pub/sub if the job engine ever moves to
arq/multi-worker (see run_download_job in job_engine.py for the matching seam
on the execution side).
"""
import asyncio
from collections import defaultdict


class JobBroadcaster:
    def __init__(self) -> None:
        self._subscribers: dict[str, list[asyncio.Queue]] = defaultdict(list)

    def subscribe(self, job_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        self._subscribers[job_id].append(queue)
        return queue

    def unsubscribe(self, job_id: str, queue: asyncio.Queue) -> None:
        subs = self._subscribers.get(job_id, [])
        if queue in subs:
            subs.remove(queue)
        if not subs:
            self._subscribers.pop(job_id, None)

    async def publish(self, job_id: str, payload: dict) -> None:
        for queue in list(self._subscribers.get(job_id, [])):
            await queue.put(payload)


broadcaster = JobBroadcaster()
