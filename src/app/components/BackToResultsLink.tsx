'use client';

import { Link } from '@/i18n/navigation';
import type { ReactNode } from 'react';
import { clearLocaleHistoryNormalization } from '@/i18n/localeHistory';
import { requestResultsScrollRestore } from '@/lib/resultsScrollStorage';

type Props = {
  href: string;
  className: string;
  children: ReactNode;
};

export default function BackToResultsLink({
  href,
  className,
  children,
}: Props) {
  function handleClick(): void {
    clearLocaleHistoryNormalization();
    requestResultsScrollRestore(href);
  }

  return (
    <Link href={href} className={className} onClick={handleClick} scroll={false}>
      {children}
    </Link>
  );
}
