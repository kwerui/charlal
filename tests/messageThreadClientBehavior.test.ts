import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canStartThreadRealtime,
  countRealtimeChannelsForTopic,
  countRealtimeChannelsForTopicPrefix,
  getRealtimeChannelName,
  getMessageSnapshotHydrationRetryDelayMs,
  getThreadRealtimePostgresChangeSpecs,
  getScrollBottomDistance,
  getThreadRealtimeRetryDelayMs,
  isNearMessageThreadBottom,
  shouldRetryMessageSnapshotHydration,
  shouldHydrateRealtimeMessageSnapshot,
  shouldAutoScrollForThreadMessage,
  toSupabaseRealtimeTopic,
} from '../src/lib/messageThreadClientBehavior.js';

test('detects whether the message thread is near the bottom', () => {
  assert.equal(
    getScrollBottomDistance({
      scrollHeight: 1000,
      clientHeight: 400,
      scrollTop: 520,
    }),
    80
  );
  assert.equal(
    isNearMessageThreadBottom({
      scrollHeight: 1000,
      clientHeight: 400,
      scrollTop: 520,
    }),
    true
  );
  assert.equal(
    isNearMessageThreadBottom({
      scrollHeight: 1000,
      clientHeight: 400,
      scrollTop: 300,
    }),
    false
  );
});

test('auto-scrolls own messages even when the reader is not near the bottom', () => {
  assert.equal(
    shouldAutoScrollForThreadMessage({
      senderId: 'current-user',
      currentUserId: 'current-user',
      wasNearBottom: false,
    }),
    true
  );
  assert.equal(
    shouldAutoScrollForThreadMessage({
      senderId: 'other-user',
      currentUserId: 'current-user',
      wasNearBottom: false,
    }),
    false
  );
});

test('starts thread realtime only after client auth is restored for this user', () => {
  assert.equal(
    canStartThreadRealtime({
      authStatus: 'checking',
      authUserId: null,
      currentUserId: 'current-user',
      isBrowserOnline: true,
    }),
    false
  );
  assert.equal(
    canStartThreadRealtime({
      authStatus: 'authenticated',
      authUserId: 'different-user',
      currentUserId: 'current-user',
      isBrowserOnline: true,
    }),
    false
  );
  assert.equal(
    canStartThreadRealtime({
      authStatus: 'authenticated',
      authUserId: 'current-user',
      currentUserId: 'current-user',
      isBrowserOnline: true,
    }),
    true
  );
});

test('caps thread realtime retry delays at the maximum configured delay', () => {
  assert.equal(getThreadRealtimeRetryDelayMs(0), 1000);
  assert.equal(getThreadRealtimeRetryDelayMs(1), 3000);
  assert.equal(getThreadRealtimeRetryDelayMs(99), 15000);
});

test('maps app channel names to Supabase realtime topics and counts duplicates', () => {
  const topic = toSupabaseRealtimeTopic('messaging-thread:conversation-1');

  assert.equal(topic, 'realtime:messaging-thread:conversation-1');
  assert.equal(
    countRealtimeChannelsForTopic(
      [
        { topic },
        { topic: 'realtime:messaging-global:user-1' },
        { topic },
      ],
      topic
    ),
    2
  );
});

test('uses generation-specific realtime topics to avoid stale same-topic cleanup', () => {
  const baseName = 'messaging-thread:conversation-1';
  const firstChannelName = getRealtimeChannelName(baseName, 1);
  const secondChannelName = getRealtimeChannelName(baseName, 2);
  const firstTopic = toSupabaseRealtimeTopic(firstChannelName);
  const secondTopic = toSupabaseRealtimeTopic(secondChannelName);

  assert.equal(firstChannelName, 'messaging-thread:conversation-1:g1');
  assert.equal(secondChannelName, 'messaging-thread:conversation-1:g2');
  assert.notEqual(firstTopic, secondTopic);
  assert.equal(
    countRealtimeChannelsForTopic(
      [{ topic: firstTopic }, { topic: secondTopic }],
      firstTopic
    ),
    1
  );
  assert.equal(
    countRealtimeChannelsForTopicPrefix(
      [{ topic: firstTopic }, { topic: secondTopic }],
      toSupabaseRealtimeTopic(`${baseName}:`)
    ),
    2
  );
});

test('hydrates snapshots for attachment events or message events without attachments', () => {
  assert.equal(
    shouldHydrateRealtimeMessageSnapshot({
      eventTable: 'messages',
      rawEventIncludesAttachments: true,
    }),
    false
  );
  assert.equal(
    shouldHydrateRealtimeMessageSnapshot({
      eventTable: 'messages',
      rawEventIncludesAttachments: false,
    }),
    true
  );
  assert.equal(
    shouldHydrateRealtimeMessageSnapshot({
      eventTable: 'message_attachments',
      rawEventIncludesAttachments: false,
    }),
    true
  );
});

test('thread realtime joins only conversation-scoped message and read tables', () => {
  const specs = getThreadRealtimePostgresChangeSpecs('conversation-1');

  assert.deepEqual(
    specs.map((spec) => `${spec.table}:${spec.event}:${spec.filter}`),
    [
      'messages:INSERT:conversation_id=eq.conversation-1',
      'messages:UPDATE:conversation_id=eq.conversation-1',
      'conversation_reads:INSERT:conversation_id=eq.conversation-1',
      'conversation_reads:UPDATE:conversation_id=eq.conversation-1',
    ]
  );
  assert.equal(
    specs.map((spec) => String(spec.table)).includes('message_attachments'),
    false
  );
});

test('retries one-message hydration only for new messages with no attachments yet', () => {
  assert.equal(getMessageSnapshotHydrationRetryDelayMs(0), 750);
  assert.equal(getMessageSnapshotHydrationRetryDelayMs(1), 2000);
  assert.equal(getMessageSnapshotHydrationRetryDelayMs(2), null);
  assert.equal(
    shouldRetryMessageSnapshotHydration({
      reason: 'message-insert',
      attachmentCount: 0,
      retryAttemptIndex: 0,
    }),
    true
  );
  assert.equal(
    shouldRetryMessageSnapshotHydration({
      reason: 'message-update',
      attachmentCount: 0,
      retryAttemptIndex: 0,
    }),
    false
  );
  assert.equal(
    shouldRetryMessageSnapshotHydration({
      reason: 'message-insert',
      attachmentCount: 1,
      retryAttemptIndex: 0,
    }),
    false
  );
  assert.equal(
    shouldRetryMessageSnapshotHydration({
      reason: 'message-insert',
      attachmentCount: 0,
      retryAttemptIndex: 2,
    }),
    false
  );
});
