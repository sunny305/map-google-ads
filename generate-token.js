#!/usr/bin/env node

/**
 * Generate OAuth2 Refresh Token for Google Ads API
 *
 * This script helps you generate a refresh token for the Google Ads API.
 * Run: node generate-token.js
 */

import dotenv from 'dotenv';
import { createServer } from 'http';
import { parse } from 'url';

dotenv.config();

const CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:8080/oauth2callback';
const SCOPES = 'https://www.googleapis.com/auth/adwords';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Error: Missing GOOGLE_ADS_CLIENT_ID or GOOGLE_ADS_CLIENT_SECRET in .env');
  process.exit(1);
}

console.log('🚀 Google Ads API - OAuth2 Token Generator\n');
console.log('📋 Configuration:');
console.log(`   Client ID: ${CLIENT_ID}`);
console.log(`   Redirect URI: ${REDIRECT_URI}`);
console.log(`   Scopes: ${SCOPES}\n`);

// Generate authorization URL
const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.append('client_id', CLIENT_ID);
authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
authUrl.searchParams.append('response_type', 'code');
authUrl.searchParams.append('scope', SCOPES);
authUrl.searchParams.append('access_type', 'offline');
authUrl.searchParams.append('prompt', 'consent');

console.log('📝 Step 1: Open this URL in your browser:\n');
console.log(authUrl.toString());
console.log('\n📝 Step 2: Authorize the application and wait for redirect...\n');
console.log('⏳ Starting local server on http://localhost:8080...\n');

// Create local server to receive callback
const server = createServer(async (req, res) => {
  const parsedUrl = parse(req.url, true);

  if (parsedUrl.pathname === '/oauth2callback') {
    const code = parsedUrl.query.code;

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end('<h1>Error: No authorization code received</h1>');
      server.close();
      return;
    }

    try {
      // Exchange code for tokens
      console.log('🔄 Exchanging authorization code for tokens...\n');

      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      });

      const tokens = await tokenResponse.json();

      if (tokens.error) {
        console.error('❌ Error getting tokens:', tokens.error_description || tokens.error);
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<h1>Error: ${tokens.error_description || tokens.error}</h1>`);
        server.close();
        return;
      }

      console.log('✅ Success! Here are your tokens:\n');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔑 REFRESH TOKEN (use this in MCP tool calls):');
      console.log(`\n${tokens.refresh_token}\n`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('\n📝 Pass this refresh_token in the user_credentials parameter');
      console.log('   when calling MCP tools like healthcheck, get_accounts, etc.\n');

      // Test the refresh token
      console.log('🧪 Testing refresh token...\n');
      const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          refresh_token: tokens.refresh_token,
          grant_type: 'refresh_token',
        }),
      });

      const refreshResult = await refreshResponse.json();

      if (refreshResult.error) {
        console.error('❌ Refresh token test failed:', refreshResult.error_description || refreshResult.error);
      } else {
        console.log('✅ Refresh token is valid and working!\n');
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <head><title>Success!</title></head>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h1 style="color: green;">✅ Authorization Successful!</h1>
            <p>Check your terminal for the refresh token.</p>
            <p>You can close this window now.</p>
          </body>
        </html>
      `);

      setTimeout(() => {
        server.close();
        process.exit(0);
      }, 1000);

    } catch (error) {
      console.error('❌ Error:', error.message);
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`<h1>Error: ${error.message}</h1>`);
      server.close();
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end('<h1>404 Not Found</h1>');
  }
});

server.listen(8080, () => {
  console.log('✅ Server is listening on http://localhost:8080\n');
});

server.on('error', (err) => {
  console.error('❌ Server error:', err.message);
  process.exit(1);
});
