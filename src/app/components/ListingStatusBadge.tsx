'use client';

import { useTranslations } from 'next-intl';
import type { ListingStatus } from '@/data/listings';

type Props = {
  status: ListingStatus;
  showActive?: boolean;
};

export function getListingStatusLabelKey(status: ListingStatus): string {
  return `status.${status}`;
}

export default function ListingStatusBadge({ status, showActive = false }: Props) {
  const t = useTranslations('ListingCard');

  if (status === 'active' && !showActive) {
    return null;
  }

  return (
    <span className={`listing-status-badge listing-status-badge--${status}`}>
      {t(getListingStatusLabelKey(status))}
    </span>
  );
}
