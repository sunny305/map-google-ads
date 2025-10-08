#!/usr/bin/env node

/**
 * Debug Google Ads API Connection
 * Shows detailed information about what's happening
 */

import { GoogleAdsApi } from 'google-ads-api';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const config = {
  client_id: process.env.GOOGLE_ADS_CLIENT_ID || '79141410423-ts6v6nevb238sfftmo06prbcbrlpmnn2.apps.googleusercontent.com',
  client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET || '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',
  developer_token: process.env.GOOGLE_DEVELOPER_TOKEN || 'JvFRdJb_YI0LPLOtBlCESg',
  refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN || '1//0gBaI3QuxjsFnCgYIARAAGBASNwF-L9IrGVOa9lzMc22-1HVSiCgQ0C-9bR7eSjfdnsZu9hSM6E8Z7p8UJ08zitXw38wWh7VWWRU',
  customer_id: process.env.CUSTOMER_ID || '9159778838',
  login_customer_id: process.env.GOOGLE_LOGIN_CUSTOMER_ID
};

console.log('═══════════════════════════════════════════════════════════');
console.log('🔍 Google Ads API Debug Tool');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('📋 Configuration:');
console.log('  Client ID:', config.client_id);
console.log('  Client Secret:', config.client_secret.substring(0, 15) + '...');
console.log('  Developer Token:', config.developer_token);
console.log('  Refresh Token:', config.refresh_token.substring(0, 20) + '...');
console.log('  Customer ID:', config.customer_id);
console.log('  Login Customer ID:', config.login_customer_id || '(not set)');
console.log('');

// Test 1: Verify OAuth Token
console.log('═══════════════════════════════════════════════════════════');
console.log('Test 1: Verify OAuth Refresh Token');
console.log('═══════════════════════════════════════════════════════════\n');

try {
  console.log('🔄 Testing refresh token by exchanging for access token...\n');
  
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: config.client_id,
      client_secret: config.client_secret,
      refresh_token: config.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  const tokenData = await tokenResponse.json();

  if (tokenData.error) {
    console.error('❌ OAuth Token Error:');
    console.error('   Error:', tokenData.error);
    console.error('   Description:', tokenData.error_description);
    console.error('\n💡 This means: Your refresh token is invalid or expired for this OAuth client.\n');
    process.exit(1);
  } else {
    console.log('✅ OAuth Token is Valid!');
    console.log('   Access Token:', tokenData.access_token.substring(0, 20) + '...');
    console.log('   Token Type:', tokenData.token_type);
    console.log('   Expires In:', tokenData.expires_in, 'seconds');
    console.log('   Scope:', tokenData.scope);
    console.log('');
  }
} catch (error) {
  console.error('❌ Failed to test OAuth token:', error.message);
  process.exit(1);
}

// Test 2: Initialize Google Ads API Client
console.log('═══════════════════════════════════════════════════════════');
console.log('Test 2: Initialize Google Ads API Client');
console.log('═══════════════════════════════════════════════════════════\n');

let client;
try {
  client = new GoogleAdsApi({
    client_id: config.client_id,
    client_secret: config.client_secret,
    developer_token: config.developer_token
  });
  console.log('✅ Google Ads API Client initialized\n');
} catch (error) {
  console.error('❌ Failed to initialize client:', error.message);
  console.error('   Stack:', error.stack);
  process.exit(1);
}

// Test 3: List Accessible Customers
console.log('═══════════════════════════════════════════════════════════');
console.log('Test 3: List Accessible Customers');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('🔄 Calling listAccessibleCustomers()...\n');

try {
  const accessibleCustomers = await client.listAccessibleCustomers(config.refresh_token);
  console.log('✅ Success! Accessible Customers:');
  console.log(JSON.stringify(accessibleCustomers, null, 2));
  console.log('');
} catch (error) {
  console.error('❌ listAccessibleCustomers() Failed:');
  console.error('   Error Code:', error.code);
  console.error('   Error Message:', error.message);
  console.error('   Error Details:', error.details);
  
  if (error.metadata) {
    console.error('   Metadata:', error.metadata);
  }
  
  console.error('\n💡 Diagnosis:');
  if (error.code === 12) {
    console.error('   Error Code 12 (UNIMPLEMENTED) typically means:');
    console.error('   1. Developer token is "Approved for Test Accounts Only"');
    console.error('   2. Method not available for your token level');
    console.error('   3. Developer token is pending approval');
    console.error('\n   Check status at: https://ads.google.com/aw/apicenter\n');
  } else if (error.code === 16) {
    console.error('   Error Code 16 (UNAUTHENTICATED) typically means:');
    console.error('   1. Invalid developer token');
    console.error('   2. OAuth credentials mismatch');
    console.error('   3. Insufficient permissions\n');
  } else if (error.code === 7) {
    console.error('   Error Code 7 (PERMISSION_DENIED) typically means:');
    console.error('   1. No access to the customer account');
    console.error('   2. Developer token not approved for this account type\n');
  }
  
  console.log('   Continuing to Test 4...\n');
}

