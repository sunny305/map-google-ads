/**
 * Retry utility with exponential backoff and jitter
 * Respects Retry-After headers for rate limiting
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  jitterFactor?: number;
}

export interface RetryableError extends Error {
  retryAfterSeconds?: number;
  statusCode?: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  jitterFactor: 0.3
};

/**
 * Sleep for specified milliseconds
 */
const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateDelay(
  attempt: number,
  options: Required<RetryOptions>,
  retryAfterMs?: number
): number {
  // If server provides Retry-After, respect it
  if (retryAfterMs) {
    return Math.min(retryAfterMs, options.maxDelayMs);
  }

  // Exponential backoff: initialDelay * 2^attempt
  const exponentialDelay = options.initialDelayMs * Math.pow(2, attempt);

  // Add jitter to prevent thundering herd
  const jitter = exponentialDelay * options.jitterFactor * Math.random();

  const totalDelay = exponentialDelay + jitter;

  return Math.min(totalDelay, options.maxDelayMs);
}

/**
 * Determine if an error is retryable
 */
function isRetryableError(error: any): boolean {
  // Network errors
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
    return true;
  }

  // Rate limit errors
  if (error.statusCode === 429) {
    return true;
  }

  // Server errors (5xx)
  if (error.statusCode >= 500 && error.statusCode < 600) {
    return true;
  }

  // Google Ads specific errors
  if (error.name === 'GoogleAdsError' && error.message?.includes('RATE_EXCEEDED')) {
    return true;
  }

  return false;
}

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Don't retry if it's not a retryable error
      if (!isRetryableError(error)) {
        throw error;
      }

      // Don't retry if we've exhausted attempts
      if (attempt >= opts.maxRetries) {
        throw error;
      }

      // Calculate delay
      const retryAfterMs = error.retryAfterSeconds
        ? error.retryAfterSeconds * 1000
        : undefined;

      const delayMs = calculateDelay(attempt, opts, retryAfterMs);

      console.log(
        `Retry attempt ${attempt + 1}/${opts.maxRetries} after ${delayMs}ms. Error: ${error.message}`
      );

      await sleep(delayMs);
    }
  }

  // This should never be reached, but TypeScript requires it
  throw lastError!;
}

/**
 * Parse Retry-After header (can be seconds or HTTP date)
 */
export function parseRetryAfter(retryAfterHeader: string | undefined): number | undefined {
  if (!retryAfterHeader) {
    return undefined;
  }

  // If it's a number, it's seconds
  const seconds = parseInt(retryAfterHeader, 10);
  if (!isNaN(seconds)) {
    return seconds;
  }

  // If it's a date string, calculate seconds from now
  const date = new Date(retryAfterHeader);
  if (!isNaN(date.getTime())) {
    const secondsUntil = Math.max(0, (date.getTime() - Date.now()) / 1000);
    return Math.ceil(secondsUntil);
  }

  return undefined;
}
