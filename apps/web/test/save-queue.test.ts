import assert from 'node:assert/strict';
import test from 'node:test';
import { createSaveQueue } from '../src/lib/save-queue.ts';

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('a burst of edits produces one save after the pause', async () => {
  const log: string[] = [];
  const queue = createSaveQueue(30, async () => void log.push('save'));
  for (let i = 0; i < 8; i += 1) queue.schedule();
  assert.equal(queue.pending(), true);
  await tick(60);
  assert.deepEqual(log, ['save']);
  assert.equal(queue.pending(), false);
});

test('saves never overlap, and run in the order they were queued', async () => {
  const log: string[] = [];
  let open = 0;
  let overlapped = false;
  let n = 0;
  const queue = createSaveQueue(5, async () => {
    open += 1;
    if (open > 1) overlapped = true;
    const id = (n += 1);
    log.push(`start ${id}`);
    await tick(20);
    log.push(`end ${id}`);
    open -= 1;
  });

  queue.schedule();
  await tick(10);
  queue.schedule();
  await tick(10);
  queue.schedule();
  await tick(120);

  assert.equal(overlapped, false);
  assert.deepEqual(log, ['start 1', 'end 1', 'start 2', 'end 2', 'start 3', 'end 3']);
});

test('run() saves first, and nothing slips between the save and the task', async () => {
  const log: string[] = [];
  const queue = createSaveQueue(5, async () => {
    log.push('save');
    await tick(20);
  });

  queue.schedule();
  const result = queue.run(async () => {
    log.push('task');
    return 'done';
  });
  await tick(5);
  queue.schedule();

  assert.equal(await result, 'done');
  await tick(40);
  assert.deepEqual(log.slice(0, 3), ['save', 'task', 'save']);
  assert.equal(log.indexOf('task') - log.indexOf('save'), 1);
});

test('run() does not run its task when the save fails', async () => {
  let ran = false;
  const queue = createSaveQueue(5, async () => {
    throw new Error('412');
  });
  await assert.rejects(
    queue.run(async () => {
      ran = true;
    }),
  );
  assert.equal(ran, false);
});

test('a failed save does not wedge the queue', async () => {
  const log: string[] = [];
  let fail = true;
  const queue = createSaveQueue(5, async () => {
    if (fail) {
      fail = false;
      log.push('boom');
      throw new Error('network');
    }
    log.push('save');
  });

  queue.schedule();
  await tick(30);
  queue.schedule();
  await tick(30);
  assert.deepEqual(log, ['boom', 'save']);
});

test('cancel drops a pending save', async () => {
  const log: string[] = [];
  const queue = createSaveQueue(20, async () => void log.push('save'));
  queue.schedule();
  queue.cancel();
  await tick(50);
  assert.deepEqual(log, []);
});
