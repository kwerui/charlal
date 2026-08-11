'use client';

import type {
  RealtimePostgresInsertPayload,
  RealtimePostgresUpdatePayload,
} from '@supabase/realtime-js';
import Link from 'next/link';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getConversationThreadSnapshotAction,
  markConversationReadAction,
  sendMessageAction,
} from '@/app/account/messages/actions';
import { content } from '@/content/tyv';
import { useMessagingRealtime } from '@/lib/messagingRealtime';
import {
  MESSAGE_BODY_MAX_LENGTH,
  databaseConversationReadRowToApp,
  databaseMessageRowToApp,
  isDatabaseConversationReadRow,
  isDatabaseMessageRow,
  type AppConversationRead,
  type AppConversation,
  type AppMessage,
  type DatabaseConversationReadRow,
  type DatabaseMessageRow,
} from '@/lib/messagingTypes';
import { createClient } from '@/lib/supabase/client';

type Props = {
  conversation: AppConversation;
  initialMessages: AppMessage[];
  initialReadMarkers: AppConversationRead[];
  currentUserId: string;
};

type ThreadRealtimeStatus =
  | 'idle'
  | 'subscribed'
  | 'reconnecting'
  | 'unavailable';

type VisibleConnectionStatus =
  | 'offline'
  | 'reconnecting'
  | 'unavailable'
  | null;

type SendStatus =
  | 'idle'
  | 'sending'
  | 'delivery-uncertain'
  | 'failed';

type PendingDelivery = {
  body: string;
  clientAttemptId: string;
};

const SEND_CONFIRMATION_TIMEOUT_MS = 12000;

function formatMessageDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getSendErrorMessage(reason: string): string {
  if (reason === 'empty-message') {
    return content.messageEmptyMessage;
  }

  if (reason === 'message-too-long') {
    return content.messageTooLongMessage;
  }

  return content.unableSendMessageMessage;
}

function compareMessagesByCreatedAt(left: AppMessage, right: AppMessage): number {
  const leftTime = Date.parse(left.createdAt);
  const rightTime = Date.parse(right.createdAt);

  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  return left.id.localeCompare(right.id);
}

function mergeMessage(
  currentMessages: AppMessage[],
  nextMessage: AppMessage
): AppMessage[] {
  if (currentMessages.some((message) => message.id === nextMessage.id)) {
    return currentMessages;
  }

  return [...currentMessages, nextMessage].sort(compareMessagesByCreatedAt);
}

function mergeReadMarker(
  currentMarkers: AppConversationRead[],
  nextMarker: AppConversationRead
): AppConversationRead[] {
  const existingMarker = currentMarkers.find(
    (marker) =>
      marker.conversationId === nextMarker.conversationId &&
      marker.userId === nextMarker.userId
  );

  if (!existingMarker) {
    return [...currentMarkers, nextMarker];
  }

  return currentMarkers.map((marker) =>
    marker.conversationId === nextMarker.conversationId &&
    marker.userId === nextMarker.userId
      ? nextMarker
      : marker
  );
}

function isNearHistoryBottom(historyElement: HTMLDivElement | null): boolean {
  if (!historyElement) {
    return true;
  }

  return (
    historyElement.scrollHeight -
      historyElement.clientHeight -
      historyElement.scrollTop <=
    96
  );
}

function scrollHistoryToBottom(historyElement: HTMLDivElement | null): void {
  if (!historyElement) {
    return;
  }

  historyElement.scrollTop = historyElement.scrollHeight;
}

function getConnectionStatusMessage(status: VisibleConnectionStatus): string {
  if (status === 'offline') {
    return content.offlineThreadStatusMessage;
  }

  if (status === 'reconnecting') {
    return content.reconnectingLabel;
  }

  if (status === 'unavailable') {
    return content.liveUpdatesUnavailableMessage;
  }

  return '';
}

