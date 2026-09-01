const REVIEW_DATE_FALLBACK_LOCALE = 'ru';

export function getReviewDateFormattingLocale(locale: string): string {
  const supportedLocale = Intl.DateTimeFormat.supportedLocalesOf([locale])[0];

  if (supportedLocale) {
    return supportedLocale;
  }

  return REVIEW_DATE_FALLBACK_LOCALE;
}

export function formatReviewDate(value: string, locale: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(getReviewDateFormattingLocale(locale), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}
