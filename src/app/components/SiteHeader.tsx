'use client';

import {
  useSyncExternalStore,
} from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import CharlalLogo from '@/app/components/CharlalLogo';
import {
  Link,
  usePathname,
  useRouter,
} from '@/i18n/navigation';
import {
  recordPreferredHistoryLocale,
} from '@/i18n/localeHistory';
import { localizeReturnPathQuery } from '@/i18n/localePath';
import { useAuthStatus } from '@/lib/auth/client';
import { useMessagingRealtime } from '@/lib/messagingRealtime';
import { useNotificationsRealtime } from '@/lib/notificationsRealtime';
import {
  clearNativeHistoryTraversalIntent,
} from '@/lib/nativeHistoryIntentStorage';

type Props = {
  initialAuthStatus?:
    | 'authenticated'
    | 'signed-out'
    | 'profile-error'
    | 'unresolved';
};

function formatUnreadBadge(count: number): string {
  return count > 99 ? '99+' : String(count);
}

function UserIcon() {
  return (
    <svg
      className="header-button-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg
      className="header-button-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function subscribeToHydrationStore() {
  return () => {};
}

function getClientHydrationSnapshot() {
  return true;
}

function getServerHydrationSnapshot() {
  return false;
}

function useHasHydrated() {
  return useSyncExternalStore(
    subscribeToHydrationStore,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot
  );
}

export default function SiteHeader({
  initialAuthStatus,
}: Props) {
  const t = useTranslations('Header');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const {
    status: authStatus,
    user,
    signOut,
  } = useAuthStatus();

  const hasHydrated = useHasHydrated();

  const renderAuthStatus = hasHydrated ? authStatus : 'checking';

  const {
    unreadConversationCount:
      liveUnreadConversationCount,
  } = useMessagingRealtime();
  const {
    unreadNotificationCount:
      liveUnreadNotificationCount,
  } = useNotificationsRealtime();

  const signedIn =
    renderAuthStatus === 'authenticated' ||
    (renderAuthStatus === 'checking' &&
      initialAuthStatus === 'authenticated');

  const checkingAuth =
    renderAuthStatus === 'checking' &&
    !signedIn;

  const unreadConversationCount = signedIn
    ? liveUnreadConversationCount
    : 0;
  const unreadNotificationCount = signedIn
    ? liveUnreadNotificationCount
    : 0;

  const messagesLabel =
    unreadConversationCount > 0
      ? `${t('messages')}, ${t('unreadConversation', {
          count: unreadConversationCount,
        })}`
      : t('messages');
  const notificationsLabel =
    unreadNotificationCount > 0
      ? `${t('notifications')}, ${t('unreadNotifications', {
          count: unreadNotificationCount,
        })}`
      : t('notifications');


  function handlePostAdClick() {
    if (signedIn) {
      router.push('/post-ad');
      return;
    }

    router.push('/sign-in?next=/post-ad');
  }

  async function handleSignOut() {
    await signOut();
    router.refresh();

    if (
      pathname === '/post-ad' ||
      pathname === '/account' ||
      pathname.startsWith('/account/') ||
      pathname.startsWith('/contact/')
    ) {
      router.replace('/sign-in');
    }
  }

  function handleLocaleChange(
    nextLocale: 'tyv' | 'ru'
  ) {
    const currentQueryString = searchParams.toString();
    const queryString = localizeReturnPathQuery(currentQueryString, nextLocale);

    const href = queryString
      ? `${pathname}?${queryString}`
      : pathname;

    recordPreferredHistoryLocale(nextLocale);

    router.replace(href, { locale: nextLocale });
  }

  return (
    <header className="header">
      <div className="header-inner">
        <Link
          href="/"
          className="site-name-link"
          aria-label={t('homeLinkLabel')}
        >
          <CharlalLogo />
        </Link>

        <div
          className="language-switcher"
          aria-label={t(
            'languageSwitcherLabel'
          )}
        >
          <button
            type="button"
            className="language-switcher-button"
            aria-current={
              locale === 'tyv'
                ? 'true'
                : undefined
            }
            disabled={locale === 'tyv'}
            onClick={() =>
              handleLocaleChange('tyv')
            }
          >
            ТУВ
          </button>

          <button
            type="button"
            className="language-switcher-button"
            aria-current={
              locale === 'ru'
                ? 'true'
                : undefined
            }
            disabled={locale === 'ru'}
            onClick={() =>
              handleLocaleChange('ru')
            }
          >
            РУ
          </button>
        </div>

        <nav
          className="header-actions"
          aria-label={t('actionsLabel')}
        >
          {checkingAuth ? null : signedIn ? (
            <>
              <Link
                href="/account/messages"
                className="header-button secondary-header-button header-messages-button"
                aria-label={messagesLabel}
              >
                <span>{t('messages')}</span>

                {unreadConversationCount >
                0 ? (
                  <span
                    className="header-unread-badge"
                    aria-hidden="true"
                  >
                    {formatUnreadBadge(
                      unreadConversationCount
                    )}
                  </span>
                ) : null}
              </Link>

              <Link
                href="/account/notifications"
                className="header-button secondary-header-button header-notifications-button"
                aria-label={notificationsLabel}
              >
                <BellIcon />

                {unreadNotificationCount >
                0 ? (
                  <span
                    className="header-unread-badge"
                    aria-hidden="true"
                  >
                    {formatUnreadBadge(
                      unreadNotificationCount
                    )}
                  </span>
                ) : null}
              </Link>

              <Link
                href="/account"
                className="header-button secondary-header-button"
                onClick={
                  clearNativeHistoryTraversalIntent
                }
              >
                {t('account')}
              </Link>

              <button
                type="button"
                className="header-button header-sign-out-button"
                onClick={handleSignOut}
              >
                {t('signOut')}
              </button>
            </>
          ) : (
            <Link
              href="/sign-in"
              className="header-button secondary-header-button"
            >
              <UserIcon />
              {t('signIn')}
            </Link>
          )}
        </nav>

        <button
          type="button"
          className="header-button primary-header-button header-post-ad-button"
          onClick={handlePostAdClick}
          disabled={renderAuthStatus === 'checking'}
        >
          {t('postAd')}
        </button>

        {signedIn && user ? (
          <span className="sr-only">
            {t('signedInAs')} {user.email}
          </span>
        ) : null}
      </div>
    </header>
  );
}
