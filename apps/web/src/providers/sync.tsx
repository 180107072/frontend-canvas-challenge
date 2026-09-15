import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { endpoints, type VersionedGraph } from '../api/endpoints';
import { asRequestError, client, RequestError } from '../api/client';
import { createSaveQueue, type SaveQueue } from '../lib/save-queue';
import { reconcile, toPayload } from '../model';
import { graphQuery, queryClient, useConfig } from '../api/queries';
import { isDirty, type GraphStore } from '../store';
import { useGraph, useGraphStore } from './graph-store';
import { saveStateOf, type SaveState } from '../save-status';
interface SyncActions {
  spaceId: string;
  reread: () => Promise<void>;
  retrySave: () => void;
  runGraphOp: <T>(fn: (etag: string) => Promise<T>) => Promise<T>;
}

interface SaveView {
  state: SaveState;
  error: RequestError | null;
  loadError: RequestError | null;
}

const SyncContext = createContext<SyncActions | null>(null);
const SaveContext = createContext<SaveView>({
  state: saveStateOf({ conflict: false, saving: false, failed: false, dirty: false }),
  error: null,
  loadError: null,
});

export const useSync = () => {
  const value = useContext(SyncContext);
  if (!value) throw new Error('useSync outside SyncProvider');
  return value;
};

export const useSaveState = () => useContext(SaveContext);
function useSaveOnEdit(store: GraphStore, queue: SaveQueue) {
  useEffect(() => {
    const off = store.subscribe((state, previous) => {
      if (state.revision.current !== previous.revision.current) queue.schedule();
    });
    return () => {
      off();
      queue.cancel();
    };
  }, [queue, store]);
}
function useGraphSaver(store: GraphStore, spaceId: string, debounceMs: number) {
  const save = useMutation({
    mutationFn: async () => {
      const state = store.getState();
      if (!state.etag || !isDirty(state)) return;
      const revision = state.revision.current;
      const payload = toPayload(state.nodes, state.edges, state.viewport);
      try {
        const reply = await client(endpoints.saveGraph, {
          spaceId,
          graph: payload,
          etag: state.etag,
        });
        state.commit(revision, reply.etag ?? state.etag);
      } catch (cause) {
        const error = asRequestError(cause);
        if (error.status === 412) throw error;
        if (error.kind !== 'network') throw error;
        const current = await client(endpoints.graph, { spaceId });
        if (JSON.stringify(current.data) !== JSON.stringify(payload)) throw error;
        state.commit(revision, current.etag ?? state.etag);
      }
    },
  });
  const runSave = useRef<() => Promise<void>>(async () => {});
  runSave.current = async () => {
    await save.mutateAsync();
  };
  const queue = useMemo(
    () => createSaveQueue(debounceMs, () => runSave.current()),
    [debounceMs, spaceId],
  );

  useSaveOnEdit(store, queue);
  return { save, queue };
}
function useDraftReconciliation(store: GraphStore, queue: SaveQueue, reply?: VersionedGraph) {
  const [staleDraft, setStaleDraft] = useState(false);

  useEffect(() => {
    if (!reply?.etag) return;
    const state = store.getState();
    switch (reconcile({ dirty: isDirty(state), etag: state.etag }, reply.etag)) {
      case 'keep':
        return;
      case 'adopt':
        return state.adopt(reply.data, reply.etag);
      case 'save':
        return queue.schedule();
      case 'conflict':
        return setStaleDraft(true);
    }
  }, [reply, queue, store]);

  return [staleDraft, setStaleDraft] as const;
}

export function SyncProvider({ spaceId, children }: { spaceId: string; children: ReactNode }) {
  const debounceMs = useConfig()?.debounceMs ?? 500;
  const graph = useQuery(graphQuery(spaceId));
  const store = useGraphStore();

  const { save, queue } = useGraphSaver(store, spaceId, debounceMs);
  const [staleDraft, setStaleDraft] = useDraftReconciliation(store, queue, graph.data);

  const runGraphOp = useCallback(
    <T,>(fn: (etag: string) => Promise<T>) =>
      queue.run(() => {
        const etag = store.getState().etag;
        if (!etag)
          throw new RequestError('http', 'GRAPH_NOT_LOADED', 'Граф ещё не загружен с сервера.');
        return fn(etag);
      }),
    [queue, store],
  );

  const reread = useCallback(async () => {
    const reply = await queryClient.fetchQuery({ ...graphQuery(spaceId), staleTime: 0 });
    if (!reply.etag) return;
    store.getState().adopt(reply.data, reply.etag);
    setStaleDraft(false);
    save.reset();
  }, [spaceId, save.reset, store]);

  const retrySave = useCallback(() => save.mutate(), [save.mutate]);
  const actions = useMemo<SyncActions>(
    () => ({ spaceId, reread, retrySave, runGraphOp }),
    [spaceId, reread, retrySave, runGraphOp],
  );

  const dirty = useGraph(isDirty);
  const saveView = useMemo<SaveView>(
    () => ({
      state: saveStateOf({
        conflict: staleDraft || save.error?.status === 412,
        saving: save.isPending,
        failed: save.isError,
        dirty,
      }),
      error: save.error ?? null,
      loadError: graph.error ?? null,
    }),
    [staleDraft, dirty, save.isPending, save.isError, save.error, graph.error],
  );

  return (
    <SyncContext.Provider value={actions}>
      <SaveContext.Provider value={saveView}>{children}</SaveContext.Provider>
    </SyncContext.Provider>
  );
}
