export const PUBLIC_LISTING_MAX_LIMIT = 100;

export type PublicListingQueryOptions = {
  categorySlug?: string;
  subcategorySlug?: string;
  isAllPage?: boolean;
  housingTransaction?: string;
  housingPropertyType?: string;
  marketplaceType?: string;
  minPrice?: number | string;
  maxPrice?: number | string;
  searchQuery?: string;
  limit?: number;
  offset?: number;
};

export type NormalizedPublicListingQueryOptions = {
  categorySlug: string;
  subcategorySlug: string;
  isAllPage: boolean;
  housingTransaction: string;
  housingPropertyType: string;
  marketplaceType: string;
  minPrice?: number;
  maxPrice?: number;
  searchQuery: string;
  limit?: number;
  offset?: number;
};

function normalizeText(value: string | undefined): string {
  return value?.trim() || '';
}

function normalizePrice(value: number | string | undefined): number | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }

  const price = Number(value);

  return Number.isFinite(price) ? price : undefined;
}

function normalizeLimit(value: number | undefined): number | undefined {
  if (!Number.isFinite(value) || value === undefined || value <= 0) {
    return undefined;
  }

  return Math.min(Math.floor(value), PUBLIC_LISTING_MAX_LIMIT);
}

function normalizeOffset(value: number | undefined): number | undefined {
  if (!Number.isFinite(value) || value === undefined || value < 0) {
    return undefined;
  }

  return Math.floor(value);
}

export function normalizePublicListingQueryOptions(
  options: PublicListingQueryOptions = {}
): NormalizedPublicListingQueryOptions {
  const isAllPage = options.isAllPage === true;
  const subcategorySlug = isAllPage
    ? ''
    : normalizeText(options.subcategorySlug);
  const limit = normalizeLimit(options.limit);
  const offset = normalizeOffset(options.offset);

  const normalized: NormalizedPublicListingQueryOptions = {
    categorySlug: normalizeText(options.categorySlug),
    subcategorySlug,
    isAllPage,
    housingTransaction: normalizeText(options.housingTransaction) || 'all',
    housingPropertyType: normalizeText(options.housingPropertyType) || 'all',
    marketplaceType: normalizeText(options.marketplaceType),
    minPrice: normalizePrice(options.minPrice),
    maxPrice: normalizePrice(options.maxPrice),
    searchQuery: normalizeText(options.searchQuery),
  };

  if (limit !== undefined) {
    normalized.limit = limit;
  }

  if (offset !== undefined) {
    normalized.offset = offset;
  }

  return normalized;
}

export function hasPublicListingSearchQuery(
  options: Pick<PublicListingQueryOptions, 'searchQuery'>
): boolean {
  return normalizeText(options.searchQuery).length > 0;
}

export function toPublicListingIlikePattern(searchQuery: string): string {
  const safeSearchQuery = searchQuery
    .replace(/[(),]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/\s+/g, ' ')
    .trim();

  return `%${safeSearchQuery}%`;
}
