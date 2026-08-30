import { removeKnownLocalePrefix } from '@/i18n/localePath';

export type RouteSearchParams = {
  [key: string]: string | string[] | undefined;
};

export function buildHrefWithSearchParams(
  pathname: string,
  searchParams: RouteSearchParams
): string {
  const params = new URLSearchParams();

  Object.entries(searchParams).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => {
        params.append(key, item);
      });
      return;
    }

    params.set(key, value);
  });

  const queryString = params.toString();

  return queryString ? `${pathname}?${queryString}` : pathname;
}

export function getSafeResultsHref(
  from: string | string[] | undefined
): string | undefined {
  
  const href = Array.isArray(from) ? from[0] : from;
  

  if (!href || !href.startsWith('/') || href.startsWith('//') || href.includes('\\')) {
    return undefined;
  }

  try {
    const parsedHref = new URL(href, 'https://internal.local');
    const normalizedPathname = removeKnownLocalePrefix(parsedHref.pathname);

const isHomepageRoute =
  normalizedPathname === '/' &&
  parsedHref.search === '' &&
  parsedHref.hash === '';

const isAccountRoute =
  normalizedPathname === '/account' &&
  parsedHref.search === '' &&
  parsedHref.hash === '';

const isResultsRoute =
  isHomepageRoute ||
  isAccountRoute ||
  normalizedPathname === '/search' ||
  normalizedPathname.startsWith('/category/') ||
  normalizedPathname.startsWith('/seller/');

    if (parsedHref.origin !== 'https://internal.local' || !isResultsRoute) {
      return undefined;
    }

return `${normalizedPathname}${parsedHref.search}${parsedHref.hash}`;
  } catch {
    return undefined;
  }
}

export function getSafeEditReturnHref(
  from: string | string[] | undefined,
  editPathname: string
): string | undefined {
  const href = Array.isArray(from) ? from[0] : from;
  const safeEditPathname = editPathname.trim();

  if (
    !href ||
    !href.startsWith('/') ||
    href.startsWith('//') ||
    href.includes('\\') ||
    !safeEditPathname.startsWith('/')
  ) {
    return undefined;
  }

  try {
    const parsedHref = new URL(href, 'https://internal.local');

    if (
      parsedHref.origin !== 'https://internal.local' ||
      parsedHref.pathname === safeEditPathname
    ) {
      return undefined;
    }

    return `${parsedHref.pathname}${parsedHref.search}${parsedHref.hash}`;
  } catch {
    return undefined;
  }
}
