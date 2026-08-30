import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { routing } from '../src/i18n/routing.js';
import {
  clearLocaleHistoryNormalization,
  createLocaleHistoryNormalization,
  takeLocaleHistoryNormalizationRedirect,
} from '../src/i18n/localeHistory.js';
import {
  localizeReturnPathQuery,
  localizeSafeInternalPath,
} from '../src/i18n/localePath.js';
import { unknownInitialAuthState } from '../src/lib/auth/initialState.js';
import { getSafeNextPath } from '../src/lib/auth/safeNextPath.js';

const proxyMatcherConfig = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)',
  ],
};

function withMockWindow<T>(
  storedValues: Record<string, string>,
  callback: (storage: Map<string, string>) => T
): T {
  const previousWindow = globalThis.window;
  const storage = new Map(Object.entries(storedValues));

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      sessionStorage: {
        getItem(key: string) {
          return storage.get(key) ?? null;
        },
        removeItem(key: string) {
          storage.delete(key);
        },
        setItem(key: string, value: string) {
          storage.set(key, value);
        },
      },
    },
  });

  try {
    return callback(storage);
  } finally {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: previousWindow,
    });
  }
}

function expectedPublicPath(path: string, locale: string): string {
  if (locale === routing.defaultLocale) {
    return path;
  }

  return `/${locale}${path === '/' ? '' : path}`;
}

test('routing config keeps Tuvan as the unprefixed default locale', () => {
  assert.deepEqual(routing.locales, ['tyv', 'ru']);
  assert.equal(routing.defaultLocale, 'tyv');
  assert.equal(routing.localePrefix, 'as-needed');
  assert.equal(routing.localeDetection, false);
});

test('configured public URL policy keeps default locale unprefixed and prefixes Russian', () => {
  assert.equal(expectedPublicPath('/', 'tyv'), '/');
  assert.equal(expectedPublicPath('/category/housing', 'tyv'), '/category/housing');
  assert.equal(expectedPublicPath('/listing/123', 'tyv'), '/listing/123');
  assert.equal(expectedPublicPath('/', 'ru'), '/ru');
  assert.equal(expectedPublicPath('/category/housing', 'ru'), '/ru/category/housing');
  assert.equal(expectedPublicPath('/listing/123', 'ru'), '/ru/listing/123');
});

test('localized route tree supports default and Russian public routes', () => {
  const homeSource = readFileSync('src/app/[locale]/page.tsx', 'utf8');
  const categorySource = readFileSync(
    'src/app/[locale]/category/[slug]/page.tsx',
    'utf8'
  );
  const listingSource = readFileSync(
    'src/app/[locale]/listing/[id]/page.tsx',
    'utf8'
  );

  assert.equal(homeSource.length > 0, true);
  assert.equal(categorySource.includes('category.slug'), true);
  assert.equal(listingSource.includes('params'), true);
});

test('auth callback routes remain outside localized routing', () => {
  const proxySource = readFileSync('src/proxy.ts', 'utf8');
  const callbackSource = readFileSync('src/app/auth/callback/route.ts', 'utf8');
  const confirmSource = readFileSync('src/app/auth/confirm/route.ts', 'utf8');

  assert.equal(proxySource.includes("pathname.startsWith('/auth/')"), true);
  assert.equal(callbackSource.includes('getSafeNextPath'), true);
  assert.equal(confirmSource.includes('getSafeNextPath'), true);
});

test('proxy entry point is colocated with src/app', () => {
  assert.equal(existsSync('src/proxy.ts'), true);
  assert.equal(existsSync('proxy.ts'), false);
});

test('proxy matcher covers localized pages and auth handlers but excludes static assets', () => {
  const proxySource = readFileSync('src/proxy.ts', 'utf8');

  assert.equal(proxySource.includes('export const config = {'), true);
  assert.equal(proxySource.includes('matcher:'), true);
  assert.equal(unstable_doesMiddlewareMatch({ config: proxyMatcherConfig, url: '/' }), true);
  assert.equal(unstable_doesMiddlewareMatch({ config: proxyMatcherConfig, url: '/about' }), true);
  assert.equal(unstable_doesMiddlewareMatch({ config: proxyMatcherConfig, url: '/ru/about' }), true);
  assert.equal(unstable_doesMiddlewareMatch({ config: proxyMatcherConfig, url: '/auth/callback' }), true);
  assert.equal(unstable_doesMiddlewareMatch({ config: proxyMatcherConfig, url: '/auth/confirm' }), true);
  assert.equal(unstable_doesMiddlewareMatch({ config: proxyMatcherConfig, url: '/_next/static/app.js' }), false);
  assert.equal(unstable_doesMiddlewareMatch({ config: proxyMatcherConfig, url: '/logo.png' }), false);
});

