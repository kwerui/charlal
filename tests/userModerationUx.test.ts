import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('account and edit pages use server-derived suspension state for read-only UX', () => {
  const accountPageSource = readFileSync('src/app/[locale]/account/page.tsx', 'utf8');
  const accountSource = readFileSync(
    'src/app/[locale]/account/AccountDashboard.tsx',
    'utf8'
  );
  const editPageSource = readFileSync(
    'src/app/[locale]/account/listings/[id]/edit/page.tsx',
    'utf8'
  );
  const editSource = readFileSync(
    'src/app/[locale]/account/listings/[id]/edit/EditListingForm.tsx',
    'utf8'
  );
  const listingClientSource = readFileSync('src/lib/supabase/listingsClient.ts', 'utf8');
  const statusActionSource = readFileSync('src/app/account/listingStatusActions.ts', 'utf8');

  assert.equal(accountPageSource.includes('getCurrentUserSuspension()'), true);
  assert.equal(accountPageSource.includes('initialIsSuspended={isSuspended}'), true);
  assert.equal(accountSource.includes('initialIsSuspended: boolean;'), true);
  assert.equal(accountSource.includes("t('suspendedAccountTitle')"), true);
  assert.equal(accountSource.includes("t('suspendedAccountMessage')"), true);
  assert.equal(accountSource.includes('accountProfile && !initialIsSuspended'), true);
  assert.equal(accountSource.includes('disabled={initialIsSuspended}'), true);
  assert.equal(accountSource.includes('suspendedListingActionMessage'), true);
  assert.match(
  accountSource,
  /href=\{\{\s*pathname:\s*editHref,\s*query:\s*\{\s*from:\s*'\/account'\s*\}/
);

  assert.equal(editPageSource.includes('getCurrentUserSuspension()'), true);
  assert.equal(editPageSource.includes('initialIsSuspended={isSuspended}'), true);
  assert.equal(editSource.includes('initialIsSuspended: boolean;'), true);
  assert.equal(editSource.includes("t('suspendedEditTitle')"), true);
  assert.equal(editSource.includes("t('suspendedEditMessage')"), true);
assert.match(
  editSource,
  /function handleCancel\(\): void \{[\s\S]*editOrigin === '\/account' && hasActiveResultsNavigation\('\/account'\)[\s\S]*requestResultsScrollRestore\('\/account'\);[\s\S]*router\.back\(\);/
);

  const restoreRequestIndex = editSource.indexOf(
    "requestResultsScrollRestore('/account')"
  );
  const routerBackIndex = editSource.indexOf(
    'router.back();',
    restoreRequestIndex
  );

  assert.ok(
    restoreRequestIndex >= 0,
    'successful account listing edits should request account scroll restoration'
  );
  assert.ok(
    routerBackIndex > restoreRequestIndex,
    'account scroll restoration should be requested before navigating back'
  );

  assert.match(
    editSource,
    /editOrigin === '\/account' && hasActiveResultsNavigation\('\/account'\)[\s\S]*requestResultsScrollRestore\('\/account'\);[\s\S]*router\.back\(\);/
  );

  assert.match(
    accountSource,
    /accountReady\s*\?\s*\(\s*<ResultsScrollRestorer\s+resultsHref="\/account"\s*\/>\s*\)\s*:\s*null/
  );

  assert.equal(editSource.includes("updateResult.reason === 'suspended'"), true);
  assert.equal(statusActionSource.includes("reason: 'suspended'"), true);
  assert.equal(statusActionSource.includes('suspensionResult.isSuspended'), true);
  assert.equal(listingClientSource.includes("'suspended'"), true);
  assert.equal(listingClientSource.includes("rpc('current_user_is_suspended'"), true);
});

test('messaging thread disables mutation UI from narrow can-message RPC without hiding history', () => {
  const messagingServerSource = readFileSync(
    'src/lib/supabase/messagingServer.ts',
    'utf8'
  );
  const pageSource = readFileSync(
    'src/app/[locale]/account/messages/[conversationId]/page.tsx',
    'utf8'
  );
  const threadSource = readFileSync(
    'src/app/[locale]/account/messages/[conversationId]/ConversationThread.tsx',
    'utf8'
  );

  assert.match(
    messagingServerSource,
    /\.rpc\(\s*'current_user_can_message_conversation'/
  );
  assert.equal(messagingServerSource.includes('canSendMessages: boolean;'), true);
  assert.equal(pageSource.includes('canSendMessages={threadResult.canSendMessages}'), true);
  assert.equal(pageSource.includes('currentUserIsSuspended={isSuspended}'), true);
  assert.equal(threadSource.includes('canSendMessages: boolean;'), true);
  assert.equal(threadSource.includes('currentUserIsSuspended: boolean;'), true);
  assert.equal(threadSource.includes("t('messagingSuspendedMessage')"), true);
  assert.equal(threadSource.includes('!canSendMessages ||'), true);
  assert.equal(threadSource.includes('!currentUserIsSuspended ? ('), true);
  assert.equal(threadSource.includes('messages.map((message, index) =>'), true);
});

test('admin user moderation UX is protected and uses only narrow admin RPC wrappers', () => {
  const migrationSource = readFileSync(
    'supabase/migrations/20260907_add_admin_user_moderation_reads.sql',
    'utf8'
  );
  const adminSource = readFileSync('src/lib/supabase/adminModeration.ts', 'utf8');
  const actionSource = readFileSync('src/app/admin/users/actions.ts', 'utf8');
  const pageSource = readFileSync(
    'src/app/[locale]/admin/users/[id]/page.tsx',
    'utf8'
  );
  const reportsSource = readFileSync(
    'src/app/[locale]/admin/reports/page.tsx',
    'utf8'
  );

  assert.equal(pageSource.includes('getCurrentUserIsAdmin()'), true);
  assert.equal(pageSource.includes('notFound();'), true);
  assert.equal(pageSource.includes('getAdminUserModeration'), true);
  assert.equal(pageSource.includes('listAdminUserModerationAuditEvents'), true);
  assert.equal(pageSource.includes('formatAppShortDate'), true);
  assert.equal(pageSource.includes("new Intl.DateTimeFormat('tyv'"), false);

  assert.equal(actionSource.includes("'use server';"), true);
  assert.equal(actionSource.includes('suspendUser(userId)'), true);
  assert.equal(actionSource.includes('restoreUser(userId)'), true);

  assert.match(adminSource, /\.rpc\(\s*'admin_get_user_profile'/);
  assert.match(adminSource, /\.rpc\(\s*'admin_get_user_moderation_state'/);
  assert.match(
    adminSource,
    /\.rpc\(\s*'list_admin_user_moderation_audit_events'/
  );
  assert.match(adminSource, /\.rpc\(\s*'suspend_user'/);
  assert.match(adminSource, /\.rpc\(\s*'restore_user'/);

  assert.equal(adminSource.includes('private.user_is_suspended'), false);

  assert.equal(
    reportsSource.includes('href={`/admin/users/${report.reporterId}`}'),
    true
  );
  assert.equal(
    reportsSource.includes('href={`/admin/users/${report.sellerId}`}'),
    true
  );

  assert.equal(
    migrationSource.includes('private.user_moderation_audit_events'),
    true
  );

  assert.match(
    migrationSource,
    /from auth\.users u\s+left join public\.profiles p\s+on p\.id = u\.id\s+where u\.id = p_user_id;/
  );

  assert.equal(
    migrationSource.includes('public.current_user_is_admin()'),
    true
  );

  assert.equal(
    migrationSource.includes(
      'grant execute on function public.admin_get_user_profile(uuid) to authenticated;'
    ),
    true
  );

  assert.equal(
    migrationSource.includes(
      'grant select on private.user_moderation_audit_events'
    ),
    false
  );
});

test('phase 2I-B2 user-facing strings are present after translation review', () => {
  const ruMessages = JSON.parse(readFileSync('src/messages/ru.json', 'utf8'));
  const tyvMessages = JSON.parse(readFileSync('src/messages/tyv.json', 'utf8'));

  const reviewPaths = [
    'Account.suspendedAccountTitle',
    'Account.suspendedAccountMessage',
    'Account.suspendedProfileActionMessage',
    'Account.suspendedListingBadge',
    'Account.suspendedListingMessage',
    'Account.suspendedListingActionMessage',
    'Messages.messagingSuspendedMessage',
    'EditListing.suspendedEditTitle',
    'EditListing.suspendedEditMessage',
    'AdminUsers.kicker',
    'AdminUsers.backToReports',
    'AdminUsers.summaryTitle',
    'AdminUsers.moderationTitle',
    'AdminUsers.actionFeedback.failed',
    'AdminUsers.audit.title',
    'AdminUsers.audit.actions.user_suspended',
    'AdminUsers.audit.actions.user_restored',
  ];

  function getStringAtPath(
    messages: Record<string, unknown>,
    path: string
  ): string {
    const value = path.split('.').reduce<unknown>((current, segment) => {
      if (!current || typeof current !== 'object') {
        return undefined;
      }

      return (current as Record<string, unknown>)[segment];
    }, messages);

    if (typeof value !== 'string') {
      assert.fail(`${path} must be a string`);
    }

    return value;
  }

  for (const path of reviewPaths) {
    assert.notEqual(getStringAtPath(ruMessages, path).trim(), '');
    assert.notEqual(getStringAtPath(tyvMessages, path).trim(), '');
  }
});