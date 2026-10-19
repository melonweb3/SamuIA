import { z } from 'zod';
import { eventTypes, avatarAnimations, gazeTargets } from '../../../packages/shared/src/index';
import { officialAvatarFiles } from '../../../packages/core/src/visual';
const id = z.string().min(1).max(128),
  name = z.string().trim().min(1).max(80),
  level = z.number().int().min(0).max(100);
const status = z.enum(['upcoming', 'live', 'halftime', 'finished']);
const flags = z
  .object(
    Object.fromEntries(eventTypes.map((t) => [t, z.boolean()])) as Record<
      (typeof eventTypes)[number],
      z.ZodBoolean
    >,
  )
  .strict();
const settings = z
  .object({
    studioComposition: z.enum(['integrated', 'portrait']),
    studioBackdrop: z.enum(['auto', '01', '02', '03', '04', '05']),
    studioGraphics: z.boolean(),
    studioLighting: z.boolean(),
    autoReactions: z.boolean(),
    maxReactionsPerMinute: z.number().int().min(1).max(30),
    reactionCooldown: z.number().min(0).max(60),
    cameraCooldown: z.number().min(0).max(60),
    carouselCooldown: z.number().min(1).max(120),
    carouselEnabled: z.boolean(),
    showSecondaryAlerts: z.boolean(),
    reactToFavorites: z.boolean(),
    safeMode: z.boolean(),
    favoriteTeams: z.array(name).max(100),
    favoriteLeagues: z.array(id).max(100),
  })
  .partial()
  .strict();
const profile = z
  .object({
    name,
    avatar: z.enum(['official', 'placeholder', ...officialAvatarFiles]),
    description: z.string().max(500),
    personalityStyle: z.string().max(500),
    catchphrases: z.array(name).max(30),
    prohibitedExpressions: z.array(name).max(50),
    humorLevel: level,
    emotionLevel: level,
    rivalryLevel: level,
    predictionFrequency: level,
    emojiFrequency: level,
    communityInteractionLevel: level,
    commentaryFrequency: level,
    galicianLevel: level,
    responseLength: z.enum(['short', 'medium', 'long']),
    communityTeams: z.record(z.enum(['home', 'away']).nullable()),
    specialRules: z
      .array(
        z
          .object({
            scope: z.enum(['team', 'league']),
            key: name,
            emotionLevel: level,
            rivalryLevel: level,
          })
          .strict(),
      )
      .max(50),
  })
  .partial()
  .strict();
export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('data-mode'), mode: z.enum(['SIMULATION', 'LIVE']) }).strict(),
  z
    .object({
      type: z.literal('avatar-simulate'),
      animation: z.enum(avatarAnimations),
      intensity: z.number().min(0).max(1),
      text: z.string().max(500),
      gaze: z.enum(gazeTargets),
    })
    .strict(),
  z.object({ type: z.literal('avatar-gaze'), target: z.enum(gazeTargets) }).strict(),
  z
    .object({
      type: z.literal('event'),
      matchId: id,
      eventType: z.enum(eventTypes),
      side: z.enum(['home', 'away']),
    })
    .strict(),
  z
    .object({
      type: z.literal('chat'),
      username: z.string().trim().min(1).max(40),
      message: z.string().trim().min(1).max(500),
      matchId: id.optional(),
      clientId: id.optional(),
    })
    .strict(),
  ...(['respond', 'skip', 'mute'] as const).map((type) =>
    z.object({ type: z.literal(type), id }).strict(),
  ),
  z
    .object({
      type: z.literal('control'),
      action: z.enum(['silence', 'angry', 'celebrate', 'normal']),
    })
    .strict(),
  z.object({ type: z.literal('main'), matchId: id.nullable() }).strict(),
  z.object({ type: z.literal('focus'), matchId: id }).strict(),
  z
    .object({
      type: z.literal('subscription'),
      matchId: id,
      patch: z
        .object({
          tracking: z.boolean(),
          priority: z.enum(['ALTA', 'MEDIA', 'BAJA']),
          reactions: z.object({ paused: z.boolean(), events: flags }).strict(),
        })
        .partial()
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal('match-add'),
      leagueId: id,
      home: name,
      away: name,
      status,
      contextType: z.enum(['regular', 'derby', 'final']),
    })
    .strict(),
  z.object({ type: z.literal('match-remove'), matchId: id }).strict(),
  z.object({ type: z.literal('match-status'), matchId: id, status }).strict(),
  z.object({ type: z.literal('league'), id, enabled: z.boolean() }).strict(),
  z.object({ type: z.literal('league-add'), name }).strict(),
  z.object({ type: z.literal('settings'), patch: settings }).strict(),
  z.object({ type: z.literal('profile'), patch: profile }).strict(),
  z
    .object({
      type: z.literal('comment'),
      matchId: id,
      kind: z.enum(['analysis', 'prediction', 'question', 'community']),
    })
    .strict(),
]);
