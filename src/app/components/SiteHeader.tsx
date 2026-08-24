"use client";

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import CharlalLogo from '@/app/components/CharlalLogo';
import { content } from '@/content/tyv';
import { useAuthStatus } from '@/lib/auth/client';
import { useMessagingRealtime } from '@/lib/messagingRealtime';
import { clearNativeHistoryTraversalIntent } from '@/lib/nativeHistoryIntentStorage';

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

export default function SiteHeader({
  initialAuthStatus,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { status: authStatus, user, signOut } = useAuthStatus();
  const { unreadConversationCount: liveUnreadConversationCount } =
    useMessagingRealtime();
  const signedIn =
    authStatus === 'authenticated' ||
    (authStatus === 'checking' && initialAuthStatus === 'authenticated');
  const checkingAuth = authStatus === 'checking' && !signedIn;
  const unreadConversationCount = signedIn
    ? liveUnreadConversationCount
    : 0;
  const messagesLabel =
    unreadConversationCount > 0
      ? `${content.messagesTitle}, ${unreadConversationCount} ${
          unreadConversationCount === 1
            ? 'unread conversation'
            : 'unread conversations'
        }`
      : content.messagesTitle;

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


  return (
    <header className="header">
      <div className="header-inner">
        <Link href="/" className="site-name-link" aria-label={content.homeLinkLabel}>
          <CharlalLogo />
        </Link>

        <nav className="header-actions" aria-label={content.headerActionsLabel}>
          {checkingAuth ? null : signedIn ? (
            <>
              <Link
                href="/account/messages"
                className="header-button secondary-header-button header-messages-button"
                aria-label={messagesLabel}
              >
                <span>{content.messagesTitle}</span>
                {unreadConversationCount > 0 ? (
                  <span className="header-unread-badge" aria-hidden="true">
                    {formatUnreadBadge(unreadConversationCount)}
                  </span>
                ) : null}
              </Link>
              <Link
                href="/account"
                className="header-button secondary-header-button"
                onClick={clearNativeHistoryTraversalIntent}
              >
                {content.headerAccount}
              </Link>
              <button
                type="button"
                className="header-button header-sign-out-button"
                onClick={handleSignOut}
              >
                {content.headerSignOut}
              </button>
            </>
          ) : (
            <Link href="/sign-in" className="header-button secondary-header-button">
              <UserIcon />
              {content.headerSignIn}
            </Link>
          )}
        </nav>

<button
  type="button"
  className="header-button primary-header-button header-post-ad-button"
  onClick={handlePostAdClick}
  disabled={authStatus === 'checking'}
>
  {content.headerPostAd}
</button>

        {signedIn && user ? (
          <span className="sr-only">
            {content.signedInAsLabel} {user.email}
          </span>
        ) : null}
      </div>
    </header>
  );
}
