export async function withRetry<T>(
  fn: () => Promise<T>,
  _maxRetries = 3,
  onRetry?: (attempt: number, waitTime: number) => void
): Promise<T> {
  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      const err = error as Error;
      const isRateLimit =
        err.message?.includes("rate_limit") ||
        err.message?.includes("engine_overloaded");

      if (!isRateLimit) {
        throw err;
      }

      attempt++;
      const waitTime = 60;
      onRetry?.(attempt, waitTime);
      await new Promise((resolve) => setTimeout(resolve, waitTime * 1000));
    }
  }
}
