import type { CollectionEntry } from 'astro:content';

export type Work = CollectionEntry<'works'>;

export const imageBaseUrl = (import.meta.env.PUBLIC_IMAGE_BASE_URL || 'https://img.example.com').replace(/\/$/, '');

export function imageUrl(path: string): string {
  return `${imageBaseUrl}/${path.replace(/^\//, '')}`;
}

export function pageSlug(number: number): string {
  return String(number).padStart(3, '0');
}

export interface ReaderPage {
  url: string;
  route: string;
  label: string;
}

export function readerPages(work: Work): ReaderPage[] {
  const { slug, covers, pages, pageExtension } = work.data;
  const result: ReaderPage[] = [
    { url: imageUrl(`${slug}/${covers.front}`), route: 'cover-1', label: '表紙' },
  ];

  if (covers.insideFront) {
    result.push({ url: imageUrl(`${slug}/${covers.insideFront}`), route: 'cover-2', label: '表紙裏' });
  }

  result.push(...Array.from({ length: pages }, (_, index) => {
    const number = index + 1;
    const route = pageSlug(number);
    return { url: imageUrl(`${slug}/${slug}_${route}.${pageExtension}`), route, label: `${number} / ${pages}` };
  }));

  if (covers.insideBack) {
    result.push({ url: imageUrl(`${slug}/${covers.insideBack}`), route: 'cover-3', label: '裏表紙裏' });
  }
  if (covers.back) {
    result.push({ url: imageUrl(`${slug}/${covers.back}`), route: 'cover-4', label: '裏表紙' });
  }
  return result;
}

export function assertUniqueWorkSlugs(works: Work[]): void {
  const slugs = new Set<string>();
  for (const work of works) {
    if (slugs.has(work.data.slug)) throw new Error(`作品 slug が重複しています: ${work.data.slug}`);
    slugs.add(work.data.slug);
  }
}
