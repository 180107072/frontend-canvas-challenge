import { createContext, useContext, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { createGraphStore, type GraphState, type GraphStore } from '../store';

const GraphStoreContext = createContext<GraphStore | null>(null);
export function GraphStoreProvider({
  spaceId,
  children,
}: {
  spaceId: string;
  children: ReactNode;
}) {
  const [store] = useState(() => createGraphStore(spaceId));
  return <GraphStoreContext.Provider value={store}>{children}</GraphStoreContext.Provider>;
}

export const useGraphStore = () => {
  const store = useContext(GraphStoreContext);
  if (!store) throw new Error('useGraphStore outside GraphStoreProvider');
  return store;
};

export const useGraph = <T,>(select: (state: GraphState) => T) => useStore(useGraphStore(), select);
