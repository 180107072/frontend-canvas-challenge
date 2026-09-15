import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canConnect,
  chainOf,
  collectRuns,
  fromPayload,
  indexOf,
  reconcile,
  replaceById,
  toPayload,
  withDefaults,
} from '../src/model.ts';
import type { Edge } from '@xyflow/react';
import type { GenerationData, GraphData } from '@canvas/contracts';
import type { FlowNode, Scenario } from '../src/model.ts';

const at = { x: 0, y: 0 };
const prompt = (id: string, text = ''): FlowNode => ({
  id,
  type: 'prompt',
  position: at,
  data: { text },
});
const generator = (id: string, scenario: Scenario = 'success'): FlowNode => ({
  id,
  type: 'generator',
  position: at,
  data: { label: 'Генератор', scenario },
});
const result = (id: string): FlowNode => ({
  id,
  type: 'result',
  position: at,
  data: { label: 'Результат' },
});
const edge = (id: string, source: string, target: string): Edge => ({ id, source, target });

const nodes = [prompt('p', 'горы'), generator('g'), result('r')];

test('connection rule allows only prompt -> generator -> result', () => {
  const index = indexOf(nodes, []);
  assert.equal(canConnect(index, 'p', 'g'), true);
  assert.equal(canConnect(index, 'g', 'r'), true);
  assert.equal(canConnect(index, 'p', 'r'), false);
  assert.equal(canConnect(index, 'r', 'g'), false);
  assert.equal(canConnect(index, 'g', 'g'), false);
});

test('an input takes one edge and a generator one result', () => {
  const index = indexOf(nodes, [edge('e1', 'p', 'g'), edge('e2', 'g', 'r')]);
  assert.equal(canConnect(index, 'p', 'g'), false);
  const extra = [...nodes, result('r2')];
  assert.equal(canConnect(indexOf(extra, [edge('e2', 'g', 'r')]), 'g', 'r2'), false);
});

test('a prompt may feed several generators', () => {
  const many = [...nodes, generator('g2')];
  assert.equal(canConnect(indexOf(many, [edge('e1', 'p', 'g')]), 'p', 'g2'), true);
});

test('chain reports the first missing piece', () => {
  assert.equal(chainOf(indexOf(nodes, []), 'g').problem, 'no-prompt');
  assert.equal(chainOf(indexOf(nodes, [edge('e1', 'p', 'g')]), 'g').problem, 'no-result');
  const blank = [prompt('p', '  '), generator('g'), result('r')];
  const wired = [edge('e1', 'p', 'g'), edge('e2', 'g', 'r')];
  assert.equal(chainOf(indexOf(blank, wired), 'g').problem, 'empty-prompt');
  const ready = chainOf(indexOf(nodes, wired), 'g');
  assert.deepEqual([ready.prompt, ready.resultId, ready.problem], ['горы', 'r', undefined]);
});

test('index is reused while both arrays keep their identity', () => {
  const edges = [edge('e1', 'p', 'g')];
  assert.equal(indexOf(nodes, edges), indexOf(nodes, edges));
  assert.notEqual(indexOf(nodes, edges), indexOf(nodes, [...edges]));
});

test('payload carries only schema fields', () => {
  const dirty: FlowNode[] = [
    { ...nodes[0], selected: true, dragging: true, measured: { width: 1 } },
  ];
  const payload = toPayload(dirty, [edge('e1', 'p', 'g')], { x: 1, y: 2, zoom: 1 });
  assert.deepEqual(Object.keys(payload.nodes[0]), ['id', 'type', 'position', 'data']);
  assert.deepEqual(Object.keys(payload.edges[0]), ['id', 'source', 'target']);
});

test('client-only data keys never reach the server payload', () => {
  const payload = toPayload([generator('g', 'failure')], [], { x: 0, y: 0, zoom: 1 });
  assert.deepEqual(payload.nodes[0].data, { label: 'Генератор' });
});

test('adopting server data fills client-only keys from the kind defaults', () => {
  const graph: GraphData = {
    nodes: [{ id: 'g', type: 'generator', position: { x: 0, y: 0 }, data: { label: 'Генератор' } }],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
  const [adopted] = fromPayload(graph).nodes;
  assert.deepEqual(adopted.data, { label: 'Генератор', scenario: 'success' });
});

test('reconcile decides what to do with a draft when the server graph arrives', () => {
  const server = '"abc"';
  assert.equal(reconcile({ dirty: false, etag: server }, server), 'keep');
  assert.equal(reconcile({ dirty: false, etag: '"old"' }, server), 'adopt');
  assert.equal(reconcile({ dirty: false, etag: null }, server), 'adopt');
  assert.equal(reconcile({ dirty: true, etag: server }, server), 'save');
  assert.equal(reconcile({ dirty: true, etag: '"old"' }, server), 'conflict');
  assert.equal(reconcile({ dirty: true, etag: null }, server), 'conflict');
});

const run = (
  id: string,
  nodeId: string,
  resultNodeId: string,
  status: GenerationData['status'],
): GenerationData => ({
  id,
  spaceId: 'space',
  nodeId,
  resultNodeId,
  prompt: 'горы',
  graphETag: '"abc"',
  scenario: 'success',
  status,
  createdAt: '2026-01-01T00:00:00.000Z',
  imageUrl: status === 'succeeded' ? '/assets/demo.svg' : null,
  failureCode: status === 'failed' ? 'SIMULATED_FAILURE' : null,
  links: {},
});

test('newest-first list collapses to latest attempt and newest result', () => {
  const runs = collectRuns([
    run('3', 'g', 'r', 'processing'),
    run('2', 'g', 'r', 'succeeded'),
    run('1', 'g', 'r', 'succeeded'),
    run('0', 'g2', 'r2', 'failed'),
  ]);
  assert.equal(runs.byNode.get('g')?.id, '3');
  assert.equal(runs.byNode.get('g2')?.id, '0');
  assert.equal(runs.byResult.get('r')?.id, '2');
  assert.deepEqual(runs.active, ['3']);
});

test('runs index is built once per list and shared by every caller', () => {
  const list = [run('1', 'g', 'r', 'processing')];
  assert.equal(collectRuns(list), collectRuns(list));
  assert.notEqual(collectRuns(list), collectRuns([...list]));
});

test('a node stored without a field gets the kind default, not undefined', () => {
  const stored = [
    { id: 'g', type: 'generator' as const, position: { x: 0, y: 0 }, data: { label: 'Ген' } },
  ];
  const [filled] = withDefaults(stored);
  assert.ok(filled.type === 'generator');
  assert.equal(filled.data.scenario, 'success');
  assert.equal(filled.data.label, 'Ген');
});

test('replaceById swaps in place and prepends unknown ids', () => {
  const list = [run('1', 'g', 'r', 'processing')];
  const settled = run('1', 'g', 'r', 'succeeded');
  assert.equal(replaceById(list, list[0]), list);
  assert.deepEqual(replaceById(list, settled), [settled]);
  assert.equal(replaceById(list, run('2', 'g', 'r', 'processing')).length, 2);
});
