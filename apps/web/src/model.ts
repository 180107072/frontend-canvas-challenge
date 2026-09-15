import type { Edge, Node, Viewport } from '@xyflow/react';
import type { GenerationData, GraphData, NodeData } from '@canvas/contracts';

export type NodeKind = NodeData['type'];
export type Scenario = 'success' | 'failure';

export interface DataByKind {
  prompt: { text: string };
  generator: { label: string; scenario?: Scenario };
  result: { label: string };
}

export type DataOf<K extends NodeKind> = DataByKind[K];
export type NodeOf<K extends NodeKind> = Node<DataByKind[K], K>;

export type PromptNode = NodeOf<'prompt'>;
export type GeneratorNode = NodeOf<'generator'>;
export type ResultNode = NodeOf<'result'>;
export type FlowNode = PromptNode | GeneratorNode | ResultNode;
export type NodePatch = Partial<DataByKind[NodeKind]>;

interface KindSpec<K extends NodeKind> {
  title: string;
  feeds: NodeKind | null;
  hasTarget: boolean;
  saved: readonly (keyof DataOf<K>)[];
  create: () => DataOf<K>;
}

export const KINDS: { [K in NodeKind]: KindSpec<K> } = {
  prompt: {
    title: 'Текст',
    feeds: 'generator',
    hasTarget: false,
    saved: ['text'],
    create: () => ({ text: '' }),
  },
  generator: {
    title: 'Генератор',
    feeds: 'result',
    hasTarget: true,
    saved: ['label'],
    create: () => ({ label: 'Генератор', scenario: 'success' }),
  },
  result: {
    title: 'Результат',
    feeds: null,
    hasTarget: true,
    saved: ['label'],
    create: () => ({ label: 'Результат' }),
  },
};

export const KIND_LIST = Object.keys(KINDS) as NodeKind[];

export const createNode = (type: NodeKind, position: { x: number; y: number }): FlowNode =>
  ({ id: crypto.randomUUID(), type, position, data: KINDS[type].create() }) as FlowNode;

export interface GraphIndex {
  byId: ReadonlyMap<string, FlowNode>;
  incoming: ReadonlyMap<string, Edge>;
  resultOf: ReadonlyMap<string, string>;
}

const cache = new WeakMap<readonly FlowNode[], { edges: readonly Edge[]; index: GraphIndex }>();
export const indexOf = (nodes: readonly FlowNode[], edges: readonly Edge[]): GraphIndex => {
  const hit = cache.get(nodes);
  if (hit && hit.edges === edges) return hit.index;

  const byId = new Map<string, FlowNode>();
  for (const node of nodes) byId.set(node.id, node);

  const incoming = new Map<string, Edge>();
  const resultOf = new Map<string, string>();
  for (const edge of edges) {
    incoming.set(edge.target, edge);
    if (byId.get(edge.source)?.type === 'generator') resultOf.set(edge.source, edge.target);
  }

  const index = { byId, incoming, resultOf };
  cache.set(nodes, { edges, index });
  return index;
};
export const canConnect = (index: GraphIndex, source: string, target: string) => {
  if (source === target) return false;
  const from = index.byId.get(source);
  const to = index.byId.get(target);
  if (!from || !to || KINDS[from.type].feeds !== to.type) return false;
  if (index.incoming.has(target)) return false;
  return !(from.type === 'generator' && index.resultOf.has(source));
};

export type ChainProblem = 'not-generator' | 'no-prompt' | 'empty-prompt' | 'no-result';

export interface Chain {
  resultId?: string;
  prompt?: string;
  problem?: ChainProblem;
}
export const chainOf = (index: GraphIndex, generatorId: string): Chain => {
  const node = index.byId.get(generatorId);
  if (node?.type !== 'generator') return { problem: 'not-generator' };
  const resultId = index.resultOf.get(generatorId);
  const source = index.incoming.get(generatorId)?.source;
  const from = source === undefined ? undefined : index.byId.get(source);
  if (from?.type !== 'prompt') return { resultId, problem: 'no-prompt' };
  const prompt = from.data.text.trim();
  if (!prompt) return { resultId, problem: 'empty-prompt' };
  if (!resultId) return { prompt, problem: 'no-result' };
  return { resultId, prompt };
};

export const CHAIN_MESSAGE: Record<ChainProblem, string> = {
  'not-generator': 'Запуск доступен только у генератора.',
  'no-prompt': 'Подключите к генератору ноду текста.',
  'empty-prompt': 'Введите описание изображения в текстовой ноде.',
  'no-result': 'Подключите к генератору ноду результата.',
};

export const toPayload = (
  nodes: readonly FlowNode[],
  edges: readonly Edge[],
  viewport: Viewport,
): GraphData => {
  const payloadNodes: GraphData['nodes'] = new Array(nodes.length);
  for (let i = 0; i < nodes.length; i += 1) {
    const { id, type, position, data } = nodes[i];
    const values: Record<string, unknown> = {};
    for (const key of KINDS[type].saved) values[key] = (data as Record<string, unknown>)[key];
    payloadNodes[i] = {
      id,
      type,
      position: { x: position.x, y: position.y },
      data: values,
    } as GraphData['nodes'][number];
  }
  const payloadEdges: GraphData['edges'] = new Array(edges.length);
  for (let i = 0; i < edges.length; i += 1) {
    const { id, source, target } = edges[i];
    payloadEdges[i] = { id, source, target };
  }
  return { nodes: payloadNodes, edges: payloadEdges, viewport };
};
export const fromPayload = (graph: GraphData) => ({
  nodes: graph.nodes.map((node) => ({
    ...node,
    data: { ...KINDS[node.type].create(), ...node.data },
  })) as FlowNode[],
  edges: graph.edges as Edge[],
  viewport: graph.viewport,
});
export type Reconciliation = 'keep' | 'adopt' | 'save' | 'conflict';
export const reconcile = (
  draft: { dirty: boolean; etag: string | null },
  serverETag: string,
): Reconciliation => {
  const sameVersion = draft.etag === serverETag;
  if (!draft.dirty) return sameVersion ? 'keep' : 'adopt';
  return sameVersion ? 'save' : 'conflict';
};

export interface Runs {
  byNode: ReadonlyMap<string, GenerationData>;
  byResult: ReadonlyMap<string, GenerationData>;
  active: string[];
}

export const NO_RUNS: Runs = { byNode: new Map(), byResult: new Map(), active: [] };
export const collectRuns = (list: readonly GenerationData[] | undefined): Runs => {
  if (!list) return NO_RUNS;
  const byNode = new Map<string, GenerationData>();
  const byResult = new Map<string, GenerationData>();
  const active: string[] = [];
  for (const run of list) {
    if (!byNode.has(run.nodeId)) byNode.set(run.nodeId, run);
    if (run.status === 'succeeded' && !byResult.has(run.resultNodeId))
      byResult.set(run.resultNodeId, run);
    if (run.status === 'processing') active.push(run.id);
  }
  return { byNode, byResult, active };
};
export const replaceById = (list: readonly GenerationData[], next: GenerationData) => {
  const at = list.findIndex((item) => item.id === next.id);
  if (at === -1) return [next, ...list];
  if (list[at] === next) return list as GenerationData[];
  const out = list.slice();
  out[at] = next;
  return out;
};
