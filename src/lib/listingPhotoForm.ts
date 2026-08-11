export type ExistingListingPhotoFormItem = {
  id: string;
  kind: 'existing';
  url: string;
  storagePath: string;
};

export type NewListingPhotoFormItem = {
  id: string;
  kind: 'new';
  url: string;
  file: File;
};

export type ListingPhotoFormItem =
  | ExistingListingPhotoFormItem
  | NewListingPhotoFormItem;
