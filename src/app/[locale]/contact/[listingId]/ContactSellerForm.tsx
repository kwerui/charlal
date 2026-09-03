'use client';

import { useRouter } from '@/i18n/navigation';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { startConversationAction } from '@/app/account/messages/actions';
import { MESSAGE_BODY_MAX_LENGTH } from '@/lib/messagingTypes';
import { useTranslations } from 'next-intl';

type Props = {
  listingId: string;
};

function getMessagingErrorMessage(
  reason: string,
  t: ReturnType<typeof useTranslations<'ContactSeller'>>,
  messagesT: ReturnType<typeof useTranslations<'Messages'>>
): string {
  if (reason === 'empty-message') {
    return messagesT('messageEmptyMessage');
  }

  if (reason === 'message-too-long') {
    return messagesT('messageTooLongMessage');
  }

  if (reason === 'self-message') {
    return t('messagingCannotMessageSelfMessage');
  }

  if (reason === 'unauthenticated') {
    return t('unableStartConversationMessage');
  }

  return t('unableStartConversationMessage');
}

export default function ContactSellerForm({ listingId }: Props) {
  const router = useRouter();
  const t = useTranslations('ContactSeller');
  const messagesT = useTranslations('Messages');
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
      setError(messagesT('messageEmptyMessage'));
      return;
    }

    if (safeBody.length > MESSAGE_BODY_MAX_LENGTH) {
      setError(messagesT('messageTooLongMessage'));
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
      setError(getMessagingErrorMessage(result.reason, t, messagesT));
      return;
    }

    setBody('');
    router.push(`/account/messages/${result.conversationId}`);
    router.refresh();
  }

  return (
    <form className="message-form" onSubmit={handleSubmit} noValidate>
      <label className="form-field" htmlFor="initial-message-body">
        <span>{messagesT('writeMessageLabel')}</span>
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
        {isSubmitting ? messagesT('sendingMessageButton') : messagesT('sendMessageButton')}
      </button>
    </form>
  );
}
