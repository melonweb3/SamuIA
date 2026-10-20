import { z } from 'zod';
import { speechPriorities, voiceEmotions } from '../../../packages/voice/src/index';
import { voiceSettingsSchema } from './voice-studio';
const id = z.string().min(1).max(128);
export const voiceCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('configure'), patch: voiceSettingsSchema.partial() }).strict(),
  z
    .object({
      action: z.literal('profile'),
      name: z.string().trim().min(1).max(80),
      provider: z.enum(['openai', 'elevenlabs']),
    })
    .strict(),
  z.object({ action: z.literal('create'), id, ownVoice: z.boolean() }).strict(),
  z.object({ action: z.literal('verify'), id }).strict(),
  z.object({ action: z.literal('remove'), id }).strict(),
  z
    .object({ action: z.literal('sample-delete'), id, role: z.enum(['sample', 'consent']) })
    .strict(),
  z.object({ action: z.literal('claim'), token: id.optional() }).strict(),
  z.object({ action: z.literal('release'), token: id }).strict(),
  z.object({ action: z.literal('stop') }).strict(),
  z
    .object({
      action: z.literal('playback'),
      token: id,
      id: z.string().min(1).max(256),
      event: z.enum(['started', 'ended', 'failed']),
      positionMs: z.number().min(0).max(120000).optional(),
      durationMs: z.number().positive().max(120000).optional(),
      audioLevel: z.number().min(0).max(1).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('speak'),
      id: id.optional(),
      text: z.string().trim().min(1).max(2000),
      emotion: z.enum(voiceEmotions),
      intensity: z.number().min(0).max(1),
      priority: z.enum(speechPriorities),
      interrupt: z.boolean().default(false),
      matchId: z.string().min(1).max(1024).optional(),
      profileId: id.optional(),
    })
    .strict(),
]);
