import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const works = defineCollection({
  loader: glob({ pattern: '**/*.{yaml,yml}', base: './src/content/works' }),
  schema: z.object({
    title: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    description: z.string().min(1),
    covers: z.object({
      front: z.string().min(1),
      insideFront: z.string().min(1).optional(),
      insideBack: z.string().min(1).optional(),
      back: z.string().min(1).optional(),
    }),
    publishedAt: z.coerce.date(),
    pages: z.number().int().positive(),
    pageExtension: z.enum(['jpg', 'jpeg', 'png', 'webp', 'avif']).default('jpg'),
  }),
});

export const collections = { works };