test('Russian account path is accepted as a safe internal next path', () => {
  assert.equal(getSafeNextPath('/ru/account', '/account'), '/ru/account');
});

test('external next values remain rejected', () => {
  assert.equal(
    getSafeNextPath('https://attacker.example/account', '/account'),
    '/account'
  );
  assert.equal(getSafeNextPath('//attacker.example/account', '/account'), '/account');
  assert.equal(getSafeNextPath('%2F%2Fattacker.example/account', '/account'), '/account');
  assert.equal(getSafeNextPath('\\\\attacker.example/account', '/account'), '/account');
});

test('locale switcher preserves the current query string', () => {
  const headerSource = readFileSync('src/app/components/SiteHeader.tsx', 'utf8');

  assert.equal(headerSource.includes('const currentQueryString = searchParams.toString()'), true);
  assert.equal(headerSource.includes('localizeReturnPathQuery(currentQueryString, nextLocale)'), true);
  assert.equal(headerSource.includes('recordLocaleHistoryNormalization(currentQueryString, locale, nextLocale)'), true);
  assert.equal(headerSource.includes("router.replace(href, { locale: nextLocale })"), true);
});

test('locale switcher normalizes safe nested return paths to the target locale', () => {
  assert.equal(
    localizeReturnPathQuery('from=%2Fru%2Fsearch%3Fq%3Dcar', 'tyv'),
    'from=%2Fsearch%3Fq%3Dcar'
  );
  assert.equal(
    localizeReturnPathQuery('from=%2Fsearch%3Fq%3Dcar', 'ru'),
    'from=%2Fru%2Fsearch%3Fq%3Dcar'
  );
  assert.equal(
    localizeReturnPathQuery('q=%D0%BC%D0%B0%D1%88%D0%B8%D0%BD%D0%B0&type=sale&next=%2Faccount', 'ru'),
    'q=%D0%BC%D0%B0%D1%88%D0%B8%D0%BD%D0%B0&type=sale&next=%2Fru%2Faccount'
  );
  assert.equal(
    localizeReturnPathQuery('from=%2Fru%2Fsearch%3Fq%3Dcar&type=sale&from=%2Faccount', 'tyv'),
    'from=%2Fsearch%3Fq%3Dcar&type=sale&from=%2Faccount'
  );
});

test('locale switcher does not localize unsafe nested return paths', () => {
  assert.equal(localizeSafeInternalPath('https://evil.example', 'ru'), 'https://evil.example');
  assert.equal(localizeSafeInternalPath('//evil.example', 'ru'), '//evil.example');
  assert.equal(
    localizeReturnPathQuery('from=https%3A%2F%2Fevil.example&next=%2F%2Fevil.example', 'ru'),
    'from=https%3A%2F%2Fevil.example&next=%2F%2Fevil.example'
  );
});

test('locale switch records native-back normalization for Tuvan search results', () => {
  assert.deepEqual(
    createLocaleHistoryNormalization('from=%2Fsearch%3Fq%3Dcar', 'tyv', 'ru', 123),
    {
      sourceHref: '/search?q=car',
      targetHref: '/ru/search?q=car',
      recordedAt: 123,
    }
  );
});

test('locale switch records native-back normalization for Russian search results', () => {
  assert.deepEqual(
    createLocaleHistoryNormalization('from=%2Fru%2Fsearch%3Fq%3Dcar', 'ru', 'tyv', 123),
    {
      sourceHref: '/ru/search?q=car',
      targetHref: '/search?q=car',
      recordedAt: 123,
    }
  );
});

test('locale switch records native-back normalization for category results', () => {
  assert.deepEqual(
    createLocaleHistoryNormalization('from=%2Fcategory%2Fauto', 'tyv', 'ru', 123),
    {
      sourceHref: '/category/auto',
      targetHref: '/ru/category/auto',
      recordedAt: 123,
    }
  );
  assert.deepEqual(
    createLocaleHistoryNormalization('from=%2Fru%2Fcategory%2Fauto', 'ru', 'tyv', 123),
    {
      sourceHref: '/ru/category/auto',
      targetHref: '/category/auto',
      recordedAt: 123,
    }
  );
});

test('locale switch native-back normalization ignores unsafe or non-results return paths', () => {
  assert.equal(
    createLocaleHistoryNormalization('from=https%3A%2F%2Fevil.example', 'tyv', 'ru', 123),
    null
  );
  assert.equal(
    createLocaleHistoryNormalization('from=%2F%2Fevil.example', 'tyv', 'ru', 123),
    null
  );
  assert.equal(
    createLocaleHistoryNormalization('from=%2Flisting%2F123', 'tyv', 'ru', 123),
    null
  );
});

