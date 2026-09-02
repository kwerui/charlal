const TYV_SHORT_MONTHS = [
  'Янв.',
  'Февр.',
  'Мар.',
  'Апр.',
  'Май',
  'Июн.',
  'Июл.',
  'Авг.',
  'Сент.',
  'Окт.',
  'Нояб.',
  'Дек.',
] as const;

type NumericDateParts = {
  year: string;
  monthIndex: number;
  day: number;
};

function getNumericDateParts(
  value: string,
  timeZone?: string
): NumericDateParts | null {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const formatter = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    return null;
  }

  const monthIndex = Number(month) - 1;
  const numericDay = Number(day);

  if (
    monthIndex < 0 ||
    monthIndex >= TYV_SHORT_MONTHS.length ||
    !Number.isFinite(numericDay)
  ) {
    return null;
  }

  return {
    year,
    monthIndex,
    day: numericDay,
  };
}

export function formatAppShortDate(
  value: string,
  locale: string,
  timeZone?: string
): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  if (locale === 'tyv') {
    const parts = getNumericDateParts(value, timeZone);

    if (!parts) {
      return value;
    }

    return `${parts.year}ч ${TYV_SHORT_MONTHS[parts.monthIndex]} ${parts.day}`;
  }

  return new Intl.DateTimeFormat('ru-RU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

export function formatAppTime(
  value: string,
  timeZone?: string
): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}