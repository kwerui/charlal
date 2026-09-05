import { notFound } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { getTranslations } from 'next-intl/server';
import { formatAppShortDate, formatAppTime } from '@/lib/appDateFormatting';
import AdminReportActionForm from './AdminReportActionForm';
import {
  dismissListingReportAction,
  hideListingFromReportAction,
  reopenListingReportAction,
  restoreHiddenListingAction,
} from '@/app/admin/reports/actions';
import {
  getCurrentUserIsAdmin,
  isAdminReportState,
  listAdminListingReports,
  type AdminListingReport,
  type AdminReportState,
} from '@/lib/supabase/adminModeration';

type AdminReportsPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

const REPORT_FILTERS: AdminReportState[] = [
  'open',
  'dismissed',
  'listing_hidden',
  'all',
];

function getSelectedState(
  query: { [key: string]: string | string[] | undefined }
): AdminReportState {
  const rawState = Array.isArray(query.state)
    ? query.state[0] || ''
    : query.state || '';

  return isAdminReportState(rawState) ? rawState : 'open';
}

type AdminReportsTranslator = Awaited<ReturnType<typeof getTranslations>>;

function formatDate(value: string | null, locale: string, t: AdminReportsTranslator): string {
  if (!value) {
    return t('notReviewed');
  }

  return `${formatAppShortDate(value, locale)} ${formatAppTime(value)}`;
}

function formatReportState(state: string, t: AdminReportsTranslator): string {
  if (state === 'open' || state === 'dismissed' || state === 'listing_hidden') {
    return t(`reportStates.${state}`);
  }

  if (state === 'normal' || state === 'hidden') {
    return t(`moderationStates.${state}`);
  }

  return state;
}

function getListingTitle(report: AdminListingReport): string {
  return report.listingTitle || report.listingTitleSnapshot;
}

function AdminReportActions({
  report,
  t,
}: {
  report: AdminListingReport;
  t: AdminReportsTranslator;
}) {
  const listingId = report.listingId || report.listingReference;
  const listingHidden = report.listingModerationState === 'hidden';
  const canResolveOpenReport = report.reportState === 'open';
  const canReopenReport = report.reportState === 'dismissed';
  const feedbackMessages = {
    dismissed: t('actionFeedback.dismissed'),
    reopened: t('actionFeedback.reopened'),
    hidden: t('actionFeedback.hidden'),
    restored: t('actionFeedback.restored'),
    failed: t('actionFeedback.failed'),
  };

  return (
    <div className="admin-report-actions">
      {canResolveOpenReport ? (
        <>
          <AdminReportActionForm
            action={dismissListingReportAction}
            buttonLabel={t('actions.dismiss')}
            buttonClassName="listing-management-button"
            reportId={report.reportId}
            listingId={listingId}
            feedbackMessages={feedbackMessages}
          />
          <AdminReportActionForm
            action={hideListingFromReportAction}
            buttonLabel={t('actions.hideListing')}
            buttonClassName="listing-management-button listing-management-button--delete"
            reportId={report.reportId}
            listingId={listingId}
            feedbackMessages={feedbackMessages}
          />
        </>
      ) : null}
      {canReopenReport ? (
        <AdminReportActionForm
          action={reopenListingReportAction}
          buttonLabel={t('actions.reopen')}
          buttonClassName="listing-management-button listing-management-button--edit"
          reportId={report.reportId}
          listingId={listingId}
          feedbackMessages={feedbackMessages}
        />
      ) : null}
      {listingHidden ? (
        <AdminReportActionForm
          action={restoreHiddenListingAction}
          buttonLabel={t('actions.restoreListing')}
          buttonClassName="listing-management-button listing-management-button--edit"
          listingId={listingId}
          feedbackMessages={feedbackMessages}
        />
      ) : null}
    </div>
  );
}

function AdminReportsTable({
  reports,
  locale,
  t,
}: {
  reports: AdminListingReport[];
  locale: string;
  t: AdminReportsTranslator;
}) {
  if (reports.length === 0) {
    return (
      <div className="empty-results" role="status">
        <h2>{t('emptyTitle')}</h2>
        <p>{t('emptyMessage')}</p>
      </div>
    );
  }

  return (
    <div className="admin-reports-table-wrap">
      <table className="admin-reports-table">
        <thead>
          <tr>
            <th scope="col">{t('table.listing')}</th>
            <th scope="col">{t('table.report')}</th>
            <th scope="col">{t('table.people')}</th>
            <th scope="col">{t('table.state')}</th>
            <th scope="col">{t('table.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => (
            <tr key={report.reportId}>
              <td>
                <strong>{getListingTitle(report)}</strong>
                <span>{report.listingReference}</span>
                <span>{report.listingStatus || t('listingUnavailable')}</span>
              </td>
              <td>
                <strong>{t(`reasons.${report.reportReason}`)}</strong>
                {report.reportDetails ? <p>{report.reportDetails}</p> : null}
                <span>{formatDate(report.reportCreatedAt, locale, t)}</span>
              </td>
              <td>
                <span>
                  {t('reporterLabel')}: {report.reporterDisplayName || report.reporterId}
                </span>
                <span>{t('sellerLabel')}: {report.sellerDisplayName || report.sellerId}</span>
              </td>
              <td>
                <strong>{formatReportState(report.reportState, t)}</strong>
                <span>
                  {report.listingModerationState
                    ? formatReportState(report.listingModerationState, t)
                    : t('missingListing')}
                </span>
                <span>{formatDate(report.reviewedAt, locale, t)}</span>
              </td>
              <td>
                <AdminReportActions report={report} t={t} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function AdminReportsPage({
  params,
  searchParams,
}: AdminReportsPageProps) {
  const { locale } = await params;
  const t = await getTranslations('AdminReports');
  const isAdmin = await getCurrentUserIsAdmin();

  if (!isAdmin) {
    notFound();
  }

  const query = await searchParams;
  const selectedState = getSelectedState(query);
  const reportsResult = await listAdminListingReports({
    state: selectedState,
  });

  if (!reportsResult.ok) {
    notFound();
  }

  return (
    <main className="admin-page">
      <section className="admin-panel" aria-labelledby="admin-reports-title">
        <div className="admin-page-heading">
          <p className="hero-kicker">{t('kicker')}</p>
          <h1 id="admin-reports-title" className="auth-title">
            {t('title')}
          </h1>
        </div>

        <nav className="admin-report-filters" aria-label={t('filtersAriaLabel')}>
          {REPORT_FILTERS.map((state) => (
            <Link
              key={state}
              href={state === 'open' ? '/admin/reports' : `/admin/reports?state=${state}`}
              className={
                state === selectedState
                  ? 'admin-report-filter admin-report-filter--active'
                  : 'admin-report-filter'
              }
              aria-current={state === selectedState ? 'page' : undefined}
            >
              {t(`filters.${state}`)}
            </Link>
          ))}
        </nav>

        <AdminReportsTable
          reports={reportsResult.reports}
          locale={locale}
          t={t}
        />
      </section>
    </main>
  );
}
