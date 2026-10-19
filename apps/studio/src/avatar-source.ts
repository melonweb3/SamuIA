import type { OfficialAvatarFile } from '../../../packages/core/src/visual';
let embedded: Record<string, string> | undefined;
/** Embed the exact PNG bytes as base64, without re-encoding the image. */
export function avatarSource(filename: OfficialAvatarFile): string | null {
  if (document.documentElement.dataset.portable !== 'true') return `/samuia/avatar/${filename}`;
  if (!embedded) {
    const element = document.getElementById('samuia-avatar-originals');
    embedded = element?.textContent ? JSON.parse(element.textContent) : {};
  }
  return embedded?.[filename] ?? null;
}
