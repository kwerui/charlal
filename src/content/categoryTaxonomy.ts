export type TaxonomyOption = {
  slug: string;
};

export type CategoryTaxonomyItem = {
  slug: string;
  image: string;
  subcategories: TaxonomyOption[];
  types?: TaxonomyOption[];
  buyTypes?: TaxonomyOption[];
};

export const categoryTaxonomy: CategoryTaxonomyItem[] = [
  {
    slug: 'housing',
    image: 'https://i.pinimg.com/736x/60/4f/7c/604f7c17e5d21acde28ee1c793b163b4.jpg',
    types: [
      { slug: 'apartments' },
      { slug: 'land' },
      { slug: 'commercial' },
      { slug: 'storage' },
    ],
    subcategories: [{ slug: 'sale' }, { slug: 'rent' }],
  },
  {
    slug: 'marketplace',
    image: 'https://img.magnific.com/free-photo/hands-holding-colorful-paper-bags_1301-1750.jpg?semt=ais_hybrid&w=740&q=80',
    buyTypes: [
      { slug: 'all-categories' },
      { slug: 'clothing' },
      { slug: 'shoes' },
      { slug: 'office' },
      { slug: 'new' },
      { slug: 'used' },
      { slug: 'home-goods' },
      { slug: 'appliances' },
      { slug: 'furniture' },
      { slug: 'pets' },
      { slug: 'kids' },
      { slug: 'construction materials' },
      { slug: 'books' },
      { slug: 'beauty' },
      { slug: 'games' },
    ],
    subcategories: [
      { slug: 'buy' },
      { slug: 'free' },
      { slug: 'wanted' },
    ],
  },
  {
    slug: 'auto',
    image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQNiayatpD8qI7wUIdvwvJfRkg1nu4KXaPcx4wEMNy3xORNRTc3Lv0HbgA&s=10',
    subcategories: [
      { slug: 'used-cars' },
      { slug: 'new-cars' },
      { slug: 'auto-parts' },
      { slug: 'rent' },
    ],
  },
  {
    slug: 'jobs',
    image: '/images/work.png',
    subcategories: [
      { slug: 'find-talents' },
      { slug: 'find-jobs' },
    ],
  },
  {
    slug: 'services',
    image: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTmNvUIaYKZU050ccPlwlNI81Jl4QOggi9Qa7cjZDgoaBs0_Lm7fqe4bH4&s=10',
    subcategories: [],
  },
  {
    slug: 'events',
    image: '/images/party.png',
    subcategories: [
      { slug: 'events' },
      { slug: 'night-clubs' },
      { slug: 'lost-found' },
    ],
  },
];

export function findCategoryTaxonomy(slug: string): CategoryTaxonomyItem | undefined {
  return categoryTaxonomy.find((category) => category.slug === slug);
}
