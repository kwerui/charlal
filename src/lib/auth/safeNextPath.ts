export function getSafeNextPath(
  nextValue: string | string[] | null | undefined,
  fallback = '/'
): string {
  const nextPath = Array.isArray(nextValue) ? nextValue[0] : nextValue;

  if (!nextPath || !nextPath.startsWith('/') || nextPath.startsWith('//')) {
    return fallback;
  }

  if (/[\u0000-\u001f\u007f\\]/.test(nextPath)) {
    return fallback;
  }

  try {
    const parsedPath = new URL(nextPath, 'http://internal.local');

    if (parsedPath.origin !== 'http://internal.local') {
      return fallback;
    }

    return `${parsedPath.pathname}${parsedPath.search}${parsedPath.hash}`;
  } catch {
    return fallback;
  }
}
