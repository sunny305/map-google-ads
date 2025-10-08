# mcp-google-ads

Read-only Model Context Protocol (MCP) server for Google Ads marketing performance data.

## Features

- **6 MCP Tools**: Get accounts, campaigns, ads, reports, rate limits, and health status
- **Standardized Schema**: Normalized metrics across campaigns, ads, and accounts
- **Derived Metrics**: Automatic calculation of CTR, CPC, CPM, CPA, and ROAS with zero-guards
- **Pagination**: Cursor-based pagination for large result sets
- **Retry Logic**: Exponential backoff with jitter for rate limits and transient errors
- **Type Safety**: Full TypeScript implementation with Zod validation

## Installation

```bash
npm install
```

## Configuration

### Required Environment Variables

Copy `.env.example` to `.env` and fill in your **app-level** credentials:

```bash
# App-level OAuth2 Credentials (get from Google Cloud Console)
# These are shared across all users
GOOGLE_ADS_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_ADS_CLIENT_SECRET=your-client-secret

# Developer Token (from Google Ads API Center)
GOOGLE_DEVELOPER_TOKEN=your-developer-token
```

**Note:** `refresh_token` and `login_customer_id` are **NOT** environment variables. They must be passed per-request via the `user_credentials` parameter in each tool call.

### Getting Credentials

#### App-Level Credentials (in .env):
1. **Create Google Cloud Project**: https://console.cloud.google.com/
2. **Enable Google Ads API**: https://console.cloud.google.com/apis/library/googleads.googleapis.com
3. **Create OAuth 2.0 Credentials**: Create OAuth client ID (Desktop app type) → Get `GOOGLE_ADS_CLIENT_ID` and `GOOGLE_ADS_CLIENT_SECRET`
4. **Get Developer Token**: https://ads.google.com/aw/apicenter → Get `GOOGLE_DEVELOPER_TOKEN`

#### User-Level Credentials (per-request):
5. **Generate Refresh Token**: Each user generates their own refresh token using OAuth playground or google-ads-api CLI
6. **Pass in Tool Calls**: Include `user_credentials` with `refresh_token` in every tool call

**Important**: Request only **read-only** scopes:
- `https://www.googleapis.com/auth/adwords` (read-only)

## Usage

### Local (Stdio)

For Claude Desktop and local clients:

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

### Cloud Deployment (JSON-RPC/HTTP)

For Render, Railway, Smithery, or other cloud platforms:

```bash
# Development
npm run dev:server

# Production
npm run build
npm run start:server
```

The server exposes a simple JSON-RPC endpoint at `/mcp` (POST) that works with:
- **Smithery Playground** - MCP testing tool
- **Claude Desktop** - with HTTP transport
- **Any HTTP client** - curl, Postman, etc.

**See [DEPLOY.md](./DEPLOY.md) for detailed deployment instructions.**

### Running Tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm test -- --coverage
```

## MCP Tools

### 1. `get_accounts`

List all accessible Google Ads customer accounts.

**Input**: None

**Example**:
```json
{}
```

**Output**:
```json
{
  "accounts": [
    {
      "id": "1234567890",
      "name": "My Account"
    }
  ],
  "source": {
    "mcp": "mcp-google-ads",
    "version": "1.0.0"
  }
}
```

---

### 2. `get_campaigns`

Retrieve campaigns for specified accounts and date range.

**Input**:
```json
{
  "account_ids": ["1234567890"],
  "date_range": {
    "preset": "LAST_7_DAYS"
  },
  "timezone": "Asia/Kolkata"
}
```

**Output**:
```json
{
  "campaigns": [
    {
      "id": "9876543210",
      "name": "My Campaign",
      "status": "ENABLED",
      "account_id": "1234567890",
      "account_name": "My Account"
    }
  ],
  "source": {
    "mcp": "mcp-google-ads",
    "version": "1.0.0"
  }
}
```

---

### 3. `get_ads`

Retrieve ads for specified accounts and date range.

**Input**:
```json
{
  "account_ids": ["1234567890"],
  "date_range": {
    "start_date": "2025-10-01",
    "end_date": "2025-10-07"
  },
  "campaign_ids": ["9876543210"]
}
```

**Output**:
```json
{
  "ads": [
    {
      "id": "111222333",
      "name": "My Ad",
      "type": "RESPONSIVE_SEARCH_AD",
      "status": "ENABLED",
      "campaign_id": "9876543210",
      "campaign_name": "My Campaign",
      "account_id": "1234567890",
      "account_name": "My Account"
    }
  ],
  "source": {
    "mcp": "mcp-google-ads",
    "version": "1.0.0"
  }
}
```

---

### 4. `get_report`

Get normalized performance report with metrics at specified level.

**Input**:
```json
{
  "account_ids": ["1234567890"],
  "date_range": {
    "preset": "LAST_7_DAYS"
  },
  "level": "CAMPAIGN",
  "fields": ["spend", "impressions", "clicks", "conversions", "roas"],
  "breakdowns": ["date"],
  "timezone": "Asia/Kolkata",
  "paging": {
    "limit": 500
  }
}
```

**Output**:
```json
{
  "rows": [
    {
      "platform": "google_ads",
      "account_id": "1234567890",
      "account_name": "My Account",
      "date": "2025-10-01",
      "campaign_id": "9876543210",
      "campaign_name": "My Campaign",
      "adset_id": null,
      "adset_name": null,
      "ad_id": null,
      "ad_name": null,
      "spend": 120.5,
      "impressions": 25000,
      "clicks": 430,
      "conversions": 12,
      "conversion_value": 1640,
      "currency": "USD",
      "ctr": 0.0172,
      "cpc": 0.28,
      "cpm": 4.82,
      "cpa": 10.04,
      "roas": 13.61,
      "attribution_model": null,
      "attribution_window": null
    }
  ],
  "next_cursor": null
}
```

**Reporting Levels**:
- `ACCOUNT`: Account-level metrics
- `CAMPAIGN`: Campaign-level metrics
- `AD`: Ad-level metrics

**Date Range Options**:
- `preset`: `LAST_7_DAYS`, `LAST_30_DAYS`, `MTD`, `YTD`
- `start_date` + `end_date`: Explicit date range (YYYY-MM-DD)

---

### 5. `get_rate_limit_status`

Get current rate limit status and quotas.

**Input**: None

**Example**:
```json
{}
```

**Output**:
```json
{
  "quota_remaining": null,
  "quota_limit": null,
  "last_updated": null,
  "note": "Google Ads API does not consistently expose rate limit headers...",
  "source": {
    "mcp": "mcp-google-ads",
    "version": "1.0.0"
  }
}
```

---

### 6. `healthcheck`

Check API connectivity and return server version.

**Input**: None

**Example**:
```json
{}
```

**Output**:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "message": "Connected successfully. 2 accessible accounts.",
  "timestamp": "2025-10-08T10:30:00.000Z",
  "source": {
    "mcp": "mcp-google-ads",
    "version": "1.0.0"
  }
}
```

