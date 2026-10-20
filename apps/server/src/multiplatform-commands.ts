import { z } from 'zod';
import { platforms } from '../../../packages/shared/src/index';
const platform = z.enum(platforms),
  id = z.string().min(1).max(1024);
export const multiplatformCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('chat'), platform, enabled: z.boolean() }).strict(),
  z.object({ action: z.literal('output'), platform, enabled: z.boolean() }).strict(),
  z.object({ action: z.literal('start'), preview: z.boolean().default(false) }).strict(),
  z.object({ action: z.literal('stop'), sessionId: id.optional() }).strict(),
  z
    .object({
      action: z.literal('metadata'),
      platform,
      title: z.string().trim().min(1).max(140),
      category: z.string().trim().min(1).max(100),
    })
    .strict(),
  z
    .object({
      action: z.literal('voice'),
      sessionId: id,
      id,
      event: z.enum(['started', 'ended', 'failed']),
      positionMs: z.number().min(0).max(120000).optional(),
      durationMs: z.number().positive().max(120000).optional(),
      audioLevel: z.number().min(0).max(1).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('simulate-chat'),
      platform,
      username: z.string().trim().min(1).max(40),
      message: z.string().trim().min(1).max(500),
      isBot: z.boolean().optional(),
    })
    .strict(),
]);
