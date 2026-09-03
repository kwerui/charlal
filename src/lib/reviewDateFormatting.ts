import { formatAppShortDate } from './appDateFormatting';

export function formatReviewDate(
  value: string,
  locale: string
): string {
  return formatAppShortDate(value, locale, 'UTC');
}
