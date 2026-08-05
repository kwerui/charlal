'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
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
    requestResultsScrollRestore(href);
  }

  return (
    <Link href={href} className={className} onClick={handleClick} scroll={false}>
      {children}
    </Link>
  );
}
