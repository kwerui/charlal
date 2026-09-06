import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';
import { formatAppShortDate, formatAppTime } from '@/lib/appDateFormatting';
import {
  getAdminUserModeration,
  getAdminUserProfile,
  getCurrentUserIsAdmin,
  listAdminUserModerationAuditEvents,
  type AdminUserModerationAuditEvent,
  type AdminUserModerationState,
} from '@/lib/supabase/adminModeration';
import { restoreUserAction, suspendUserAction } from '@/app/admin/users/actions';
import AdminUserActionForm from './AdminUserActionForm';

type AdminUserPageProps = {
  params: Promise<{ locale: string; id: string }>;
};

type AdminUsersTranslator = Awaited<ReturnType<typeof getTranslations>>;

function formatDate(value: string | null, locale: string, t: AdminUsersTranslator): string {
  if (!value) {
    return t('notChanged');
  }

  return `${formatAppShortDate(value, locale)} ${formatAppTime(value)}`;
}

function formatModerationState(
  state: AdminUserModerationState,
  t: AdminUsersTranslator
): string {
  return t(`states.${state}`);
}

function formatAuditAction(
  event: AdminUserModerationAuditEvent,
  t: AdminUsersTranslator
): string {
  return event.action === 'user_suspended'
    ? t('audit.actions.user_suspended')
    : t('audit.actions.user_restored');
}

export default async function AdminUserPage({ params }: AdminUserPageProps) {
  const { locale, id } = await params;
  const t = await getTranslations('AdminUsers');
  const safeUserId = id.trim();
  const isAdmin = await getCurrentUserIsAdmin();

  if (!safeUserId || !isAdmin) {
    notFound();
  }

  const [profileResult, moderationResult, auditResult] = await Promise.all([
    getAdminUserProfile(safeUserId),
    getAdminUserModeration(safeUserId),
    listAdminUserModerationAuditEvents(safeUserId),
  ]);

  if (!profileResult.ok || !moderationResult.ok || !profileResult.profile) {
    notFound();
  }

  const feedbackMessages = {
    suspended: t('actionFeedback.suspended'),
    restored: t('actionFeedback.restored'),
    self: t('actionFeedback.self'),
    adminTarget: t('actionFeedback.adminTarget'),
    notFound: t('actionFeedback.notFound'),
    failed: t('actionFeedback.failed'),
  };
  const profile = profileResult.profile;
  const moderation = moderationResult.moderation;

  return (
    <main className="admin-page">
      <section className="admin-panel" aria-labelledby="admin-user-title">
        <Link href="/admin/reports" className="page-back-link">
          {t('backToReports')}
        </Link>

        <div className="admin-page-heading">
          <p className="hero-kicker">{t('kicker')}</p>
          <h1 id="admin-user-title" className="auth-title">
            {profile.displayName || profile.id}
          </h1>
        </div>

        <section className="admin-user-summary" aria-labelledby="admin-user-summary-title">
          <h2 id="admin-user-summary-title">{t('summaryTitle')}</h2>
          <dl>
            <div>
              <dt>{t('fields.userId')}</dt>
              <dd>{profile.id}</dd>
            </div>
            <div>
              <dt>{t('fields.email')}</dt>
              <dd>{profile.email || t('missingValue')}</dd>
            </div>
            <div>
              <dt>{t('fields.publicSlug')}</dt>
              <dd>{profile.publicSlug}</dd>
            </div>
            <div>
              <dt>{t('fields.createdAt')}</dt>
              <dd>{formatDate(profile.createdAt, locale, t)}</dd>
            </div>
          </dl>
        </section>

        <section className="admin-user-summary" aria-labelledby="admin-user-moderation-title">
          <h2 id="admin-user-moderation-title">{t('moderationTitle')}</h2>
          <dl>
            <div>
              <dt>{t('fields.state')}</dt>
              <dd>{formatModerationState(moderation.state, t)}</dd>
            </div>
            <div>
              <dt>{t('fields.changedAt')}</dt>
              <dd>{formatDate(moderation.changedAt, locale, t)}</dd>
            </div>
            <div>
              <dt>{t('fields.changedBy')}</dt>
              <dd>{moderation.changedBy || t('missingValue')}</dd>
            </div>
          </dl>
          <div className="admin-report-actions">
            {moderation.state === 'suspended' ? (
              <AdminUserActionForm
                action={restoreUserAction}
                buttonLabel={t('actions.restore')}
                buttonClassName="listing-management-button listing-management-button--edit"
                userId={profile.id}
                feedbackMessages={feedbackMessages}
              />
            ) : (
              <AdminUserActionForm
                action={suspendUserAction}
                buttonLabel={t('actions.suspend')}
                buttonClassName="listing-management-button listing-management-button--delete"
                userId={profile.id}
                feedbackMessages={feedbackMessages}
              />
            )}
          </div>
        </section>

        <section className="admin-user-summary" aria-labelledby="admin-user-audit-title">
          <h2 id="admin-user-audit-title">{t('audit.title')}</h2>
          {!auditResult.ok || auditResult.events.length === 0 ? (
            <p className="results-summary">{t('audit.empty')}</p>
          ) : (
            <ol className="admin-user-audit-list">
              {auditResult.events.map((event) => (
                <li key={event.id}>
                  <strong>{formatAuditAction(event, t)}</strong>
                  <span>
                    {formatModerationState(event.previousState, t)} -&gt;{' '}
                    {formatModerationState(event.newState, t)}
                  </span>
                  <span>{formatDate(event.createdAt, locale, t)}</span>
                  <span>
                    {t('audit.actorLabel')}: {event.actorDisplayName || event.actorId}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </section>
    </main>
  );
}
