import { QueryClient, queryOptions, useQuery } from '@tanstack/react-query';
import { endpoints } from './endpoints';
import { client } from './client';
import type { RequestError } from './client';

declare module '@tanstack/react-query' {
  interface Register {
    defaultError: RequestError;
  }
}
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => error.retriable && count < 2,
      retryDelay: (count) => 400 * 2 ** count,
    },
    mutations: { retry: false },
  },
});

export const keys = {
  config: ['config'] as const,
  spaces: ['spaces'] as const,
  graph: (spaceId: string) => ['graph', spaceId] as const,
  generations: (spaceId: string) => ['generations', spaceId] as const,
  generation: (spaceId: string, id: string) => ['generation', spaceId, id] as const,
};

export const configQuery = queryOptions({
  queryKey: keys.config,
  queryFn: ({ signal }) => client(endpoints.config, undefined, signal),
  staleTime: Infinity,
});

export const useConfig = () => useQuery(configQuery).data;

export const spacesQuery = queryOptions({
  queryKey: keys.spaces,
  queryFn: ({ signal }) => client(endpoints.spaces, undefined, signal),
});
export const graphQuery = (spaceId: string) =>
  queryOptions({
    queryKey: keys.graph(spaceId),
    queryFn: ({ signal }) => client(endpoints.graph, { spaceId }, signal),
    staleTime: Infinity,
    gcTime: 0,
  });

export const generationsQuery = (spaceId: string) =>
  queryOptions({
    queryKey: keys.generations(spaceId),
    queryFn: ({ signal }) => client(endpoints.generations, { spaceId }, signal),
    staleTime: Infinity,
  });
export const generationQuery = (spaceId: string, generationId: string, pollMs: number) =>
  queryOptions({
    queryKey: keys.generation(spaceId, generationId),
    queryFn: ({ signal }) => client(endpoints.generation, { spaceId, generationId }, signal),
    refetchInterval: ({ state }) => (state.data?.status === 'processing' ? pollMs : false),
    staleTime: 0,
  });
