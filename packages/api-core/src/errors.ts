export class ApiCoreError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
    readonly code?: string
  ) {
    super(message);
    this.name = "ApiCoreError";
  }
}

export function isApiCoreError(err: unknown): err is ApiCoreError {
  return err instanceof ApiCoreError;
}
