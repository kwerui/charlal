export const LISTING_REPORT_DETAILS_MAX_LENGTH = 1000;

export const LISTING_REPORT_REASONS = [
  'scam',
  'prohibited_item',
  'misleading',
  'duplicate_spam',
  'other',
] as const;

export type ListingReportReason = (typeof LISTING_REPORT_REASONS)[number];

export function isListingReportReason(
  value: unknown
): value is ListingReportReason {
  return (
    value === 'scam' ||
    value === 'prohibited_item' ||
    value === 'misleading' ||
    value === 'duplicate_spam' ||
    value === 'other'
  );
}
