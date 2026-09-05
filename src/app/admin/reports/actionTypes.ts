export type AdminReportActionState = {
  ok: boolean;
  messageKey: 'dismissed' | 'reopened' | 'hidden' | 'restored' | 'failed' | '';
};

export const initialAdminReportActionState: AdminReportActionState = {
  ok: false,
  messageKey: '',
};
