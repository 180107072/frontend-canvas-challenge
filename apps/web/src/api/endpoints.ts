import type { GenerationData, GraphData, SpaceData } from '@canvas/contracts';
import { BASE_URL, readData, type Endpoint, type RawReply } from './client';
import type { Scenario } from '../model';

export interface ApiConfig {
  debounceMs: number;
  pollIntervalMs: number;
  generationDelayMs: number;
  maxNodes: number;
  maxEdges: number;
}

export type { GenerationData, GraphData, SpaceData };
export interface VersionedGraph {
  data: GraphData;
  etag: string | undefined;
}

const readGraph = (reply: RawReply): VersionedGraph => ({
  data: reply.data as GraphData,
  etag: reply.header('ETag') ?? undefined,
});

const graphPath = ({ spaceId }: { spaceId: string }) => `/api/spaces/${spaceId}/graph`;
export const endpoints = {
  config: {
    path: () => '/api/config',
    read: readData<ApiConfig>,
  } satisfies Endpoint<void, ApiConfig>,

  spaces: {
    path: () => '/api/spaces',
    read: readData<SpaceData[]>,
  } satisfies Endpoint<void, SpaceData[]>,

  createSpace: {
    method: 'POST',
    path: () => '/api/spaces',
    body: ({ title }) => ({ title }),
    read: readData<SpaceData>,
  } satisfies Endpoint<{ title: string }, SpaceData>,

  graph: {
    path: graphPath,
    read: readGraph,
  } satisfies Endpoint<{ spaceId: string }, VersionedGraph>,

  saveGraph: {
    method: 'PUT',
    path: graphPath,
    body: ({ graph }) => graph,
    headers: ({ etag }) => ({ 'If-Match': etag }),
    read: readGraph,
  } satisfies Endpoint<{ spaceId: string; graph: GraphData; etag: string }, VersionedGraph>,

  generations: {
    path: ({ spaceId }) => `/api/spaces/${spaceId}/generations`,
    read: readData<GenerationData[]>,
  } satisfies Endpoint<{ spaceId: string }, GenerationData[]>,

  generation: {
    path: ({ spaceId, generationId }) => `/api/spaces/${spaceId}/generations/${generationId}`,
    read: readData<GenerationData>,
  } satisfies Endpoint<{ spaceId: string; generationId: string }, GenerationData>,

  createGeneration: {
    method: 'POST',
    path: ({ spaceId }) => `/api/spaces/${spaceId}/generations`,
    body: ({ nodeId, graphETag, scenario }) => ({ nodeId, graphETag, scenario }),
    headers: ({ idempotencyKey }) => ({ 'Idempotency-Key': idempotencyKey }),
    read: readData<GenerationData>,
  } satisfies Endpoint<
    {
      spaceId: string;
      nodeId: string;
      graphETag: string;
      scenario: Scenario;
      idempotencyKey: string;
    },
    GenerationData
  >,
};

export const assetUrl = (path: string) => `${BASE_URL}${path}`;
