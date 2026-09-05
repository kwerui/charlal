'use client';

import { useActionState } from 'react';
import {
  initialAdminReportActionState,
  type AdminReportActionState,
} from '@/app/admin/reports/actionTypes';

type MessageKey = AdminReportActionState['messageKey'];

type Props = {
  action: (
    previousState: AdminReportActionState,
    formData: FormData
  ) => Promise<AdminReportActionState>;
  buttonLabel: string;
  buttonClassName: string;
  reportId?: string;
  listingId: string;
  feedbackMessages: Record<Exclude<MessageKey, ''>, string>;
};

export default function AdminReportActionForm({
  action,
  buttonLabel,
  buttonClassName,
  reportId,
  listingId,
  feedbackMessages,
}: Props) {
  const [state, formAction, isPending] = useActionState(
    action,
    initialAdminReportActionState
  );
  const message = state.messageKey ? feedbackMessages[state.messageKey] : '';

  return (
    <form action={formAction} className="admin-report-action-form">
      {reportId ? <input type="hidden" name="reportId" value={reportId} /> : null}
      <input type="hidden" name="listingId" value={listingId} />
      <button type="submit" className={buttonClassName} disabled={isPending}>
        {buttonLabel}
      </button>
      {message ? (
        <p
          className={
            state.ok
              ? 'admin-report-action-message admin-report-action-message--success'
              : 'admin-report-action-message admin-report-action-message--error'
          }
          role={state.ok ? 'status' : 'alert'}
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
