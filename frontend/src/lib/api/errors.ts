export interface ApiErrorShape {
  code: string;
  message: string;
  meta?: unknown;
}

/** Thrown by the API client for any non-2xx response. Mirrors the backend's
 *  `{ error: { code, message, meta } }` envelope (see
 *  backend/src/middleware/errorHandler.middleware.ts). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly meta?: unknown;

  constructor(status: number, body: Partial<ApiErrorShape> | undefined, fallback = 'Request failed') {
    super(body?.message ?? fallback);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.code ?? 'UNKNOWN';
    this.meta = body?.meta;
  }

  /** Zod field issues, when the backend returned a VALIDATION_ERROR. */
  get issues(): { path: string; message: string }[] {
    const m = this.meta as { issues?: { path: string; message: string }[] } | undefined;
    return m?.issues ?? [];
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}