function isDeliveryMatch(
  message: AppMessage,
  pendingDelivery: PendingDelivery,
  currentUserId: string
): boolean {
  return (
    message.senderId === currentUserId &&
    message.clientAttemptId === pendingDelivery.clientAttemptId
  );
}

function createClientAttemptId(): string {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  const randomValues = new Uint8Array(16);
  window.crypto.getRandomValues(randomValues);
  randomValues[6] = (randomValues[6] & 0x0f) | 0x40;
  randomValues[8] = (randomValues[8] & 0x3f) | 0x80;

  const hexValues = Array.from(randomValues, (value) =>
    value.toString(16).padStart(2, '0')
  );

  return [
    hexValues.slice(0, 4).join(''),
    hexValues.slice(4, 6).join(''),
    hexValues.slice(6, 8).join(''),
    hexValues.slice(8, 10).join(''),
    hexValues.slice(10, 16).join(''),
  ].join('-');
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error('message-send-timeout'));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

export default function ConversationThread({
  conversation,
  initialMessages,
  initialReadMarkers,
  currentUserId,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const { refreshMessagingState } = useMessagingRealtime();
  const [messages, setMessages] = useState(() =>
    [...initialMessages].sort(compareMessagesByCreatedAt)
  );
  const [readMarkers, setReadMarkers] = useState(initialReadMarkers);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [readStatusError, setReadStatusError] = useState('');
  const [sendStatus, setSendStatus] = useState<SendStatus>('idle');
  const [isBrowserOnline, setIsBrowserOnline] = useState(true);
  const [threadStatus, setThreadStatus] =
    useState<ThreadRealtimeStatus>('idle');
  const [showNewMessagesButton, setShowNewMessagesButton] = useState(false);
  const markReadRequestedRef = useRef(false);
  const hasSubscribedRef = useRef(false);
  const shouldScrollToBottomRef = useRef(true);
  const messageHistoryRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mountedRef = useRef(false);
  const sendAttemptRef = useRef(0);
  const sendStatusRef = useRef<SendStatus>('idle');
  const pendingDeliveryRef = useRef<PendingDelivery | null>(null);
  const threadStatusRef = useRef<ThreadRealtimeStatus>('idle');
  const otherParticipantName = useMemo(() => {
    return conversation.buyerId === currentUserId
      ? conversation.sellerDisplayName
      : conversation.buyerDisplayName;
  }, [conversation, currentUserId]);
  const otherParticipantId =
    conversation.buyerId === currentUserId
      ? conversation.sellerId
      : conversation.buyerId;
  const latestOwnMessage = useMemo(() => {
    return [...messages]
      .filter((message) => message.senderId === currentUserId)
      .sort(compareMessagesByCreatedAt)
      .at(-1);
  }, [currentUserId, messages]);
  const otherReadMarker = readMarkers.find(
    (marker) => marker.userId === otherParticipantId
  );
  const errorId = 'thread-message-error';
  const visibleConnectionStatus: VisibleConnectionStatus = !isBrowserOnline
    ? 'offline'
    : threadStatus === 'unavailable'
      ? 'unavailable'
      : threadStatus === 'reconnecting'
        ? 'reconnecting'
        : null;

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      sendAttemptRef.current += 1;
      pendingDeliveryRef.current = null;
    };
  }, []);

  useEffect(() => {
    threadStatusRef.current = threadStatus;
  }, [threadStatus]);

  useEffect(() => {
    sendStatusRef.current = sendStatus;
  }, [sendStatus]);

  const updateSendStatus = useCallback((nextStatus: SendStatus): void => {
    sendStatusRef.current = nextStatus;
    setSendStatus(nextStatus);
  }, []);

  const reconcileThread = useCallback(async (): Promise<void> => {
    const result = await getConversationThreadSnapshotAction(conversation.id);

    if (!mountedRef.current || !result.ok) {
      return;
    }

    const sortedMessages = [...result.messages].sort(compareMessagesByCreatedAt);

    setMessages(sortedMessages);
    setReadMarkers(result.readMarkers);

    const pendingDelivery = pendingDeliveryRef.current;

    if (
      pendingDelivery &&
      sortedMessages.some((message) =>
        isDeliveryMatch(message, pendingDelivery, currentUserId)
      )
    ) {
      pendingDeliveryRef.current = null;
      updateSendStatus('idle');
      setError('');
      setBody((currentBody) =>
        currentBody.trim() === pendingDelivery.body ? '' : currentBody
      );
      shouldScrollToBottomRef.current = true;
    }

    void refreshMessagingState();
  }, [conversation.id, currentUserId, refreshMessagingState, updateSendStatus]);

  const markThreadRead = useCallback(async (): Promise<void> => {
    const result = await markConversationReadAction(conversation.id);

    if (!mountedRef.current) {
      return;
    }

    if (!result.ok) {
      setReadStatusError(content.unableUpdateMessageStatusMessage);
      return;
    }

    setReadStatusError('');
    setReadMarkers((currentMarkers) =>
      mergeReadMarker(currentMarkers, {
        conversationId: conversation.id,
        userId: currentUserId,
        lastReadAt: new Date().toISOString(),
      })
    );
    void refreshMessagingState();
  }, [conversation.id, currentUserId, refreshMessagingState]);

  useEffect(() => {
    let active = true;

    queueMicrotask(() => {
      if (active) {
        setIsBrowserOnline(navigator.onLine);
      }
    });

    function handleOffline(): void {
      setIsBrowserOnline(false);

      if (hasSubscribedRef.current) {
        setThreadStatus('reconnecting');
      }

      if (sendStatusRef.current === 'sending') {
        sendAttemptRef.current += 1;
        updateSendStatus('delivery-uncertain');
        setError(content.messageDeliveryUnconfirmedMessage);
      }
    }

    function handleOnline(): void {
      setIsBrowserOnline(true);

      if (
        hasSubscribedRef.current &&
        threadStatusRef.current !== 'subscribed'
      ) {
        setThreadStatus('reconnecting');
      }

      void reconcileThread();
    }

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      active = false;
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [reconcileThread, updateSendStatus]);

  useEffect(() => {
    if (markReadRequestedRef.current || messages.length === 0) {
      return;
    }

    markReadRequestedRef.current = true;
    void markThreadRead();
  }, [markThreadRead, messages.length]);

  useEffect(() => {
    let active = true;

    function handleIncomingMessage(
      payload: RealtimePostgresInsertPayload<DatabaseMessageRow>
    ) {
      if (!active || !isDatabaseMessageRow(payload.new)) {
        return;
      }

      const nextMessage = databaseMessageRowToApp(payload.new);
      const shouldAutoScroll =
        nextMessage.senderId === currentUserId ||
        isNearHistoryBottom(messageHistoryRef.current);

      shouldScrollToBottomRef.current = shouldAutoScroll;
      setShowNewMessagesButton(
        nextMessage.senderId !== currentUserId && !shouldAutoScroll
      );
      setMessages((currentMessages) =>
        mergeMessage(currentMessages, nextMessage)
      );

      if (nextMessage.senderId !== currentUserId) {
        void markThreadRead();
        return;
      }

      const pendingDelivery = pendingDeliveryRef.current;

      if (
        pendingDelivery &&
        isDeliveryMatch(nextMessage, pendingDelivery, currentUserId)
      ) {
        pendingDeliveryRef.current = null;
        updateSendStatus('idle');
        setError('');
        setBody((currentBody) =>
          currentBody.trim() === pendingDelivery.body ? '' : currentBody
        );
      }
    }

    function handleReadMarkerChange(
      payload:
        | RealtimePostgresInsertPayload<DatabaseConversationReadRow>
        | RealtimePostgresUpdatePayload<DatabaseConversationReadRow>
    ) {
      if (!active || !isDatabaseConversationReadRow(payload.new)) {
        return;
      }

      setReadMarkers((currentMarkers) =>
        mergeReadMarker(
          currentMarkers,
          databaseConversationReadRowToApp(payload.new)
        )
      );
    }

    const channel = supabase
      .channel(`messaging-thread:${conversation.id}`)
      .on<DatabaseMessageRow>(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        handleIncomingMessage
      )
      .on<DatabaseConversationReadRow>(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversation_reads',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        handleReadMarkerChange
      )
      .on<DatabaseConversationReadRow>(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversation_reads',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        handleReadMarkerChange
      )
      .subscribe((nextStatus) => {
        if (!active) {
          return;
        }

        if (nextStatus === 'SUBSCRIBED') {
          hasSubscribedRef.current = true;
          setThreadStatus('subscribed');
          return;
        }

        if (nextStatus === 'CHANNEL_ERROR' || nextStatus === 'TIMED_OUT') {
          setThreadStatus('unavailable');
          return;
        }

        if (nextStatus === 'CLOSED' && hasSubscribedRef.current) {
          setThreadStatus('reconnecting');
        }
      });

    return () => {
      active = false;
      hasSubscribedRef.current = false;
      void supabase.removeChannel(channel);
    };
  }, [conversation.id, currentUserId, markThreadRead, supabase, updateSendStatus]);

  useEffect(() => {
    if (!shouldScrollToBottomRef.current) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      scrollHistoryToBottom(messageHistoryRef.current);
      setShowNewMessagesButton(false);
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [messages.length]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (sendStatus === 'sending') {
      return;
    }

    const safeBody = body.trim();

    if (!safeBody) {
      setError(content.messageEmptyMessage);
      return;
    }

    if (safeBody.length > MESSAGE_BODY_MAX_LENGTH) {
      setError(content.messageTooLongMessage);
      return;
    }

    if (!isBrowserOnline) {
      updateSendStatus('failed');
      setError(content.offlineBeforeSendMessage);
      return;
    }

    const existingPendingDelivery = pendingDeliveryRef.current;
    const clientAttemptId =
      existingPendingDelivery &&
      existingPendingDelivery.body === safeBody &&
      sendStatus === 'delivery-uncertain'
        ? existingPendingDelivery.clientAttemptId
        : createClientAttemptId();
    const attemptId = sendAttemptRef.current + 1;
    const pendingDelivery: PendingDelivery = {
      body: safeBody,
      clientAttemptId,
    };

    sendAttemptRef.current = attemptId;
    pendingDeliveryRef.current = pendingDelivery;
    updateSendStatus('sending');
    setError('');

    let handledAttempt = false;

    try {
      const result = await withTimeout(
        sendMessageAction({
          conversationId: conversation.id,
          body: safeBody,
          clientAttemptId,
        }),
        SEND_CONFIRMATION_TIMEOUT_MS
      );

      if (!mountedRef.current || sendAttemptRef.current !== attemptId) {
        return;
      }

      if (!result.ok) {
        pendingDeliveryRef.current = null;
        handledAttempt = true;
        updateSendStatus('failed');
        setError(getSendErrorMessage(result.reason));
        return;
      }

      pendingDeliveryRef.current = null;
      handledAttempt = true;
      setMessages((currentMessages) =>
        mergeMessage(currentMessages, result.message)
      );
      shouldScrollToBottomRef.current = true;
      setBody('');
      setError('');
      updateSendStatus('idle');
      window.requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
      void refreshMessagingState();
    } catch {
      if (!mountedRef.current || sendAttemptRef.current !== attemptId) {
        return;
      }

      handledAttempt = true;
      updateSendStatus('delivery-uncertain');
      setError(content.messageDeliveryUnconfirmedMessage);

      if (isBrowserOnline) {
        void reconcileThread();
      }
    } finally {
      if (
        mountedRef.current &&
        sendAttemptRef.current === attemptId &&
        !handledAttempt
      ) {
        updateSendStatus('idle');
      }
    }
  }

  return (
    <div className="conversation-thread">
      <div className="conversation-thread-heading">
        <div>
          <p className="hero-kicker">{content.messagesTitle}</p>
          <h1>{conversation.listingTitle}</h1>
          <p>{otherParticipantName}</p>
        </div>
        {conversation.listingId ? (
          <Link href={`/listing/${conversation.listingId}`} className="secondary-button">
            {content.openListingLabel}
          </Link>
        ) : (
          <p className="conversation-listing-unavailable">
            {content.advertisementNoLongerAvailableMessage}
          </p>
        )}
      </div>

      {visibleConnectionStatus ? (
        <p
          className={`messaging-live-status messaging-live-status--${visibleConnectionStatus}`}
          role="status"
        >
          {getConnectionStatusMessage(visibleConnectionStatus)}
        </p>
      ) : null}

      <div
        ref={messageHistoryRef}
        className="message-list"
        aria-label={content.messagesTitle}
        aria-live="polite"
        tabIndex={0}
      >
        {messages.map((message) => {
          const isOwnMessage = message.senderId === currentUserId;
          const isLatestOwnMessage = latestOwnMessage?.id === message.id;
          const readByOtherParticipant =
            Boolean(otherReadMarker) &&
            Date.parse(otherReadMarker?.lastReadAt || '') >=
              Date.parse(message.createdAt);

          return (
            <article
              key={message.id}
              className={
                isOwnMessage
                  ? 'message-bubble message-bubble--own'
                  : 'message-bubble message-bubble--other'
              }
            >
              <p>{message.body}</p>
              <time dateTime={message.createdAt}>
                {formatMessageDate(message.createdAt)}
              </time>
              {isOwnMessage && isLatestOwnMessage ? (
                <span
                  className={
                    readByOtherParticipant
                      ? 'message-read-receipt message-read-receipt--read'
                      : 'message-read-receipt'
                  }
                >
                  {readByOtherParticipant
                    ? content.readMessageReceiptLabel
                    : content.sentMessageReceiptLabel}
                </span>
              ) : null}
            </article>
            );
        })}
      </div>

      {showNewMessagesButton ? (
        <button
          type="button"
          className="new-messages-button"
          onClick={() => {
            shouldScrollToBottomRef.current = true;
            scrollHistoryToBottom(messageHistoryRef.current);
            setShowNewMessagesButton(false);
          }}
        >
          {content.jumpToNewestMessageButton}
        </button>
      ) : null}

      {readStatusError ? (
        <p className="form-error" role="alert">
          {readStatusError}
        </p>
      ) : null}

      <form className="message-form" onSubmit={handleSubmit} noValidate>
        <label className="form-field" htmlFor="thread-message-body">
          <span>{content.writeMessageLabel}</span>
          <textarea
            ref={textareaRef}
            id="thread-message-body"
            name="body"
            value={body}
            maxLength={MESSAGE_BODY_MAX_LENGTH}
            rows={4}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => {
              const nextBody = event.target.value;

              setBody(nextBody);
              setError('');

              if (
                pendingDeliveryRef.current &&
                nextBody.trim() !== pendingDeliveryRef.current.body
              ) {
                pendingDeliveryRef.current = null;

                if (sendStatusRef.current === 'delivery-uncertain') {
                  updateSendStatus('idle');
                }
              }
            }}
            required
          />
        </label>
        {error ? (
          <p id={errorId} className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="message-form-actions">
          <Link href="/account/messages" className="secondary-button">
            {content.backToMessages}
          </Link>
          <button
            type="submit"
            className="search-button"
            disabled={sendStatus === 'sending'}
            aria-busy={sendStatus === 'sending'}
          >
            {sendStatus === 'sending'
              ? content.sendingMessageButton
              : content.sendMessageButton}
          </button>
        </div>
      </form>
    </div>
  );
}
