import type { ReactionDirector } from '../../../packages/core/src/index';
import { avatarLibrarySchema } from '../../../packages/avatar-engine/src/schemas';
export const avatarPreferenceKey = 'samuia-avatar-v9';
export function loadAvatarPreferences(session: ReactionDirector) {
  const stored = localStorage.getItem(avatarPreferenceKey);
  if (!stored) return;
  const saved = avatarLibrarySchema.parse(JSON.parse(stored));
  session.command({ type: 'avatar-settings', patch: saved.settings });
  session.animation.library.replace(saved.assets);
}
export function saveAvatarPreferences(session: ReactionDirector) {
  localStorage.setItem(
    avatarPreferenceKey,
    JSON.stringify({
      version: 1,
      settings: session.animation.settings,
      assets: session.animation.library.snapshot(),
      references: [],
    }),
  );
}
