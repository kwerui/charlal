import { categoryTaxonomy } from '@/content/categoryTaxonomy';
import type { ListingFormCategory } from '@/lib/listingFormValidation';

type ListingFormCategoryTranslator = (key: string) => string;

export function buildListingFormCategories(
  t: ListingFormCategoryTranslator
): ListingFormCategory[] {
  return categoryTaxonomy.map((category) => ({
    name: t(`items.${category.slug}.label`),
    slug: category.slug,
    subcategories: category.subcategories.map((subcategory) => ({
      name: t(`items.${category.slug}.subcategories.${subcategory.slug}`),
      slug: subcategory.slug,
    })),
    types: category.types?.map((type) => ({
      name: t(`items.${category.slug}.types.${type.slug}`),
      slug: type.slug,
    })),
    buyTypes: category.buyTypes?.map((buyType) => ({
      name: t(`items.${category.slug}.buyTypes.${buyType.slug}`),
      slug: buyType.slug,
    })),
  }));
}
