import { useCallback, useMemo, useRef } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { endpoints, type GenerationData } from './api/endpoints';
import { client } from './api/client';
import { generationsQuery, keys, queryClient } from './api/queries';
import { collectRuns, replaceById, type Runs, type Scenario } from './model';
import { useSync } from './providers/sync';
export const useRuns = (): Runs => {
  const { spaceId } = useSync();
  const { data } = useQuery(generationsQuery(spaceId));
  return useMemo(() => collectRuns(data), [data]);
};

export function useStart(nodeId: string) {
  const { spaceId, runGraphOp } = useSync();
  const key = useRef<string | null>(null);

  const mutation = useMutation({
    mutationFn: ({ scenario, idempotencyKey }: { scenario: Scenario; idempotencyKey: string }) =>
      runGraphOp((graphETag) =>
        client(endpoints.createGeneration, {
          spaceId,
          nodeId,
          graphETag,
          scenario,
          idempotencyKey,
        }),
      ),
    retry: (count, error) => error.retriable && count < 2,
    retryDelay: (count) => 400 * 2 ** count,
    onSuccess: (data) => {
      key.current = null;
      queryClient.setQueryData(keys.generation(spaceId, data.id), data);
      queryClient.setQueryData(keys.generations(spaceId), (prev: GenerationData[] | undefined) =>
        prev ? replaceById(prev, data) : [data],
      );
    },
  });

  const start = useCallback(
    (scenario: Scenario) => {
      if (!key.current || mutation.error?.kind !== 'network') key.current = crypto.randomUUID();
      return mutation.mutateAsync({ scenario, idempotencyKey: key.current }).catch(() => undefined);
    },
    [mutation.mutateAsync, mutation.error],
  );

  return { start, pending: mutation.isPending, error: mutation.error ?? null };
}
