export const BASE_URL = import.meta.env?.VITE_API_URL ?? 'http://localhost:4001';

export type Method = 'GET' | 'POST' | 'PUT';
export type FailureKind = 'network' | 'http' | 'parse' | 'aborted';
export interface RawReply {
  readonly status: number;
  readonly data: unknown;
  header(name: string): string | null;
}
export interface Endpoint<Input, Output> {
  readonly method?: Method;
  readonly path: (input: Input) => string;
  readonly body?: (input: Input) => unknown;
  readonly headers?: (input: Input) => Record<string, string>;
  readonly read: (reply: RawReply) => Output;
}
export const readData = <T>(reply: RawReply): T => reply.data as T;

const MESSAGE_BY_STATUS: Record<number, string> = {
  404: 'Ресурс не найден. Обновите страницу.',
  409: 'Данные изменились. Обновите их и повторите.',
  412: 'Граф на сервере новее. Перечитайте его, чтобы продолжить.',
  413: 'Запрос слишком большой.',
  415: 'Формат запроса не поддерживается.',
  422: 'Сервер не принял граф. Проверьте цепочку нод.',
  428: 'Нет версии графа. Перечитайте граф и повторите.',
};

export class RequestError extends Error {
  readonly name = 'RequestError';
  readonly kind: FailureKind;
  readonly code: string;
  readonly status: number | null;
  readonly requestId?: string;

  constructor(
    kind: FailureKind,
    code: string,
    message: string,
    status: number | null = null,
    requestId?: string,
  ) {
    super(message);
    this.kind = kind;
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
  get retriable() {
    return this.kind === 'network' || (this.status !== null && this.status >= 500);
  }
}

const errorFromBody = (status: number, payload: unknown, requestId?: string) => {
  const body = (payload as { error?: { code?: string; message?: string } } | undefined)?.error;
  return new RequestError(
    'http',
    body?.code ?? 'UNEXPECTED_RESPONSE',
    body?.message ?? MESSAGE_BY_STATUS[status] ?? `Сервер ответил ошибкой ${status}.`,
    status,
    requestId,
  );
};

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface ClientOptions {
  baseUrl?: string;
  fetch?: FetchLike;
}

export type Client = <Input, Output>(
  endpoint: Endpoint<Input, Output>,
  input: Input,
  signal?: AbortSignal,
) => Promise<Output>;
export const createClient = ({
  baseUrl = BASE_URL,
  fetch: send = globalThis.fetch,
}: ClientOptions = {}): Client => {
  return async (endpoint, input, signal) => {
    const method = endpoint.method ?? 'GET';
    const body = endpoint.body?.(input);
    const headers: Record<string, string> = { ...endpoint.headers?.(input) };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let response: Response;
    try {
      response = await send(`${baseUrl}${endpoint.path(input)}`, {
        method,
        headers,
        signal,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      if (signal?.aborted) throw new RequestError('aborted', 'ABORTED', 'Запрос отменён.');
      throw new RequestError(
        'network',
        'NETWORK_ERROR',
        'Нет связи с сервером. Проверьте подключение.',
      );
    }

    const requestId = response.headers.get('X-Request-Id') ?? undefined;
    const empty = response.status === 204 || response.headers.get('Content-Length') === '0';

    let payload: unknown;
    if (!empty) {
      const text = await response.text();
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          if (response.ok)
            throw new RequestError(
              'parse',
              'UNEXPECTED_RESPONSE',
              'Неожиданный ответ сервера.',
              response.status,
              requestId,
            );
        }
      }
    }

    if (!response.ok) throw errorFromBody(response.status, payload, requestId);

    return endpoint.read({
      status: response.status,
      data: payload,
      header: (name) => response.headers.get(name),
    });
  };
};

export const client = createClient();

export const asRequestError = (cause: unknown) =>
  cause instanceof RequestError
    ? cause
    : new RequestError(
        'parse',
        'UNEXPECTED_ERROR',
        cause instanceof Error ? cause.message : 'Неизвестная ошибка.',
      );
