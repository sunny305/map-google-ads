/**
 * Pagination utilities for Google Ads API
 * Google Ads uses page_token for cursor-based pagination
 */

export interface PaginationParams {
  limit?: number;
  cursor?: string | null;
}

export interface PaginatedResponse<T> {
  rows: T[];
  next_cursor: string | null;
  total_results?: number;
}

const DEFAULT_PAGE_SIZE = 500;
const MAX_PAGE_SIZE = 10000;

/**
 * Normalize pagination parameters
 */
export function normalizePaginationParams(params?: PaginationParams): {
  limit: number;
  page_token?: string;
} {
  const limit = params?.limit || DEFAULT_PAGE_SIZE;

  // Enforce max page size
  const normalizedLimit = Math.min(limit, MAX_PAGE_SIZE);

  return {
    limit: normalizedLimit,
    ...(params?.cursor && { page_token: params.cursor })
  };
}

/**
 * Create paginated response
 */
export function createPaginatedResponse<T>(
  rows: T[],
  nextPageToken?: string | null,
  totalResults?: number
): PaginatedResponse<T> {
  return {
    rows,
    next_cursor: nextPageToken || null,
    ...(totalResults !== undefined && { total_results: totalResults })
  };
}

/**
 * Extract page token from Google Ads API response
 */
export function extractPageToken(response: any): string | null {
  return response.next_page_token || response.nextPageToken || null;
}

/**
 * Build GAQL LIMIT clause
 */
export function buildLimitClause(limit: number): string {
  return `LIMIT ${limit}`;
}
