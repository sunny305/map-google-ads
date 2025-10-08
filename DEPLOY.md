# Deployment Guide

## Deploy to Render

### Prerequisites
- Render account (https://render.com)
- Google Ads API credentials

### Method 1: Deploy via Render Dashboard

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Add HTTP/SSE server for cloud deployment"
   git push origin main
   ```

2. **Create New Web Service**
   - Go to https://dashboard.render.com
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Render will auto-detect `render.yaml`

3. **Configure Environment Variables**
   Add these in the Render dashboard:
   - `GOOGLE_ADS_CLIENT_ID`: Your OAuth client ID
   - `GOOGLE_ADS_CLIENT_SECRET`: Your OAuth client secret
   - `GOOGLE_DEVELOPER_TOKEN`: Your developer token
   - `GOOGLE_ADS_REFRESH_TOKEN`: OAuth refresh token (optional, if using server-level auth)
   - `GOOGLE_LOGIN_CUSTOMER_ID`: Manager account ID (optional)

4. **Deploy**
   - Click "Create Web Service"
   - Render will build and deploy automatically

### Method 2: Deploy via Render CLI

```bash
# Install Render CLI
brew install render

# Login
render login

# Deploy from render.yaml
render up
```

### Method 3: Deploy using render.yaml

The project includes a `render.yaml` file for automatic deployment:

```yaml
services:
  - type: web
    name: mcp-google-ads
    runtime: node
    plan: free
    buildCommand: npm install && npm run build
    startCommand: npm run start:server
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000
    healthCheckPath: /health
```

## API Endpoints

Once deployed, your MCP server will be available at:

- **Health Check**: `https://your-app.onrender.com/health`
- **SSE Endpoint**: `https://your-app.onrender.com/mcp/sse`
- **Message Endpoint**: `https://your-app.onrender.com/mcp/message`

## Testing the Deployment

### Test Health Endpoint
```bash
curl https://your-app.onrender.com/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-10-08T10:30:00.000Z"
}
```

### Connect via MCP Client

Configure your MCP client to connect to the SSE endpoint:

```json
{
  "mcpServers": {
    "google-ads": {
      "url": "https://your-app.onrender.com/mcp/sse",
      "transport": "sse"
    }
  }
}
```

## Local Testing

Test the HTTP server locally before deploying:

```bash
# Development mode with hot reload
npm run dev:server

# Production mode
npm run build
npm run start:server
```

The server will be available at:
- http://localhost:3000/health
- http://localhost:3000/mcp/sse

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3000, Render uses 10000) |
| `NODE_ENV` | No | Environment (development/production) |
| `GOOGLE_ADS_CLIENT_ID` | Yes* | OAuth client ID |
| `GOOGLE_ADS_CLIENT_SECRET` | Yes* | OAuth client secret |
| `GOOGLE_DEVELOPER_TOKEN` | Yes* | Developer token |
| `GOOGLE_ADS_REFRESH_TOKEN` | No | Server-level refresh token (optional) |
| `GOOGLE_LOGIN_CUSTOMER_ID` | No | Manager account ID (optional) |

*Required for server-level authentication. Can be omitted if clients provide credentials per-request.

## Architecture

### Stdio vs HTTP/SSE

This project supports two deployment modes:

1. **Stdio (Local)**: `npm start` - For Claude Desktop and local clients
2. **HTTP/SSE (Cloud)**: `npm run start:server` - For cloud deployment

### How SSE Works

```
Client                    Server
  |                         |
  |--- GET /mcp/sse ------>|  (Establish SSE stream)
  |<--- SSE events ---------|
  |                         |
  |--- POST /mcp/message -->|  (Send tool calls)
  |<--- Response ----------|
```

## Troubleshooting

### Build Failures
- Ensure all dependencies are installed: `npm install`
- Check TypeScript compilation: `npm run build`

### Connection Issues
- Verify environment variables are set correctly
- Check logs in Render dashboard
- Test health endpoint first

### Rate Limiting
- Google Ads API has rate limits
- Consider implementing caching for frequently accessed data
- Use the `get_rate_limit_status` tool to monitor quota

## Cost Considerations

- **Render Free Tier**: 750 hours/month (sleeps after 15 min of inactivity)
- **Paid Plans**: Start at $7/month for always-on instances
- Upgrade if you need:
  - Zero downtime
  - Custom domains
  - Higher resource limits

## Security Notes

1. **Never commit credentials** to git
2. **Use environment variables** for all secrets
3. **Enable CORS** only for trusted domains (currently allows all)
4. **User credentials**: This server expects clients to provide OAuth tokens per-request
5. **HTTPS only**: Render provides HTTPS by default

## Next Steps

After deployment:

1. Test all 6 MCP tools (get_accounts, get_campaigns, etc.)
2. Set up monitoring and alerts
3. Configure custom domain (optional)
4. Implement rate limiting middleware (recommended)
5. Add request logging for debugging

## Support

For issues:
- Check Render logs: `render logs -a your-app-name`
- Review Google Ads API documentation
- Test locally first with `npm run dev:server`
