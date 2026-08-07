'use client';

import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { startConversationAction } from '@/app/account/messages/actions';
import { content } from '@/content/tyv';
import { MESSAGE_BODY_MAX_LENGTH } from '@/lib/messagingTypes';

type Props = {
  listingId: string;
};

function getMessagingErrorMessage(reason: string): string {
  if (reason === 'empty-message') {
    return content.messageEmptyMessage;
  }

  if (reason === 'message-too-long') {
    return content.messageTooLongMessage;
  }

  if (reason === 'self-message') {
    return content.messagingCannotMessageSelfMessage;
  }

  if (reason === 'unauthenticated') {
    return content.unableStartConversationMessage;
  }

  return content.unableStartConversationMessage;
}

export default function ContactSellerForm({ listingId }: Props) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const errorId = 'contact-message-error';

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

    const result = await startConversationAction({
      listingId,
      body: safeBody,
    });

    setIsSubmitting(false);

    if (!result.ok) {
      setError(getMessagingErrorMessage(result.reason));
      return;
    }

    setBody('');
    router.push(`/account/messages/${result.conversationId}`);
    router.refresh();
  }

  return (
    <form className="message-form" onSubmit={handleSubmit} noValidate>
      <label className="form-field" htmlFor="initial-message-body">
        <span>{content.writeMessageLabel}</span>
        <textarea
          id="initial-message-body"
          name="body"
          value={body}
          maxLength={MESSAGE_BODY_MAX_LENGTH}
          rows={6}
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
      <button type="submit" className="search-button form-submit-button" disabled={isSubmitting}>
        {isSubmitting ? content.sendingMessageButton : content.sendMessageButton}
      </button>
    </form>
  );
}
