import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getMessagingRealtimeStatusAfterSnapshotRefresh,
  getMessagingRealtimeStatusAfterSubscriptionStatus,
} from '../src/lib/messagingRealtimeClientBehavior.js';

test('server snapshot refresh does not mark realtime subscribed', () => {
  assert.equal(
    getMessagingRealtimeStatusAfterSnapshotRefresh('idle'),
    'idle'
  );
  assert.equal(
    getMessagingRealtimeStatusAfterSnapshotRefresh('reconnecting'),
    'reconnecting'
  );
  assert.equal(
    getMessagingRealtimeStatusAfterSnapshotRefresh('unavailable'),
    'unavailable'
  );
});

test('only the actual subscribed callback marks messaging realtime healthy', () => {
  assert.equal(
    getMessagingRealtimeStatusAfterSubscriptionStatus({
      nextStatus: 'SUBSCRIBED',
      hadSubscribed: false,
    }),
    'subscribed'
  );
  assert.equal(
    getMessagingRealtimeStatusAfterSubscriptionStatus({
      nextStatus: 'TIMED_OUT',
      hadSubscribed: false,
    }),
    'unavailable'
  );
  assert.equal(
    getMessagingRealtimeStatusAfterSubscriptionStatus({
      nextStatus: 'CHANNEL_ERROR',
      hadSubscribed: true,
    }),
    'unavailable'
  );
  assert.equal(
    getMessagingRealtimeStatusAfterSubscriptionStatus({
      nextStatus: 'CLOSED',
      hadSubscribed: true,
    }),
    'reconnecting'
  );
});
