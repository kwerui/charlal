import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('favorite toggles do not refresh the current route after mutation', () => {
  const buttonSource = readFileSync(
    'src/app/components/FavoriteListingButton.tsx',
    'utf8'
  );

  assert.equal(buttonSource.includes('router.refresh('), false);
});

test('favorite actions do not revalidate account owned-listing data', () => {
  const actionsSource = readFileSync('src/app/favorites/actions.ts', 'utf8');

  assert.equal(actionsSource.includes("'/account'"), false);
  assert.equal(actionsSource.includes('listOwnedDatabaseListings'), false);
  assert.equal(actionsSource.includes('list_my_listings'), false);
});

test('saved listings use the bounded database listing lookup', () => {
  const favoritesSource = readFileSync(
    'src/lib/supabase/listingFavorites.ts',
    'utf8'
  );

  assert.equal(favoritesSource.includes('listPublicDatabaseListingsByIds'), true);
  assert.equal(favoritesSource.includes('listPublicDatabaseListings()'), false);
  assert.equal(favoritesSource.includes("rpc('list_my_listings'"), false);
});