// Test 4: Direct Customer Query
console.log('═══════════════════════════════════════════════════════════');
console.log('Test 4: Direct Customer Query (Customer ID:', config.customer_id + ')');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('🔄 Attempting direct customer query...\n');

try {
  const customerConfig = {
    customer_id: config.customer_id,
    refresh_token: config.refresh_token
  };
  
  if (config.login_customer_id) {
    customerConfig.login_customer_id = config.login_customer_id;
    console.log('   Using login_customer_id:', config.login_customer_id);
  }
  
  const customer = client.Customer(customerConfig);
  
  const query = `
    SELECT 
      customer.id,
      customer.descriptive_name,
      customer.currency_code,
      customer.time_zone,
      customer.manager,
      customer.test_account
    FROM customer
    LIMIT 1
  `;
  
  console.log('   Query:', query.trim().replace(/\s+/g, ' '));
  console.log('');
  
  const results = await customer.query(query);
  
  console.log('✅ Success! Customer Details:');
  console.log(JSON.stringify(results, null, 2));
  console.log('');
  
  if (results[0]?.customer?.test_account) {
    console.log('⚠️  This is a TEST ACCOUNT');
    console.log('   Your developer token may be "Approved for Test Accounts Only"\n');
  } else {
    console.log('✅ This is a PRODUCTION ACCOUNT');
    console.log('   Your developer token is fully approved!\n');
  }
  
} catch (error) {
  console.error('❌ Direct Customer Query Failed:');
  console.error('   Error Code:', error.code);
  console.error('   Error Message:', error.message);
  console.error('   Error Details:', error.details);
  
  if (error.metadata) {
    console.error('   Metadata:', JSON.stringify(error.metadata, null, 2));
  }
  
  console.error('\n💡 Diagnosis:');
  if (error.code === 12) {
    console.error('   Error Code 12 (UNIMPLEMENTED):');
    console.error('   ❌ Your developer token cannot make API calls.');
    console.error('\n   Possible reasons:');
    console.error('   1. Token status is "Pending" - not approved yet');
    console.error('   2. Token is "Approved for Test Accounts Only" but account is production');
    console.error('   3. Token is invalid or revoked');
    console.error('\n   Action required:');
    console.error('   → Visit: https://ads.google.com/aw/apicenter');
    console.error('   → Check your developer token status');
    console.error('   → If pending, wait for approval or apply for it');
    console.error('   → If test-only, use a test manager account or apply for upgrade\n');
  } else if (error.code === 16) {
    console.error('   Error Code 16 (UNAUTHENTICATED):');
    console.error('   ❌ Authentication failed\n');
    console.error('   Possible reasons:');
    console.error('   1. Developer token is invalid');
    console.error('   2. OAuth credentials mismatch');
    console.error('   3. Refresh token doesn\'t match client_id/client_secret\n');
  } else if (error.code === 7) {
    console.error('   Error Code 7 (PERMISSION_DENIED):');
    console.error('   ❌ No access to this customer account\n');
    console.error('   Possible reasons:');
    console.error('   1. Customer ID', config.customer_id, 'doesn\'t exist');
    console.error('   2. Your Google account doesn\'t have access to this customer');
    console.error('   3. login_customer_id is needed but not provided\n');
  } else if (error.code === 3) {
    console.error('   Error Code 3 (INVALID_ARGUMENT):');
    console.error('   ❌ Invalid request\n');
    console.error('   Possible reasons:');
    console.error('   1. Customer ID format is wrong (should be 10 digits, no dashes)');
    console.error('   2. Query syntax error\n');
  }
  
  console.error('\n   Full error object:');
  console.error(error);
  console.log('');
}

console.log('═══════════════════════════════════════════════════════════');
console.log('Debug Complete');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('📝 Summary:');
console.log('   1. OAuth Token: Check output above');
console.log('   2. API Client: Check output above');
console.log('   3. List Customers: Check output above');
console.log('   4. Query Customer: Check output above\n');

console.log('💡 Next Steps:');
console.log('   - If error code is 12: Check developer token status');
console.log('   - If error code is 16: Verify OAuth credentials match');
console.log('   - If error code is 7: Verify customer ID and permissions');
console.log('   - Visit https://ads.google.com/aw/apicenter for token status\n');

