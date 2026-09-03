import { content } from '@/content/tyv';
import type { Listing } from '@/data/listings';

export type ListingFormMode = 'create' | 'edit';

export type NestedListingOption = {
  name: string;
  slug: string;
};

export type ListingFormCategory = {
  name: string;
  slug: string;
  subcategories: NestedListingOption[];
  types?: NestedListingOption[];
  buyTypes?: NestedListingOption[];
};

export type ListingFormValues = {
  title: string;
  description: string;
  priceText: string;
  location: string;
  categorySlug: string;
  subcategorySlug: string;
  typeSlug: string;
  buyTypeSlug: string;
};

export type ValidatedListingFormValues = {
  title: string;
  description: string;
  price: number;
  location: string;
  categorySlug: string;
  subcategorySlug: string;
  transactionType?: Listing['transactionType'];
  propertyType?: Listing['propertyType'];
  marketplaceType?: string;
};

export type ListingFormValidationResult =
  | {
      ok: true;
      values: ValidatedListingFormValues;
    }
  | {
      ok: false;
      errors: string[];
    };

export type ListingFormValidationMessages = {
  titleRequired: string;
  descriptionRequired: string;
  locationRequired: string;
  categoryRequired: string;
  priceRequired: string;
  housingTypeRequired: string;
  marketplaceTypeRequired: string;
};

export const legacyListingFormValidationMessages: ListingFormValidationMessages = {
  titleRequired: content.postAdErrorTitleRequired,
  descriptionRequired: content.postAdErrorDescriptionRequired,
  locationRequired: content.postAdErrorLocationRequired,
  categoryRequired: content.postAdErrorCategoryRequired,
  priceRequired: content.postAdErrorPriceRequired,
  housingTypeRequired: content.postAdErrorHousingTypeRequired,
  marketplaceTypeRequired: content.postAdErrorMarketplaceTypeRequired,
};

function optionExists(options: NestedListingOption[] | undefined, slug: string): boolean {
  return Boolean(options?.some((option) => option.slug === slug));
}

export function getListingFormValues(formData: FormData): ListingFormValues {
  function getFormValue(name: string): string {
    const value = formData.get(name);

    return typeof value === 'string' ? value.trim() : '';
  }

  return {
    title: getFormValue('title'),
    description: getFormValue('description'),
    priceText: getFormValue('price'),
    location: getFormValue('location'),
    categorySlug: getFormValue('category'),
    subcategorySlug: getFormValue('subcategory'),
    typeSlug: getFormValue('type'),
    buyTypeSlug: getFormValue('buyType'),
  };
}

export function validateListingFormValues(
  values: ListingFormValues,
  categories: ListingFormCategory[],
  messages: ListingFormValidationMessages = legacyListingFormValidationMessages
): ListingFormValidationResult {
  const selectedFormCategory = categories.find(
    (category) => category.slug === values.categorySlug
  );
  const subcategorySlug = selectedFormCategory?.subcategories.length
    ? values.subcategorySlug
    : 'all';
  const price = Number(values.priceText);
  const errors: string[] = [];

  if (!values.title) {
    errors.push(messages.titleRequired);
  }

  if (!values.description) {
    errors.push(messages.descriptionRequired);
  }

  if (!values.location) {
    errors.push(messages.locationRequired);
  }

  const validSubcategory =
    selectedFormCategory && selectedFormCategory.subcategories.length > 0
      ? optionExists(selectedFormCategory.subcategories, subcategorySlug)
      : subcategorySlug === 'all';
  const formMarketplaceBuyTypes =
    selectedFormCategory?.buyTypes?.filter((buyType) => buyType.slug !== 'all-categories') ||
    [];
  const validHousingType =
    values.categorySlug === 'housing' &&
    optionExists(selectedFormCategory?.types, values.typeSlug);
  const validMarketplaceType =
    values.categorySlug === 'marketplace' &&
    subcategorySlug === 'buy' &&
    formMarketplaceBuyTypes.some((buyType) => buyType.slug === values.buyTypeSlug);

  if (!selectedFormCategory || !subcategorySlug || !validSubcategory) {
    errors.push(messages.categoryRequired);
  }

  if (values.priceText === '' || !Number.isFinite(price) || price < 0) {
    errors.push(messages.priceRequired);
  }

  if (values.categorySlug === 'housing' && !validHousingType) {
    errors.push(messages.housingTypeRequired);
  }

  if (
    values.categorySlug === 'marketplace' &&
    subcategorySlug === 'buy' &&
    !validMarketplaceType
  ) {
    errors.push(messages.marketplaceTypeRequired);
  }

  if (errors.length > 0 || !selectedFormCategory) {
    return {
      ok: false,
      errors,
    };
  }

  const validatedValues: ValidatedListingFormValues = {
    title: values.title,
    description: values.description,
    price,
    location: values.location,
    categorySlug: values.categorySlug,
    subcategorySlug,
  };

  if (values.categorySlug === 'housing') {
    validatedValues.transactionType = subcategorySlug === 'rent' ? 'rent' : 'sale';
    validatedValues.propertyType = values.typeSlug as Listing['propertyType'];
  }

  if (values.categorySlug === 'marketplace' && subcategorySlug === 'buy') {
    validatedValues.marketplaceType = values.buyTypeSlug;
  }

  return {
    ok: true,
    values: validatedValues,
  };
}