## Standardized Schema

All metrics follow the canonical schema defined in `plan.txt §4`:

| Field | Type | Description |
|-------|------|-------------|
| `platform` | `string` | Always `"google_ads"` |
| `account_id` | `string` | Customer ID |
| `account_name` | `string` | Customer name |
| `date` | `string\|null` | Date (YYYY-MM-DD) if breakdown requested |
| `campaign_id` | `string\|null` | Campaign ID |
| `campaign_name` | `string\|null` | Campaign name |
| `adset_id` | `null` | Always null (Google Ads doesn't have adsets) |
| `adset_name` | `null` | Always null |
| `ad_id` | `string\|null` | Ad ID |
| `ad_name` | `string\|null` | Ad name |
| `spend` | `number` | Cost in currency units |
| `impressions` | `number` | Impressions count |
| `clicks` | `number` | Clicks count |
| `conversions` | `number` | Conversions count |
| `conversion_value` | `number` | Conversion value in currency units |
| `currency` | `string` | ISO currency code (e.g., "USD") |
| `ctr` | `number` | Click-through rate (clicks / impressions) |
| `cpc` | `number` | Cost per click (spend / clicks) |
| `cpm` | `number` | Cost per mille (spend * 1000 / impressions) |
| `cpa` | `number` | Cost per acquisition (spend / conversions) |
| `roas` | `number` | Return on ad spend (conversion_value / spend) |
| `attribution_model` | `string\|null` | Attribution model (if available) |
| `attribution_window` | `string\|null` | Attribution window (if available) |

### Derived Metrics

All derived metrics include **zero-guards** to prevent division by zero:

- `ctr = clicks / impressions || 0`
- `cpc = spend / clicks || 0`
- `cpm = (spend * 1000) / impressions || 0`
- `cpa = spend / conversions || 0`
- `roas = conversion_value / spend || 0`

## Error Handling

Errors follow a standardized format:

```json
{
  "error": {
    "type": "RATE_LIMIT",
    "message": "Rate limit exceeded. Please retry after some time.",
    "upstream_code": "RATE_EXCEEDED",
    "retry_after_seconds": 60
  }
}
```

**Error Types**:
- `AUTH`: Authentication/authorization errors
- `VALIDATION`: Request validation errors
- `RATE_LIMIT`: Rate limit exceeded
- `NOT_FOUND`: Resource not found
- `UPSTREAM`: Google Ads API errors
- `UNKNOWN`: Unknown errors

## Known Limitations

1. **Rate Limits**: Google Ads API has quotas that vary by account type
2. **Attribution**: Attribution model/window may not always be available
3. **Currency Micros**: Google Ads returns currency in micros (automatically converted)
4. **Adsets**: Google Ads doesn't have adsets (always null in standardized schema)

## Development

### Project Structure

```
/mcp-google-ads
  /src
    /api          # Google Ads API client
    /tools        # 6 tool implementations
    /validation   # Zod schemas
    /normalization # Metrics & field mapping
    /utils        # Retry, pagination
  /tests
    /unit         # Unit tests
    /golden       # Golden tests with fixtures
  /fixtures       # Sanitized API responses
```

### Adding New Tools

1. Create tool file in `/src/tools/`
2. Add schema to `/src/validation/schemas.ts`
3. Register in `src/index.ts`
4. Update `mcp-manifest.json`
5. Add tests

## License

MIT
