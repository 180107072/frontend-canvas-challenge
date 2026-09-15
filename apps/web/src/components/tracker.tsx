import { useEffect } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { GenerationData } from '../api/endpoints';
import { generationQuery, keys, queryClient, useConfig } from '../api/queries';
import { replaceById } from '../model';
import { useRuns } from '../generations';
import { useSync } from '../providers/sync';
export function Tracker() {
  const { spaceId } = useSync();
  const pollMs = useConfig()?.pollIntervalMs ?? 500;
  const { active } = useRuns();

  const results = useQueries({
    queries: active.map((id) => generationQuery(spaceId, id, pollMs)),
  });

  let settled: GenerationData[] | null = null;
  for (const { data } of results)
    if (data && data.status !== 'processing') (settled ??= []).push(data);
  const settledIds = settled ? settled.join(',') : '';

  useEffect(() => {
    if (!settled) return;
    for (const run of settled)
      queryClient.setQueryData(keys.generations(spaceId), (prev: GenerationData[] | undefined) =>
        prev ? replaceById(prev, run) : prev,
      );
  }, [settledIds, spaceId]);

  return null;
}
