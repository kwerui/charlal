'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { reportListingAction } from '@/app/listing/reportActions';
import {
  LISTING_REPORT_DETAILS_MAX_LENGTH,
  LISTING_REPORT_REASONS,
  type ListingReportReason,
} from '@/lib/listingReports';
import { useAuthStatus } from '@/lib/auth/client';
import { getSafeNextPath } from '@/lib/auth/safeNextPath';

type Props = {
  listingId: string;
  returnHref?: string;
  initialAlreadyReported?: boolean;
};

type ReportFeedbackStatus = 'idle' | 'created' | 'already-reported';

function getSafeCurrentHref(
  pathname: string,
  searchParams: URLSearchParams
): string {
  const search = searchParams.toString();

  return search ? `${pathname}?${search}` : pathname;
}

function getReportErrorMessage(
  reason: string,
  t: ReturnType<typeof useTranslations>
): string {
  if (reason === 'auth-required') {
    return t('signInRequiredMessage');
  }

  if (reason === 'invalid-reason') {
    return t('reasonRequiredMessage');
  }

  if (reason === 'details-too-long') {
    return t('detailsTooLongMessage');
  }

  if (reason === 'own-listing') {
    return t('ownListingMessage');
  }

  if (reason === 'invalid-listing') {
    return t('unavailableMessage');
  }

  return t('failedMessage');
}

export default function ListingReportButton({
  listingId,
  returnHref,
  initialAlreadyReported = false,
}: Props) {
  const t = useTranslations('ListingReport');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { status, user } = useAuthStatus();
  const dialogId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState<ListingReportReason | ''>(
    ''
  );
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');
  const [hasReported, setHasReported] = useState(initialAlreadyReported);
  const [reportStatus, setReportStatus] = useState<ReportFeedbackStatus>('idle');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const activeUserId = status === 'authenticated' && user ? user.id : null;
  const signInReturnHref = getSafeNextPath(
    returnHref || getSafeCurrentHref(pathname, searchParams),
    '/'
  );
  const errorId = `${dialogId}-error`;
  const reasonErrorId = `${dialogId}-reason-error`;
  const detailsHelpId = `${dialogId}-details-help`;

  const closeDialog = useCallback((): void => {
    if (isSubmitting) {
      return;
    }

    setIsOpen(false);
    setError('');
    setSelectedReason('');
    setDetails('');
    setReportStatus('idle');
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, [isSubmitting]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    dialogRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !isSubmitting) {
        closeDialog();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeDialog, isOpen, isSubmitting]);

  function openDialog(): void {
    setError('');

    if (status !== 'authenticated' || !activeUserId) {
      router.push(`/sign-in?next=${encodeURIComponent(signInReturnHref)}`);
      return;
    }

    if (hasReported) {
      setReportStatus('already-reported');
    }

    setIsOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting || reportStatus !== 'idle') {
      return;
    }

    if (!selectedReason) {
      setError(t('reasonRequiredMessage'));
      return;
    }

    if (details.length > LISTING_REPORT_DETAILS_MAX_LENGTH) {
      setError(t('detailsTooLongMessage'));
      return;
    }

    setError('');
    setIsSubmitting(true);

    const result = await reportListingAction({
      listingId,
      reason: selectedReason,
      details,
    });

    setIsSubmitting(false);

    if (!result.ok) {
      setError(getReportErrorMessage(result.reason, t));

      if (result.reason === 'auth-required') {
        router.push(`/sign-in?next=${encodeURIComponent(signInReturnHref)}`);
      }

      return;
    }

    setHasReported(true);
    setReportStatus(result.status);
    setSelectedReason('');
    setDetails('');
  }

  const reportButtonLabel = hasReported
    ? t('alreadyReportedButton')
    : t('button');
  const reasonRequiredMessage = t('reasonRequiredMessage');
  const reasonError = error === reasonRequiredMessage ? error : '';
  const formError = reasonError ? '' : error;

  return (
    <div className="listing-report-control">
      <button
        ref={triggerRef}
        type="button"
        className="listing-report-button"
        onClick={openDialog}
        disabled={status === 'checking'}
      >
        {reportButtonLabel}
      </button>

      {isOpen ? (
        <div className="listing-report-backdrop" onMouseDown={closeDialog}>
          <div
            ref={dialogRef}
            className="listing-report-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${dialogId}-title`}
            tabIndex={-1}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {reportStatus === 'created' ? (
              <>
                <h2 id={`${dialogId}-title`}>
                  {t('successTitle')}
                </h2>
                <p className="listing-report-success" role="status">
                  {t('successMessage')}
                </p>
                <div className="listing-report-actions">
                  <button
                    type="button"
                    className="message-confirmation-button message-confirmation-button--secondary"
                    onClick={closeDialog}
                  >
                    {t('closeButton')}
                  </button>
                </div>
              </>
            ) : reportStatus === 'already-reported' ? (
              <>
                <h2 id={`${dialogId}-title`}>
                  {t('alreadyReportedTitle')}
                </h2>
                <p className="listing-report-success" role="status">
                  {t('alreadyReportedMessage')}
                </p>
                <div className="listing-report-actions">
                  <button
                    type="button"
                    className="message-confirmation-button message-confirmation-button--secondary"
                    onClick={closeDialog}
                  >
                    {t('closeButton')}
                  </button>
                </div>
              </>
            ) : (
              <form
                className="listing-report-form"
                onSubmit={handleSubmit}
                noValidate
              >
                <h2 id={`${dialogId}-title`}>
                  {t('title')}
                </h2>
                <fieldset
                  className="listing-report-reasons"
                  aria-describedby={reasonError ? reasonErrorId : undefined}
                >
                  <legend>{t('question')}</legend>
                  {LISTING_REPORT_REASONS.map((reason) => (
                    <label key={reason} className="listing-report-reason">
                      <input
                        type="radio"
                        name="reason"
                        value={reason}
                        checked={selectedReason === reason}
                        onChange={() => {
                          setSelectedReason(reason);
                          setError('');
                        }}
                        required
                      />
                      <span>{t(`reasons.${reason}`)}</span>
                    </label>
                  ))}
                </fieldset>
                {reasonError ? (
                  <p id={reasonErrorId} className="form-error" role="alert">
                    {reasonError}
                  </p>
                ) : null}

                <label className="listing-report-details" htmlFor={`${dialogId}-details`}>
                  <span>{t('detailsLabel')}</span>
                  <textarea
                    id={`${dialogId}-details`}
                    name="details"
                    value={details}
                    rows={4}
                    maxLength={LISTING_REPORT_DETAILS_MAX_LENGTH}
                    aria-describedby={`${detailsHelpId}${formError ? ` ${errorId}` : ''}`}
                    onChange={(event) => {
                      setDetails(event.target.value);
                      setError('');
                    }}
                  />
                </label>
                <p id={detailsHelpId} className="listing-report-help">
                  {t('detailsHelp')}
                </p>

                {formError ? (
                  <p id={errorId} className="form-error" role="alert">
                    {formError}
                  </p>
                ) : null}

                <div className="listing-report-actions">
                  <button
                    type="button"
                    className="message-confirmation-button message-confirmation-button--secondary"
                    onClick={closeDialog}
                    disabled={isSubmitting}
                  >
                    {t('cancelButton')}
                  </button>
                  <button
                    type="submit"
                    className="message-confirmation-button listing-report-submit-button"
                    disabled={isSubmitting}
                  >
                    {isSubmitting
                      ? t('sendingButton')
                      : t('sendButton')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
