import Link from 'next/link';




import { notFound } from 'next/navigation';
import { content } from '@/content/tyv';
import CategoryHeroControls from "./CategoryHeroControls";

type CategoryPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams(): { slug: string }[] {
  return content.categories.map((category) => ({
    slug: category.slug,
  }));
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;
  const category = content.categories.find((item) => item.slug === slug);
  const showTypeSelect = category?.slug === 'housing';
  const showSearchBar = category?.slug === 'marketplace' || category?.slug === 'services';
  const showHeroSubcategories = category ? category.slug !== 'services' : false;

  if (!category) {
    notFound();
  }

  return (
    <div className="app-container">
      <section className="category-page">
        <Link href="/" className="page-back-link">
          {content.backToHome}
        </Link>

        <section
          className={`category-hero${category.image ? ' has-image' : ''}`}
          data-slug={category.slug}
          style={
            category.image
              ? {
                  backgroundImage: `linear-gradient(135deg, rgba(17,24,39,0.72), rgba(37,99,235,0.5)), url(${category.image})`
                }
              : undefined
          }
        >
          <div className="category-hero-inner">
            <div className="category-hero-copy">
              <p className="hero-kicker">{content.categoryPageTitle}</p>
              <h2 className="page-title">{category.name}</h2>
            </div>

            <div className="category-hero-controls">
              <CategoryHeroControls
                category={category}
                showTypeSelect={showTypeSelect}
                showHeroSubcategories={showHeroSubcategories}
                showSearchBar={showSearchBar}
              />
            </div>
          </div>
        </section>

      </section>
    </div>
  );
}
