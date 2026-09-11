/**
 * The single HTTP boundary. Nothing else in the application calls fetch.
 *
 * The server's envelope is defined in docs/05-api-contract.md §5.2: success
 * carries `data`, failure carries `error` with a user-safe `message`. That
 * message is shown directly; the client never invents error copy.
 */

export interface ApiFailure {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
}

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiFailure };

const NETWORK_FAILURE: ApiFailure = {
  code: 'NETWORK',
  message: 'Cannot reach the server. Check your connection and try again.',
};

const UNEXPECTED: ApiFailure = {
  code: 'UNKNOWN',
  message: 'Something went wrong. Please try again.',
};

export interface ApiClientOptions {
  baseUrl: string;
  /** Returns the current access token, or null when signed out. */
  getToken: () => string | null;
  /** Called when the server rejects the token, so the shell can sign out. */
  onUnauthenticated?: () => void;
}

export class ApiClient {
  private readonly options: ApiClientOptions;

  constructor(options: ApiClientOptions) {
    this.options = options;
  }

  get<T>(path: string): Promise<ApiResult<T>> {
    return this.request<T>('GET', path);
  }

  post<T>(path: string, body: unknown): Promise<ApiResult<T>> {
    return this.request<T>('POST', path, body);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
    const token = this.options.getToken();
    let response: Response;

    try {
      response = await fetch(`${this.options.baseUrl}${path}`, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      return { ok: false, error: NETWORK_FAILURE };
    }

    if (response.status === 401 && token) this.options.onUnauthenticated?.();

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { ok: false, error: response.ok ? UNEXPECTED : { ...UNEXPECTED, code: String(response.status) } };
    }

    return parseEnvelope<T>(payload, response.ok);
  }
}

/** Exported for tests: the envelope contract is worth pinning down. */
export function parseEnvelope<T>(payload: unknown, httpOk: boolean): ApiResult<T> {
  const body = payload as { data?: T; error?: { code?: string; message?: string; field_errors?: Record<string, string> } };

  if (!httpOk || body?.error) {
    const error = body?.error;
    return {
      ok: false,
      error: {
        code: error?.code ?? UNEXPECTED.code,
        message: error?.message ?? UNEXPECTED.message,
        ...(error?.field_errors ? { fieldErrors: error.field_errors } : {}),
      },
    };
  }

  if (body?.data === undefined) return { ok: false, error: UNEXPECTED };
  return { ok: true, value: body.data };
}
