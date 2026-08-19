import assert from 'node:assert/strict';
import test from 'node:test';
import { getContentSecurityPolicyConnectSources } from '../next.config.js';

test('allows the exact Supabase HTTPS and Realtime WebSocket origins', () => {
  assert.deepEqual(
    getContentSecurityPolicyConnectSources('https://example.supabase.co'),
    [
      "'self'",
      'https://example.supabase.co',
      'wss://example.supabase.co',
    ]
  );
});

test('derives a local Supabase websocket origin from an HTTP URL', () => {
  assert.deepEqual(
    getContentSecurityPolicyConnectSources('http://127.0.0.1:54321'),
    [
      "'self'",
      'http://127.0.0.1:54321',
      'ws://127.0.0.1:54321',
    ]
  );
});

test('does not broaden websocket access when Supabase URL is invalid', () => {
  const connectSources = getContentSecurityPolicyConnectSources('not-a-url');

  assert.deepEqual(connectSources, ["'self'"]);
  assert.equal(connectSources.includes('wss:'), false);
  assert.equal(connectSources.includes('ws:'), false);
  assert.equal(connectSources.includes('*'), false);
});
