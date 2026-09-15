"""Tests for server task scheduling."""

import asyncio

from diplomacy.server.scheduler import Scheduler


def test_rejected_immediate_task_can_be_scheduled_again():
    """A failed validator must not leave a consumed task marked as queued."""

    async def run_test():
        ready = False
        processed = []

        def process(data):
            processed.append(data)
            return True

        scheduler = Scheduler(1, process)
        worker = asyncio.create_task(scheduler.process_tasks())
        try:
            await scheduler.no_wait("game", 0, lambda _: ready)
            await scheduler.tasks_queue.join()

            assert not await scheduler.has_data("game")
            assert processed == []

            ready = True
            await scheduler.no_wait("game", 0, lambda _: ready)
            await scheduler.tasks_queue.join()

            assert not await scheduler.has_data("game")
            assert processed == ["game"]
        finally:
            worker.cancel()
            try:
                await worker
            except asyncio.CancelledError:
                pass

    asyncio.run(run_test())
