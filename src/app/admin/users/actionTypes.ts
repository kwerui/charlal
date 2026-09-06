export type AdminUserActionState = {
  ok: boolean;
  messageKey:
    | ''
    | 'suspended'
    | 'restored'
    | 'self'
    | 'adminTarget'
    | 'notFound'
    | 'failed';
};

export const initialAdminUserActionState: AdminUserActionState = {
  ok: false,
  messageKey: '',
};
