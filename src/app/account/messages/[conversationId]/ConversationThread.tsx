'use client';

import Link from 'next/link';
import type { FormEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  markConversationReadAction,
  sendMessageAction,
} from '@/app/account/messages/actions';
import { content } from '@/content/tyv';
import {
  MESSAGE_BODY_MAX_LENGTH,
  type AppConversation,
  type AppMessage,
} from '@/lib/messagingTypes';

type Props = {
  conversation: AppConversation;
  initialMessages: AppMessage[];
  currentUserId: string;
};

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

export default function ConversationThread({
  conversation,
  initialMessages,
  currentUserId,
}: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [readStatusError, setReadStatusError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const markReadRequestedRef = useRef(false);
  const otherParticipantName = useMemo(() => {
    return conversation.buyerId === currentUserId
      ? conversation.sellerDisplayName
      : conversation.buyerDisplayName;
  }, [conversation, currentUserId]);
  const errorId = 'thread-message-error';

  useEffect(() => {
    if (markReadRequestedRef.current || messages.length === 0) {
      return;
    }

    const storageKey = `charlal:marked-read:${conversation.id}:${conversation.lastMessageAt}`;

    try {
      if (window.sessionStorage.getItem(storageKey) === '1') {
        markReadRequestedRef.current = true;
        return;
      }
    } catch {
      // Session storage is only a refresh-loop guard; durable read state is in PostgreSQL.
    }

    markReadRequestedRef.current = true;

    async function markRead(): Promise<void> {
      const result = await markConversationReadAction(conversation.id);

      if (!result.ok) {
        setReadStatusError(content.unableUpdateMessageStatusMessage);
        return;
      }

      try {
        window.sessionStorage.setItem(storageKey, '1');
      } catch {
        // Ignore storage failures; the database read marker was already updated.
      }

      router.refresh();
    }

    void markRead();
  }, [conversation.id, conversation.lastMessageAt, messages.length, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
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

    setIsSubmitting(true);
    setError('');

    const result = await sendMessageAction({
      conversationId: conversation.id,
      body: safeBody,
    });

    setIsSubmitting(false);

    if (!result.ok) {
      setError(getSendErrorMessage(result.reason));
      return;
    }

    setMessages((currentMessages) =>
      currentMessages.some((message) => message.id === result.message.id)
        ? currentMessages
        : [...currentMessages, result.message]
    );
    setBody('');
    router.refresh();
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

      <div className="message-list" aria-live="polite">
        {messages.map((message) => {
          const isOwnMessage = message.senderId === currentUserId;

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
            </article>
          );
        })}
      </div>

      {readStatusError ? (
        <p className="form-error" role="alert">
          {readStatusError}
        </p>
      ) : null}

      <form className="message-form" onSubmit={handleSubmit} noValidate>
        <label className="form-field" htmlFor="thread-message-body">
          <span>{content.writeMessageLabel}</span>
          <textarea
            id="thread-message-body"
            name="body"
            value={body}
            maxLength={MESSAGE_BODY_MAX_LENGTH}
            rows={4}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => {
              setBody(event.target.value);
              setError('');
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
          <button type="submit" className="search-button" disabled={isSubmitting}>
            {isSubmitting ? content.sendingMessageButton : content.sendMessageButton}
          </button>
        </div>
      </form>
    </div>
  );
}
