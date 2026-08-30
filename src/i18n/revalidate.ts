import { revalidatePath } from 'next/cache';

export function revalidateLocalizedPath(path: string): void {
  revalidatePath(path);
  revalidatePath(`/ru${path}`);
}

export function revalidateLocalizedRoutePattern(
  pattern: string,
  type: 'layout' | 'page'
): void {
  revalidatePath(`/[locale]${pattern}`, type);
}

