/**
 * get_report tool
 * Get normalized performance report with metrics at specified level
 */

import { createGoogleAdsClientFromRequest } from '../api/google-ads-client.js';
import { GetReportRequest, resolveDateRange } from '../validation/schemas.js';
import { normalizePaginationParams, createPaginatedResponse, type PaginatedResponse } from '../utils/pagination.js';
import { buildGAQLFields, buildGAQLResource, mapRowsToStandardized, type StandardizedRow } from '../normalization/field-mapper.js';

/**
 * Get report with normalized metrics
 */
export async function getReport(
  request: GetReportRequest
): Promise<PaginatedResponse<StandardizedRow>> {
  const client = createGoogleAdsClientFromRequest(request.user_credentials);
  const { start_date, end_date } = resolveDateRange(request.date_range);
  const pagination = normalizePaginationParams(request.paging);

  // If no account_ids provided, get all accessible accounts
  let accountIds = request.account_ids;
  if (!accountIds || accountIds.length === 0) {
    const accounts = await client.listAccessibleCustomers();
    accountIds = accounts.map(acc => acc.id);
  }

  const allRows: StandardizedRow[] = [];
  let nextCursor: string | null = null;

  // Query each account
  for (const accountId of accountIds) {
    const query = buildReportQuery(
      request.level,
      start_date,
      end_date,
      {
        filters: request.filters,
        breakdowns: request.breakdowns,
        limit: pagination.limit,
        page_token: pagination.page_token
      }
    );

    try {
      const { results, next_page_token } = await client.query(accountId, query, {
        page_token: pagination.page_token
      });

      // Map results to standardized format
      const standardizedRows = mapRowsToStandardized(results);

      allRows.push(...standardizedRows);

      // Store next page token (for simplicity, using the last account's token)
      if (next_page_token) {
        nextCursor = next_page_token;
      }
    } catch (error) {
      console.error(`Error querying account ${accountId}:`, error);
      // Continue with other accounts
    }
  }

  return createPaginatedResponse(allRows, nextCursor);
}

/**
 * Build GAQL query for report
 */
function buildReportQuery(
  level: 'ACCOUNT' | 'CAMPAIGN' | 'AD',
  startDate: string,
  endDate: string,
  options: {
    filters?: any[];
    breakdowns?: string[];
    limit: number;
    page_token?: string;
  }
): string {
  // Get fields and resource based on level
  const fields = buildGAQLFields(level);
  const resource = buildGAQLResource(level);

  // Add date breakdown if requested
  const includeDate = options.breakdowns?.includes('date') ?? true;
  if (includeDate) {
    fields.push('segments.date');
  }

  // Build SELECT clause
  const selectClause = fields.join(',\n    ');

  // Build WHERE clause
  const whereConditions = [
    `segments.date BETWEEN '${startDate}' AND '${endDate}'`
  ];

  // Add filters if provided
  if (options.filters && options.filters.length > 0) {
    for (const filter of options.filters) {
      if (filter.op === 'IN' && filter.values.length > 0) {
        const valueList = filter.values.join(', ');
        whereConditions.push(`${filter.field} IN (${valueList})`);
      } else if (filter.op === 'EQ') {
        whereConditions.push(`${filter.field} = ${filter.values[0]}`);
      } else if (filter.op === 'GT') {
        whereConditions.push(`${filter.field} > ${filter.values[0]}`);
      } else if (filter.op === 'LT') {
        whereConditions.push(`${filter.field} < ${filter.values[0]}`);
      } else if (filter.op === 'GTE') {
        whereConditions.push(`${filter.field} >= ${filter.values[0]}`);
      } else if (filter.op === 'LTE') {
        whereConditions.push(`${filter.field} <= ${filter.values[0]}`);
      }
    }
  }

  const whereClause = whereConditions.join(' AND ');

  // Build query
  const query = `
    SELECT
      ${selectClause}
    FROM ${resource}
    WHERE ${whereClause}
    LIMIT ${options.limit}
  `;

  return query.trim();
}
