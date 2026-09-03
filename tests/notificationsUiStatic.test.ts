import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('notifications route is locale-aware and protected like account pages', () => {
  const pageSource = readFileSync(
    'src/app/[locale]/account/notifications/page.tsx',
    'utf8'
  );

  assert.equal(pageSource.includes("getSignInHref('/account/notifications', locale)"), true);
  assert.equal(pageSource.includes("getTranslations('Notifications')"), true);
  assert.equal(pageSource.includes('listCurrentUserNotifications()'), true);
});

test('notification UI uses structured records and deterministic date formatting', () => {
  const listSource = readFileSync(
    'src/app/[locale]/account/notifications/NotificationsList.tsx',
    'utf8'
  );

  assert.equal(listSource.includes('AppNotification'), true);
  assert.equal(listSource.includes('formatAppShortDate'), true);
  assert.equal(listSource.includes('formatAppTime'), true);
  assert.equal(listSource.includes('new Intl.DateTimeFormat(locale)'), false);
  assert.equal(listSource.includes('const result = await markNotificationReadAction(notification.id)'), true);
  assert.equal(listSource.includes('if (result.ok)'), true);
  assert.equal(listSource.includes('markAllNotificationsReadAction()'), true);
  assert.equal(listSource.includes('router.push(notification.href)'), true);
  assert.equal(listSource.includes("t('actorFallbackDisplayName')"), true);
});

test('notification realtime provider is wired into the app shell and header', () => {
  const layoutSource = readFileSync('src/app/[locale]/layout.tsx', 'utf8');
  const headerSource = readFileSync('src/app/components/SiteHeader.tsx', 'utf8');
  const providerSource = readFileSync(
    'src/lib/notificationsRealtime.tsx',
    'utf8'
  );

  assert.equal(layoutSource.includes('<NotificationsRealtimeProvider>'), true);
  assert.equal(headerSource.includes('useNotificationsRealtime()'), true);
  assert.equal(headerSource.includes('href="/account/notifications"'), true);
  assert.equal(headerSource.includes("t('unreadNotifications'"), true);
  assert.equal(providerSource.includes("table: 'notifications'"), true);
  assert.equal(providerSource.includes('filter: `user_id=eq.${userId}`'), true);
  assert.equal(providerSource.includes('removeChannel(channelToRemove)'), true);
  assert.equal(providerSource.includes('channelStatusVersionRef'), true);
  assert.equal(providerSource.includes('channelReconnectGeneration'), true);
  assert.equal(providerSource.includes("nextStatus === 'CHANNEL_ERROR'"), true);
  assert.equal(providerSource.includes("nextStatus === 'TIMED_OUT'"), true);
  assert.equal(providerSource.includes("nextStatus === 'CLOSED'"), true);
  assert.equal(providerSource.includes("window.addEventListener('online', handleOnline)"), true);
  assert.equal(providerSource.includes('void refreshNotificationsStateForUser(userId)'), true);
});

test('application code uses notification RPCs instead of direct inserts', () => {
  const helperSource = readFileSync('src/lib/supabase/notifications.ts', 'utf8');
  const actionSource = readFileSync(
    'src/app/account/notifications/actions.ts',
    'utf8'
  );

  assert.equal(helperSource.includes("rpc('list_my_notifications'"), true);
  assert.equal(helperSource.includes("rpc('count_unread_notifications'"), true);
  assert.equal(helperSource.includes("rpc('mark_notification_read'"), true);
  assert.equal(helperSource.includes("rpc('mark_all_notifications_read'"), true);
  assert.equal(helperSource.includes(".from('notifications').insert"), false);
  assert.equal(actionSource.includes("revalidateLocalizedPath('/account/notifications')"), true);
});
