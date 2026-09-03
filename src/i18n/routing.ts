import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['tyv', 'ru'],
  defaultLocale: 'tyv',
  localePrefix: 'as-needed',
  localeDetection: false,
});

