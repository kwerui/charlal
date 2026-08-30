'use client';

import { Link } from '@/i18n/navigation';
import type { MouseEvent, ReactNode } from 'react';
import { saveResultsScrollPosition } from '@/lib/resultsScrollStorage';

type ListingHref =
  | string
  | {
      pathname: string;
      query: {
        from: string;
      };
    };

type Props = {
  href: ListingHref;
  fromHref?: string;
  className: string;
  ariaLabel: string;
  children: ReactNode;
};

export default function ListingCardLink({
  href,
  fromHref,
  className,
  ariaLabel,
  children,
}: Props) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>): void {
    if (fromHref) {
      const targetUrl = new URL(event.currentTarget.href);
      const listingHref = `${targetUrl.pathname}${targetUrl.search}`;
      saveResultsScrollPosition(fromHref, listingHref);
    }
  }

  return (
    <Link href={href} className={className} aria-label={ariaLabel} onClick={handleClick}>
      {children}
    </Link>
  );
}
