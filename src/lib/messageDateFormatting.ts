const MESSAGE_DATE_FALLBACK_LOCALE = 'ru';

export function getMessageDateFormattingLocale(locale: string): string {
  const supportedLocale = Intl.DateTimeFormat.supportedLocalesOf([locale])[0];

  if (supportedLocale) {
    return supportedLocale;
  }

  return MESSAGE_DATE_FALLBACK_LOCALE;
}

export function formatMessageDateTime(
  value: string,
  locale: string,
  options: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat(
    getMessageDateFormattingLocale(locale),
    options
  ).format(new Date(value));
}
