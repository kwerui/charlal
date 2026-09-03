import {
  formatAppShortDate,
  formatAppTime,
} from './appDateFormatting';

export function formatMessageDateTime(
  value: string,
  locale: string,
  options: Intl.DateTimeFormatOptions
): string {
  const isTimeOnly =
    options.hour !== undefined &&
    options.minute !== undefined &&
    options.year === undefined &&
    options.month === undefined &&
    options.day === undefined;

  if (isTimeOnly) {
    return formatAppTime(value, options.timeZone);
  }

  return formatAppShortDate(value, locale, options.timeZone);
}
