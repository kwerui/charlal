"use client";

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { content } from '@/content/tyv';
import {
  demoSignOut,
  getDemoAuthServerSnapshot,
  getDemoAuthSnapshot,
  getDemoUser,
  subscribeToDemoAuth,
} from '@/lib/demoAuth';

export default function SiteHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const signedIn = useSyncExternalStore(
    subscribeToDemoAuth,
    getDemoAuthSnapshot,
    getDemoAuthServerSnapshot
  );

  function handlePostAdClick() {
    if (signedIn) {
      router.push('/post-ad');
      return;
    }

    router.push('/sign-in?next=/post-ad');
  }

  function handleSignOut() {
    demoSignOut();

    if (pathname === '/post-ad' || pathname === '/account') {
      router.replace(`/sign-in?next=${pathname}`);
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
            <Link href="/account" className="header-button secondary-header-button">
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
        <button type="button" className="header-button primary-header-button" onClick={handlePostAdClick}>
          {content.headerPostAd}
        </button>
      </nav>
      {signedIn ? (
        <span className="sr-only">
          {content.signedInAsLabel} {getDemoUser()?.email}
        </span>
      ) : null}
    </header>
  );
}
