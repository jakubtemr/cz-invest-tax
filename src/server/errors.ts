export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'AppError'
  }
}
