export type AppErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'STEP_UP_REQUIRED'
  | 'CONFLICT'
  | 'OUT_OF_STOCK'
  | 'RATE_LIMITED'
  | 'INTERNAL';

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  // A valid session, but a password re-entry is required for this action
  // (step-up auth). 403 (not 401) on purpose: the SPA's 401 handler triggers
  // a silent token refresh, which would not satisfy freshness — this must
  // surface a re-auth prompt instead.
  STEP_UP_REQUIRED: 403,
  CONFLICT: 409,
  OUT_OF_STOCK: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export class AppError extends Error {
  public readonly code: AppErrorCode;
  public readonly status: number;
  public readonly meta?: Record<string, unknown>;

  constructor(code: AppErrorCode, message: string, meta?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.meta = meta;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
