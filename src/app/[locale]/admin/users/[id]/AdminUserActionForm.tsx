'use client';

import { useActionState } from 'react';
import {
  initialAdminUserActionState,
  type AdminUserActionState,
} from '@/app/admin/users/actionTypes';

type MessageKey = Exclude<AdminUserActionState['messageKey'], ''>;

type Props = {
  action: (
    previousState: AdminUserActionState,
    formData: FormData
  ) => Promise<AdminUserActionState>;
  buttonLabel: string;
  buttonClassName: string;
  userId: string;
  feedbackMessages: Record<MessageKey, string>;
};

export default function AdminUserActionForm({
  action,
  buttonLabel,
  buttonClassName,
  userId,
  feedbackMessages,
}: Props) {
  const [state, formAction, isPending] = useActionState(
    action,
    initialAdminUserActionState
  );
  const message = state.messageKey ? feedbackMessages[state.messageKey] : '';

  return (
    <form action={formAction} className="admin-report-action-form">
      <input type="hidden" name="userId" value={userId} />
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
