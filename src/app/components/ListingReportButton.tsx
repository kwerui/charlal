'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { reportListingAction } from '@/app/listing/reportActions';
import { content } from '@/content/tyv';
import {
  LISTING_REPORT_DETAILS_MAX_LENGTH,
  LISTING_REPORT_REASONS,
  type ListingReportReason,
} from '@/lib/listingReports';
import { useAuthStatus } from '@/lib/auth/client';
import { getSafeNextPath } from '@/lib/auth/safeNextPath';

type Props = {
  listingId: string;
  ownerId: string;
  returnHref?: string;
};

type ReportFeedbackStatus = 'idle' | 'created' | 'already-reported';

function getSafeCurrentHref(
  pathname: string,
  searchParams: URLSearchParams
): string {
  const search = searchParams.toString();

  return search ? `${pathname}?${search}` : pathname;
}

function getReportErrorMessage(reason: string): string {
  if (reason === 'auth-required') {
    return content.signInToReportAdvertisementMessage;
  }

  if (reason === 'invalid-reason') {
    return content.reportAdvertisementReasonRequiredMessage;
  }

  if (reason === 'details-too-long') {
    return content.reportAdvertisementDetailsTooLongMessage;
  }

  if (reason === 'own-listing') {
    return content.reportAdvertisementOwnListingMessage;
  }

  if (reason === 'invalid-listing') {
    return content.reportAdvertisementUnavailableMessage;
  }

  return content.reportAdvertisementFailedMessage;
}

export default function ListingReportButton({
  listingId,
  ownerId,
  returnHref,
}: Props) {
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
  const [reportStatus, setReportStatus] = useState<ReportFeedbackStatus>('idle');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const activeUserId = status === 'authenticated' && user ? user.id : null;
  const isOwnListing = Boolean(activeUserId && activeUserId === ownerId);
  const signInReturnHref = getSafeNextPath(
    returnHref || getSafeCurrentHref(pathname, searchParams),
    '/'
  );
  const errorId = `${dialogId}-error`;
  const detailsHelpId = `${dialogId}-details-help`;

  const closeDialog = useCallback((): void => {
    if (isSubmitting) {
      return;
    }

    setIsOpen(false);
    setError('');
    setSelectedReason('');
    setDetails('');
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

  if (isOwnListing) {
    return null;
  }

  function openDialog(): void {
    setError('');

    if (status !== 'authenticated' || !activeUserId) {
      router.push(`/sign-in?next=${encodeURIComponent(signInReturnHref)}`);
      return;
    }

    setIsOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting || reportStatus !== 'idle') {
      return;
    }

    if (!selectedReason) {
      setError(content.reportAdvertisementReasonRequiredMessage);
      return;
    }

    if (details.length > LISTING_REPORT_DETAILS_MAX_LENGTH) {
      setError(content.reportAdvertisementDetailsTooLongMessage);
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
      setError(getReportErrorMessage(result.reason));

      if (result.reason === 'auth-required') {
        router.push(`/sign-in?next=${encodeURIComponent(signInReturnHref)}`);
      }

      return;
    }

    setReportStatus(
      result.status === 'already-reported' ? 'already-reported' : 'created'
    );
    setSelectedReason('');
    setDetails('');
  }

  const reportButtonLabel =
    reportStatus === 'created'
      ? content.reportAdvertisementSuccessTitle
      : reportStatus === 'already-reported'
      ? content.reportAdvertisementAlreadyReportedButton
      : content.reportAdvertisementButton;

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
                  {content.reportAdvertisementSuccessTitle}
                </h2>
                <p className="listing-report-success" role="status">
                  {content.reportAdvertisementSuccessMessage}
                </p>
                <div className="listing-report-actions">
                  <button
                    type="button"
                    className="message-confirmation-button message-confirmation-button--secondary"
                    onClick={closeDialog}
                  >
                    {content.closeListingPhotoViewerButton}
                  </button>
                </div>
              </>
            ) : reportStatus === 'already-reported' ? (
              <>
                <h2 id={`${dialogId}-title`}>
                  {content.reportAdvertisementAlreadyReportedTitle}
                </h2>
                <p className="listing-report-success" role="status">
                  {content.reportAdvertisementAlreadyReportedMessage}
                </p>
                <div className="listing-report-actions">
                  <button
                    type="button"
                    className="message-confirmation-button message-confirmation-button--secondary"
                    onClick={closeDialog}
                  >
                    {content.closeListingPhotoViewerButton}
                  </button>
                </div>
              </>
            ) : (
              <form className="listing-report-form" onSubmit={handleSubmit}>
                <h2 id={`${dialogId}-title`}>
                  {content.reportAdvertisementTitle}
                </h2>
                <fieldset className="listing-report-reasons">
                  <legend>{content.reportAdvertisementQuestion}</legend>
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
                      <span>{content.listingReportReasonLabels[reason]}</span>
                    </label>
                  ))}
                </fieldset>

                <label className="listing-report-details" htmlFor={`${dialogId}-details`}>
                  <span>{content.reportAdvertisementDetailsLabel}</span>
                  <textarea
                    id={`${dialogId}-details`}
                    name="details"
                    value={details}
                    rows={4}
                    maxLength={LISTING_REPORT_DETAILS_MAX_LENGTH}
                    aria-describedby={`${detailsHelpId}${error ? ` ${errorId}` : ''}`}
                    onChange={(event) => {
                      setDetails(event.target.value);
                      setError('');
                    }}
                  />
                </label>
                <p id={detailsHelpId} className="listing-report-help">
                  {content.reportAdvertisementDetailsHelp}
                </p>

                {error ? (
                  <p id={errorId} className="form-error" role="alert">
                    {error}
                  </p>
                ) : null}

                <div className="listing-report-actions">
                  <button
                    type="button"
                    className="message-confirmation-button message-confirmation-button--secondary"
                    onClick={closeDialog}
                    disabled={isSubmitting}
                  >
                    {content.cancelButton}
                  </button>
                  <button
                    type="submit"
                    className="message-confirmation-button listing-report-submit-button"
                    disabled={isSubmitting}
                  >
                    {isSubmitting
                      ? content.reportAdvertisementSendingButton
                      : content.reportAdvertisementSendButton}
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
