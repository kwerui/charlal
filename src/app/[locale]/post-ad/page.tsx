import { getTranslations } from 'next-intl/server';
import { categoryTaxonomy } from '@/content/categoryTaxonomy';
import type { ListingFormCategory } from '@/lib/listingFormValidation';
import PostAdForm from './PostAdForm';

function buildListingFormCategories(
  t: Awaited<ReturnType<typeof getTranslations>>
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

export default async function PostAdPage() {
  const t = await getTranslations('PostAd');
  const categoriesT = await getTranslations('Categories');

  return (
    <main className="form-page form-page--listing-editor">
      <section
        className="form-panel form-panel--listing-editor"
        aria-labelledby="post-ad-title"
      >
        <div className="form-page-heading">
          <h1 id="post-ad-title" className="auth-title">
            {t('title')}
          </h1>
        </div>
        <PostAdForm categories={buildListingFormCategories(categoriesT)} />
      </section>
    </main>
  );
}
