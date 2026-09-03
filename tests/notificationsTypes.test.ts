import assert from 'node:assert/strict';
import test from 'node:test';
import {
  databaseNotificationRowToApp,
  getNotificationHref,
  isDatabaseNotificationRow,
  isDatabaseNotificationRowArray,
  isNotificationType,
} from '../src/lib/notificationsTypes.js';

const baseRow = {
  notification_id: 'notification-1',
  notification_type: 'message_received',
  actor_display_name: 'Aldyn',
  conversation_id: 'conversation-1',
  conversation_title: 'Winter tires',
  review_id: null,
  review_listing_title: null,
  listing_id: null,
  listing_title: null,
  old_listing_status: null,
  new_listing_status: null,
  read_at: null,
  created_at: '2026-09-04T12:00:00.000Z',
} as const;

test('notification types recognize only stable identifiers', () => {
  assert.equal(isNotificationType('message_received'), true);
  assert.equal(isNotificationType('review_received'), true);
  assert.equal(isNotificationType('saved_listing_status_changed'), true);
  assert.equal(isNotificationType('price_changed'), false);
  assert.equal(isNotificationType(''), false);
});

test('notification rows parse defensively at the TypeScript boundary', () => {
  assert.equal(isDatabaseNotificationRow(baseRow), true);
  assert.equal(
    isDatabaseNotificationRow({
      ...baseRow,
      actor_display_name: null,
    }),
    true
  );
  assert.equal(isDatabaseNotificationRowArray([baseRow]), true);
  assert.equal(
    isDatabaseNotificationRow({
      ...baseRow,
      notification_type: 'unknown',
    }),
    false
  );
  assert.equal(
    isDatabaseNotificationRow({
      ...baseRow,
      old_listing_status: 'draft',
    }),
    false
  );
});

test('notification destination construction stays account and locale-link friendly', () => {
  assert.equal(
    getNotificationHref({
      notification_type: 'message_received',
      conversation_id: 'conversation-1',
      listing_id: null,
    }),
    '/account/messages/conversation-1'
  );
  assert.equal(
    getNotificationHref({
      notification_type: 'review_received',
      conversation_id: null,
      listing_id: null,
    }),
    '/account/reviews'
  );
  assert.equal(
    getNotificationHref({
      notification_type: 'saved_listing_status_changed',
      conversation_id: null,
      listing_id: 'db-listing-1',
    }),
    '/listing/db-listing-1'
  );
});

test('unknown or incomplete notification references fall back safely', () => {
  const appNotification = databaseNotificationRowToApp({
    ...baseRow,
    conversation_id: null,
  });

  assert.equal(appNotification.href, '/account/notifications');
  assert.equal(appNotification.id, 'notification-1');
  assert.equal(appNotification.actorDisplayName, 'Aldyn');
});