test('locale history normalization redirects the exact stale previous entry once', () => {
  const storedIntent = JSON.stringify({
    sourceHref: '/ru/search?q=car',
    targetHref: '/search?q=car',
    recordedAt: Date.now(),
  });

  withMockWindow(
    { 'charlal-locale-history-normalization': storedIntent },
    () => {
      assert.equal(
        takeLocaleHistoryNormalizationRedirect('/ru/search?q=car', true),
        '/search?q=car'
      );
      assert.equal(takeLocaleHistoryNormalizationRedirect('/ru/search?q=car', true), null);
    }
  );
});

test('locale history normalization invalidates on a fresh native traversal mismatch', () => {
  const storedIntent = JSON.stringify({
    sourceHref: '/ru/search?q=car',
    targetHref: '/search?q=car',
    recordedAt: Date.now(),
  });

  withMockWindow(
    { 'charlal-locale-history-normalization': storedIntent },
    (storage) => {
      assert.equal(takeLocaleHistoryNormalizationRedirect('/ru/category/auto', true), null);
      assert.equal(storage.has('charlal-locale-history-normalization'), false);
    }
  );
});

test('locale history normalization waits for native traversal before consuming', () => {
  const storedIntent = JSON.stringify({
    sourceHref: '/search?q=car',
    targetHref: '/ru/search?q=car',
    recordedAt: Date.now(),
  });

  withMockWindow(
    { 'charlal-locale-history-normalization': storedIntent },
    (storage) => {
      assert.equal(
        takeLocaleHistoryNormalizationRedirect('/search?q=car', false),
        null
      );
      assert.equal(storage.get('charlal-locale-history-normalization'), storedIntent);
      assert.equal(
        takeLocaleHistoryNormalizationRedirect('/search?q=car', true),
        '/ru/search?q=car'
      );
    }
  );
});

test('explicit back-to-results can clear pending native-back normalization', () => {
  const storedIntent = JSON.stringify({
    sourceHref: '/search?q=car',
    targetHref: '/ru/search?q=car',
    recordedAt: Date.now(),
  });

  withMockWindow(
    { 'charlal-locale-history-normalization': storedIntent },
    (storage) => {
      clearLocaleHistoryNormalization();
      assert.equal(storage.has('charlal-locale-history-normalization'), false);
    }
  );
});

test('locale history normalization remains valid after several minutes on listing', () => {
  const storedIntent = JSON.stringify({
    sourceHref: '/ru/category/auto',
    targetHref: '/category/auto',
    recordedAt: Date.now() - 10 * 60 * 1000,
  });

  withMockWindow(
    { 'charlal-locale-history-normalization': storedIntent },
    () => {
      assert.equal(
        takeLocaleHistoryNormalizationRedirect('/ru/category/auto', true),
        '/category/auto'
      );
    }
  );
});

test('neutral route and database slugs stay unchanged', () => {
  const contentSource = readFileSync('src/content/tyv.ts', 'utf8');
  const migrationSource = readFileSync(
    'supabase/migrations/20260826_security_hardening.sql',
    'utf8'
  );

  assert.equal(contentSource.includes('slug: "housing"'), true);
  assert.equal(contentSource.includes('slug: "marketplace"'), true);
  assert.equal(migrationSource.includes("category = 'housing'"), true);
  assert.equal(migrationSource.includes("category = 'marketplace'"), true);
});

test('auth provider initial state defaults to a deterministic checking snapshot', () => {
  assert.deepEqual(unknownInitialAuthState, {
    status: 'checking',
    profileStatus: 'idle',
    user: null,
    profile: null,
  });
});

test('auth provider does not hydrate from module cached auth state', () => {
  const authProviderSource = readFileSync('src/lib/auth/client.tsx', 'utf8');

  assert.equal(authProviderSource.includes('cachedAuthState?.status ||'), false);
  assert.equal(authProviderSource.includes('initialAuthState'), false);
  assert.equal(authProviderSource.includes('unknownInitialAuthState.status'), true);
});

test('site header gates auth controls to the hydration-stable auth status', () => {
  const siteHeaderSource = readFileSync('src/app/components/SiteHeader.tsx', 'utf8');

  assert.equal(siteHeaderSource.includes('useSyncExternalStore'), true);
  assert.equal(
    siteHeaderSource.includes("const renderAuthStatus = hasHydrated ? authStatus : 'checking'"),
    true
  );
  assert.equal(siteHeaderSource.includes("disabled={renderAuthStatus === 'checking'}"), true);
});

test('localized root layout keeps request-specific auth out of static pages', () => {
  const layoutSource = readFileSync('src/app/[locale]/layout.tsx', 'utf8');

  assert.equal(layoutSource.includes('getCurrentAuthStateSnapshot'), false);
  assert.equal(layoutSource.includes('getCurrentUserResult'), false);
  assert.equal(layoutSource.includes('<AuthProvider>'), true);
});
