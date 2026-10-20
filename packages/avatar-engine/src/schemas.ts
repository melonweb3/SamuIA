import { z } from 'zod';
import { avatarAnimations } from '../../shared/src/avatar';
import { avatarStates, renderModes, reactionKinds } from './contracts';
export const avatarSettingsSchema = z
  .object({
    avatarEnabled: z.boolean(),
    lipSyncEnabled: z.boolean(),
    idleAnimationEnabled: z.boolean(),
    blinkEnabled: z.boolean(),
    microMotionEnabled: z.boolean(),
    reactionRandomization: z.boolean(),
    defaultRenderMode: z.enum(renderModes),
    defaultIdleStyle: z.enum(['calm', 'breathing']),
    defaultTalkStyle: z.enum(['subtle', 'expressive']),
    celebrationIntensityBoost: z.number().min(1).max(1.5),
    reactionCooldown: z.number().min(0).max(30),
    videoReferenceEnabled: z.boolean(),
  })
  .strict();
export const reactionAssetSchema = z
  .object({
    id: z.string().min(1).max(128),
    name: z.string().trim().min(1).max(80),
    emotion: z.enum(reactionKinds),
    intensityMin: z.number().min(0).max(1),
    intensityMax: z.number().min(0).max(1),
    animation: z.enum(avatarAnimations),
    source: z.enum(['built-in', 'manual', 'reference-video', 'placeholder']),
    tags: z.array(z.string().trim().min(1).max(40)).max(20),
    durationMs: z.number().int().min(500).max(30000),
    compatibleRenderModes: z.array(z.enum(renderModes)).min(1).max(4),
    enabled: z.boolean(),
    favorite: z.boolean(),
    priority: z.number().int().min(-10).max(10),
    cooldownMs: z.number().int().min(0).max(60000),
    status: z.enum(['ready', 'reference-only', 'placeholder']),
    motion: z
      .object({
        tilt: z.number().min(-3).max(3),
        sway: z.number().min(0).max(4),
        bounce: z.number().min(-4).max(4),
        breathe: z.number().min(0).max(3),
        mouthGain: z.number().min(0).max(1.5),
      })
      .strict(),
    videoReferenceId: z.string().min(1).max(128).optional(),
    createdAt: z.number().nonnegative(),
  })
  .strict()
  .refine((a) => a.intensityMin <= a.intensityMax, 'Rango de intensidad inválido')
  .refine(
    (a) => a.source !== 'reference-video' || a.status === 'reference-only',
    'Vídeos solo como referencia',
  );
export const manualAvatarSchema = z
  .object({
    avatarState: z.enum(avatarStates).optional(),
    animationOverride: z.enum(avatarAnimations).optional(),
    assetId: z.string().min(1).max(128).optional(),
    assetKind: z.enum(reactionKinds).optional(),
    reactOnly: z.boolean().optional(),
  })
  .strict();
export const referencePatchSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    emotion: z.enum(reactionKinds),
    intensity: z.number().min(0).max(1),
    tags: z.array(z.string().trim().min(1).max(40)).max(20),
    enabled: z.boolean(),
  })
  .strict();
export const motionReferenceSchema = referencePatchSchema
  .extend({
    id: z.string().uuid(),
    type: z.literal('video'),
    sourceKind: z.literal('reference-video'),
    duration: z.number().positive().max(86400),
    status: z.enum(['stored', 'pending-motion']),
    createdAt: z.number().nonnegative(),
    mime: z.enum(['video/mp4', 'video/webm', 'video/quicktime']),
    bytes: z
      .number()
      .int()
      .min(1)
      .max(100 * 1024 * 1024),
  })
  .strict();
export const avatarLibrarySchema = z
  .object({
    version: z.literal(1),
    settings: avatarSettingsSchema,
    assets: z.array(reactionAssetSchema).max(150),
    references: z.array(motionReferenceSchema).max(60),
  })
  .strict();
