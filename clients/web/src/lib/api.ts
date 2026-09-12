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

const SESSION_ENDED: ApiFailure = {
  code: 'UNAUTHENTICATED',
  message: 'Your session has ended. Please sign in again.',
};

export interface ApiClientOptions {
  baseUrl: string;
  /** Returns a usable access token, or null when one must be renewed. */
  getToken: () => string | null;
  /**
   * Renews the access token. Returns false when the session genuinely ended.
   * Single-flight upstream, so many simultaneous 401s cause one renewal.
   */
  renew: () => Promise<boolean>;
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

  patch<T>(path: string, body: unknown): Promise<ApiResult<T>> {
    return this.request<T>('PATCH', path, body);
  }

  /** A batch replacement of something that exists, attendance being the case. */
  put<T>(path: string, body: unknown): Promise<ApiResult<T>> {
    return this.request<T>('PUT', path, body);
  }

  del<T>(path: string): Promise<ApiResult<T>> {
    return this.request<T>('DELETE', path);
  }

  private async request<T>(method: string, path: string, body?: unknown, isRetry = false): Promise<ApiResult<T>> {
    let token = this.options.getToken();

    // The token is missing or about to expire. Renew before spending a request,
    // rather than letting the user's action fail and be retried.
    if (!token) {
      const renewed = await this.options.renew();
      if (!renewed) return { ok: false, error: SESSION_ENDED };
      token = this.options.getToken();
    }

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

    // A token rejected mid-flight: renew once and replay. Only one retry, so a
    // server that always answers 401 cannot become an infinite loop.
    if (response.status === 401 && !isRetry) {
      const renewed = await this.options.renew();
      if (renewed) return this.request<T>(method, path, body, true);
      return { ok: false, error: SESSION_ENDED };
    }

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
