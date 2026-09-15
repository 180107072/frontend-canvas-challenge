import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type Viewport,
  type XYPosition,
} from '@xyflow/react';
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { persist } from 'zustand/middleware';
import { throttledStorage } from './lib/storage';
import type { GraphData } from '@canvas/contracts';
import {
  canConnect,
  createNode,
  fromPayload,
  indexOf,
  KINDS,
  type FlowNode,
  type NodeKind,
  type NodePatch,
} from './model';

const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

const bump = (r: Revision): Revision => ({ current: r.current + 1, saved: r.saved });
const keysOf = <T extends object>(value: T) => Object.keys(value) as (keyof T)[];
export interface Revision {
  current: number;
  saved: number;
}

export interface GraphState {
  nodes: FlowNode[];
  edges: Edge[];
  viewport: Viewport;
  revision: Revision;
  etag: string | null;

  onNodesChange: (changes: NodeChange<FlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  onViewportChange: (viewport: Viewport) => void;

  addNode: (kind: NodeKind, position: XYPosition) => void;
  setValue: (id: string, patch: NodePatch) => void;
  onMoveEnd: (viewport: Viewport) => void;

  adopt: (graph: GraphData, etag: string) => void;
  commit: (revision: number, etag: string) => void;
}
export const createGraphStore = (spaceId: string) =>
  createStore<GraphState>()(
    persist(
      (set) => ({
        nodes: [],
        edges: [],
        viewport: DEFAULT_VIEWPORT,
        revision: { current: 0, saved: 0 },
        etag: null,

        onNodesChange(changes) {
          const saveable = changes.some(
            (change) => change.type !== 'dimensions' && change.type !== 'select',
          );
          set((s) => ({
            nodes: applyNodeChanges(changes, s.nodes) as FlowNode[],
            revision: saveable ? bump(s.revision) : s.revision,
          }));
        },

        onEdgesChange(changes) {
          set((s) => ({
            edges: applyEdgeChanges(changes, s.edges),
            revision: changes.every((change) => change.type === 'select')
              ? s.revision
              : bump(s.revision),
          }));
        },

        onConnect({ source, target }) {
          set((s) => {
            if (!canConnect(indexOf(s.nodes, s.edges), source, target)) return s;
            return {
              edges: addEdge({ id: crypto.randomUUID(), source, target }, s.edges),
              revision: bump(s.revision),
            };
          });
        },

        addNode(kind, position) {
          set((s) => ({
            nodes: s.nodes.concat(createNode(kind, position)),
            revision: bump(s.revision),
          }));
        },

        setValue(id, patch) {
          set((s) => {
            const at = s.nodes.findIndex((node) => node.id === id);
            if (at === -1) return s;
            const node = s.nodes[at];
            const data: NodePatch = node.data;
            const saved: readonly string[] = KINDS[node.type].saved;
            let changed = false;
            let persists = false;
            for (const key of keysOf(patch)) {
              if (Object.is(data[key], patch[key])) continue;
              changed = true;
              if (saved.includes(key)) persists = true;
            }
            if (!changed) return s;

            const nodes = s.nodes.slice();
            nodes[at] = { ...node, data: { ...node.data, ...patch } } as FlowNode;
            return { nodes, revision: persists ? bump(s.revision) : s.revision };
          });
        },
        onViewportChange(viewport) {
          set({ viewport });
        },
        onMoveEnd(viewport) {
          set((s) => ({ viewport, revision: bump(s.revision) }));
        },
        adopt(graph, etag) {
          set((s) => ({
            ...fromPayload(graph),
            etag,
            revision: { current: s.revision.current + 1, saved: s.revision.current + 1 },
          }));
        },

        commit(revision, etag) {
          set((s) => ({ revision: { current: s.revision.current, saved: revision }, etag }));
        },
      }),
      {
        name: `canvas:draft:${spaceId}`,
        storage: throttledStorage(),
        partialize: (s) => ({
          nodes: s.nodes,
          edges: s.edges,
          viewport: s.viewport,
          revision: s.revision,
          etag: s.etag,
        }),
      },
    ),
  );

export type GraphStore = ReturnType<typeof createGraphStore>;

export const isDirty = (s: GraphState) => s.revision.current !== s.revision.saved;
interface Session {
  spaceId: string | null;
  open: (spaceId: string) => void;
  close: () => void;
}

export const sessionStore = createStore<Session>()(
  persist(
    (set) => ({
      spaceId: null,
      open: (spaceId) => set({ spaceId }),
      close: () => set({ spaceId: null }),
    }),
    { name: 'canvas:session', partialize: (s) => ({ spaceId: s.spaceId }) },
  ),
);

export const useSession = <T>(select: (state: Session) => T) => useStore(sessionStore, select);
