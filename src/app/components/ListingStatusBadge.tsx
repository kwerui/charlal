import { content } from '@/content/tyv';
import type { ListingStatus } from '@/data/listings';

type Props = {
  status: ListingStatus;
  showActive?: boolean;
};

export function getListingStatusLabel(status: ListingStatus): string {
  if (status === 'reserved') {
    return content.listingStatusReserved;
  }

  if (status === 'sold') {
    return content.listingStatusSold;
  }

  if (status === 'archived') {
    return content.listingStatusArchived;
  }

  return content.listingStatusActive;
}

export default function ListingStatusBadge({ status, showActive = false }: Props) {
  if (status === 'active' && !showActive) {
    return null;
  }

  return (
    <span className={`listing-status-badge listing-status-badge--${status}`}>
      {getListingStatusLabel(status)}
    </span>
  );
}
