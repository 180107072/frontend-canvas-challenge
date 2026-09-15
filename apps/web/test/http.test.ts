import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient, readData, RequestError, type Endpoint } from '../src/api/client.ts';

const reply = (body: unknown, init: ResponseInit = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

const echo: Endpoint<{ id: string }, unknown> = {
  method: 'PUT',
  path: ({ id }) => `/things/${id}`,
  body: ({ id }) => ({ id }),
  headers: ({ id }) => ({ 'If-Match': `"${id}"` }),
  read: readData,
};

const get: Endpoint<void, unknown> = { path: () => '/thing', read: readData };

test('the descriptor supplies method, path, body and its own headers', async () => {
  let seen: [string, RequestInit] | null = null;
  const client = createClient({
    baseUrl: 'http://api',
    fetch: async (url, init) => {
      seen = [url, init];
      return reply({ ok: true });
    },
  });

  await client(echo, { id: 'abc' });
  const [url, init] = seen!;
  assert.equal(url, 'http://api/things/abc');
  assert.equal(init.method, 'PUT');
  assert.equal(init.body, '{"id":"abc"}');
  const headers = init.headers as Record<string, string>;
  assert.equal(headers['If-Match'], '"abc"');
  assert.equal(headers['Content-Type'], 'application/json');
});

test('a GET carries no body and no Content-Type', async () => {
  let seen: RequestInit | null = null;
  const client = createClient({
    baseUrl: '',
    fetch: async (_u, init) => {
      seen = init;
      return reply({});
    },
  });
  await client(get, undefined);
  assert.equal(seen!.body, undefined);
  assert.equal((seen!.headers as Record<string, string>)['Content-Type'], undefined);
});

test('read() turns the raw reply into the endpoint’s own shape', async () => {
  const versioned: Endpoint<void, { data: unknown; etag: string | undefined }> = {
    path: () => '/graph',
    read: (raw) => ({ data: raw.data, etag: raw.header('ETag') ?? undefined }),
  };
  const client = createClient({
    baseUrl: '',
    fetch: async () =>
      reply({ nodes: [] }, { headers: { 'Content-Type': 'application/json', ETag: '"v1"' } }),
  });
  assert.deepEqual(await client(versioned, undefined), { data: { nodes: [] }, etag: '"v1"' });
});

test('a domain error becomes a RequestError carrying the server code', async () => {
  const client = createClient({
    baseUrl: '',
    fetch: async () =>
      reply(
        { error: { code: 'GRAPH_VERSION_CONFLICT', message: 'Граф изменился.' } },
        { status: 412 },
      ),
  });
  const error = await client(get, undefined).catch((e: unknown) => e);
  assert.ok(error instanceof RequestError);
  assert.equal(error.kind, 'http');
  assert.equal(error.status, 412);
  assert.equal(error.code, 'GRAPH_VERSION_CONFLICT');
  assert.equal(error.retriable, false);
});

test('an error body without a code still gets a message for its status', async () => {
  const client = createClient({
    baseUrl: '',
    fetch: async () => reply(undefined, { status: 404 }),
  });
  const error = (await client(get, undefined).catch((e: unknown) => e)) as RequestError;
  assert.equal(error.code, 'UNEXPECTED_RESPONSE');
  assert.match(error.message, /не найден/i);
});

test('5xx and transport failures are retriable, domain errors are not', async () => {
  const boom = createClient({ baseUrl: '', fetch: async () => reply({}, { status: 500 }) });
  assert.equal(((await boom(get, undefined).catch((e) => e)) as RequestError).retriable, true);

  const dead = createClient({
    baseUrl: '',
    fetch: async () => {
      throw new TypeError('Failed to fetch');
    },
  });
  const offline = (await dead(get, undefined).catch((e) => e)) as RequestError;
  assert.equal(offline.kind, 'network');
  assert.equal(offline.retriable, true);
});

test('an aborted request is reported as aborted, not as a network failure', async () => {
  const controller = new AbortController();
  controller.abort();
  const client = createClient({
    baseUrl: '',
    fetch: async () => {
      throw new DOMException('aborted', 'AbortError');
    },
  });
  const error = (await client(get, undefined, controller.signal).catch((e) => e)) as RequestError;
  assert.equal(error.kind, 'aborted');
  assert.equal(error.retriable, false);
});

test('bodyless replies parse to undefined instead of throwing', async () => {
  for (const response of [
    new Response(null, { status: 204 }),
    new Response('', { status: 200, headers: { 'Content-Length': '0' } }),
  ]) {
    const client = createClient({ baseUrl: '', fetch: async () => response });
    assert.equal(await client(get, undefined), undefined);
  }
});

test('a success with an unparsable body is a parse failure', async () => {
  const client = createClient({
    baseUrl: '',
    fetch: async () =>
      new Response('<html>nope', { status: 200, headers: { 'Content-Type': 'application/json' } }),
  });
  const error = (await client(get, undefined).catch((e) => e)) as RequestError;
  assert.equal(error.kind, 'parse');
  assert.equal(error.retriable, false);
});
