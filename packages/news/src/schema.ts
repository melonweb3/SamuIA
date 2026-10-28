import { z } from 'zod';
import { programModes, newsCategories, newsFormats, newsScenes } from '../../shared/src/news';
const id = z.string().min(1).max(128);
const categories = z
  .array(z.enum(newsCategories))
  .min(1)
  .max(newsCategories.length)
  .refine((v) => new Set(v).size === v.length);
export const programModeSchema = z
  .object({ type: z.literal('program-mode'), mode: z.enum(programModes) })
  .strict();
export const newsCommandSchema = z.discriminatedUnion('action', [
  z.object({ type: z.literal('news'), action: z.literal('demo') }).strict(),
  ...(['demo-breaking', 'approve', 'start', 'pause', 'stop', 'finish'] as const).map((action) =>
    z.object({ type: z.literal('news'), action: z.literal(action) }).strict(),
  ),
  z
    .object({
      type: z.literal('news'),
      action: z.literal('categories'),
      categories: z.array(z.enum(newsCategories)).max(newsCategories.length),
    })
    .strict(),
  z
    .object({
      type: z.literal('news'),
      action: z.literal('review'),
      id,
      review: z.enum(['pending', 'approved', 'discarded']),
    })
    .strict(),
  z
    .object({
      type: z.literal('news'),
      action: z.literal('verify'),
      id,
      note: z.string().trim().min(20).max(1000),
    })
    .strict(),
  z.object({ type: z.literal('news'), action: z.literal('breaking'), id }).strict(),
  z
    .object({
      type: z.literal('news'),
      action: z.literal('edit'),
      id,
      text: z.string().trim().min(1).max(2000),
      scene: z.enum(newsScenes),
      position: z.number().int().min(0).max(100),
    })
    .strict(),
  z
    .object({
      type: z.literal('news'),
      action: z.literal('build'),
      config: z
        .object({
          categories,
          durationMinutes: z.union([z.literal(5), z.literal(15), z.literal(30), z.literal(60)]),
          count: z.number().int().min(1).max(30),
          format: z.enum(newsFormats),
          interaction: z.boolean(),
          breaking: z.boolean(),
        })
        .strict(),
    })
    .strict(),
]);
