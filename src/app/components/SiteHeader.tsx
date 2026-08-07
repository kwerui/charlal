"use client";

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { content } from '@/content/tyv';
import { useAuthStatus } from '@/lib/auth/client';
import { clearNativeHistoryTraversalIntent } from '@/lib/nativeHistoryIntentStorage';

type Props = {
  initialAuthStatus:
    | 'authenticated'
    | 'signed-out'
    | 'profile-error'
    | 'unresolved';
  initialUnreadConversationCount: number;
};

function formatUnreadBadge(count: number): string {
  return count > 99 ? '99+' : String(count);
}

export default function SiteHeader({
  initialAuthStatus,
  initialUnreadConversationCount,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { status: authStatus, user, signOut } = useAuthStatus();
  const signedIn =
    authStatus === 'authenticated' ||
    (authStatus === 'checking' && initialAuthStatus === 'authenticated');
  const unreadConversationCount = signedIn
    ? initialUnreadConversationCount
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
      router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
    }
  }

  return (
    <header className="header">
      <Link href="/" className="site-name-link" aria-label={content.homeLinkLabel}>
        <h1 className="site-name">{content.siteName}</h1>
      </Link>
      <nav className="header-actions" aria-label={content.headerActionsLabel}>
        {signedIn ? (
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
            <button type="button" className="header-button secondary-header-button" onClick={handleSignOut}>
              {content.headerSignOut}
            </button>
          </>
        ) : (
          <Link href="/sign-in" className="header-button secondary-header-button">
            {content.headerSignIn}
          </Link>
        )}
        <button
          type="button"
          className="header-button primary-header-button"
          onClick={handlePostAdClick}
          disabled={authStatus === 'checking'}
        >
          {content.headerPostAd}
        </button>
      </nav>
      {signedIn && user ? (
        <span className="sr-only">
          {content.signedInAsLabel} {user.email}
        </span>
      ) : null}
    </header>
  );
}
