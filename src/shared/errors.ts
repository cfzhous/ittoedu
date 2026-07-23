export class UserFacingError extends Error {
  constructor(
    public readonly title: string,
    message: string,
    public readonly suggestion: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'UserFacingError'
  }
}

export function toUserMessage(error: unknown, fallback: string): string {
  if (error instanceof UserFacingError) {
    return `${error.message}\n${error.suggestion}`
  }
  console.error(error)
  return fallback
}
