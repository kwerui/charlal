import assert from 'node:assert/strict';
import test from 'node:test';
import { getAuthCallbackRedirectOrigin } from '../src/lib/auth/callbackOrigin.js';

test('uses NEXT_PUBLIC_SITE_URL as the production auth callback origin', () => {
  assert.equal(
    getAuthCallbackRedirectOrigin({
      nodeEnv: 'production',
      requestOrigin: 'https://attacker.example',
      siteUrl: 'https://charlal.example/account?ignored=1',
    }),
    'https://charlal.example'
  );
});

test('requires NEXT_PUBLIC_SITE_URL in production', () => {
  assert.throws(
    () =>
      getAuthCallbackRedirectOrigin({
        nodeEnv: 'production',
        requestOrigin: 'https://charlal.example',
        siteUrl: '',
      }),
    /NEXT_PUBLIC_SITE_URL/
  );
});

test('does not accept an invalid production NEXT_PUBLIC_SITE_URL', () => {
  assert.throws(
    () =>
      getAuthCallbackRedirectOrigin({
        nodeEnv: 'production',
        requestOrigin: 'https://charlal.example',
        siteUrl: 'javascript:alert(1)',
      }),
    /NEXT_PUBLIC_SITE_URL/
  );
});

test('falls back to the request origin outside production', () => {
  assert.equal(
    getAuthCallbackRedirectOrigin({
      nodeEnv: 'development',
      requestOrigin: 'http://localhost:3000',
      siteUrl: '',
    }),
    'http://localhost:3000'
  );
});
