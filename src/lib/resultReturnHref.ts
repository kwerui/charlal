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
    const isResultsRoute =
      parsedHref.pathname === '/search' || parsedHref.pathname.startsWith('/category/');

    if (parsedHref.origin !== 'https://internal.local' || !isResultsRoute) {
      return undefined;
    }

    return `${parsedHref.pathname}${parsedHref.search}${parsedHref.hash}`;
  } catch {
    return undefined;
  }
}
