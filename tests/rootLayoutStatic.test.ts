import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('root layout does not perform request-specific auth or unread-message work', () => {
  const layoutSource = readFileSync('src/app/[locale]/layout.tsx', 'utf8');

  assert.equal(layoutSource.includes('getCurrentAuthStateSnapshot'), false);
  assert.equal(layoutSource.includes('@/lib/supabase/messagingServer'), false);
  assert.equal(layoutSource.includes('getCurrentUserResult'), false);
  assert.equal(layoutSource.includes('countCurrentUserUnreadConversations'), false);
});

test('localized root layout sets document language from locale param', () => {
  const layoutSource = readFileSync('src/app/[locale]/layout.tsx', 'utf8');

  assert.equal(layoutSource.includes('lang={locale}'), true);
  assert.equal(layoutSource.includes('generateStaticParams'), true);
});
