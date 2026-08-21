type AuthCallbackRedirectOriginInput = {
  nodeEnv?: string;
  requestOrigin: string;
  siteUrl?: string | null;
};

function getConfiguredSiteOrigin(siteUrl: string | null | undefined): string | null {
  const rawSiteUrl = siteUrl?.trim();

  if (!rawSiteUrl) {
    return null;
  }

  try {
    const parsedUrl = new URL(rawSiteUrl);

    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      return null;
    }

    return parsedUrl.origin;
  } catch {
    return null;
  }
}

export function getAuthCallbackRedirectOrigin({
  nodeEnv = process.env.NODE_ENV,
  requestOrigin,
  siteUrl = process.env.NEXT_PUBLIC_SITE_URL,
}: AuthCallbackRedirectOriginInput): string {
  const configuredOrigin = getConfiguredSiteOrigin(siteUrl);

  if (configuredOrigin) {
    return configuredOrigin;
  }

  if (nodeEnv === 'production') {
    throw new Error(
      'NEXT_PUBLIC_SITE_URL must be configured with an http(s) origin for auth callbacks in production.'
    );
  }

  return requestOrigin;
}
