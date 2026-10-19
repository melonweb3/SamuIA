import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { officialAvatarFiles, selectOfficialAvatar } from '../packages/core/src/visual';
import { emotions, gestures, defaultProfile, type AvatarState } from '../packages/shared/src/index';
import { commandSchema } from '../apps/server/src/commands';

const originals: {
  originalFile: string;
  runtimeFile: string;
  archiveFile: string;
  sha256: string;
  archiveSha256: string;
  width: number;
  height: number;
  bytes: number;
}[] = JSON.parse(readFileSync('assets/reference/originals-index.json', 'utf8'));
const sha = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
describe('Identidad oficial y conservación de originales', () => {
  it('conserva exactamente los cinco ZIP, los cinco PNG y sus copias de ejecución', () => {
    expect(originals).toHaveLength(5);
    for (const entry of originals) {
      const image = readFileSync(entry.originalFile),
        runtime = readFileSync(entry.runtimeFile);
      expect(sha(readFileSync(entry.archiveFile))).toBe(entry.archiveSha256);
      expect(sha(image)).toBe(entry.sha256);
      expect(runtime.equals(image)).toBe(true);
      expect(image.length).toBe(entry.bytes);
      expect(image.readUInt32BE(16)).toBe(entry.width);
      expect(image.readUInt32BE(20)).toBe(entry.height);
    }
  });
  it('todas las emociones, gestos y perfiles antiguos conservan una de las cinco caras oficiales', () => {
    expect(defaultProfile.avatar).toBe('official');
    for (const emotion of emotions)
      for (const gesture of gestures)
        for (const speaking of [true, false]) {
          const avatar: AvatarState = { emotion, gesture, speaking, energy: 70 };
          for (const oldProfile of ['official', 'placeholder', 'otra-persona.png'])
            expect(officialAvatarFiles).toContain(selectOfficialAvatar(avatar, oldProfile));
        }
    expect(
      selectOfficialAvatar({ emotion: 'neutral', gesture: 'ninguno', speaking: true, energy: 50 }),
    ).toBe('avatar_cara_04.png');
    expect(
      selectOfficialAvatar({
        emotion: 'pensativo',
        gesture: 'mano_barbilla',
        speaking: true,
        energy: 50,
      }),
    ).toBe('avatar_cara_02.png');
  });
  it('permite fijar las cinco referencias y rechaza archivos ajenos a la identidad', () => {
    for (const avatar of officialAvatarFiles) {
      expect(commandSchema.safeParse({ type: 'profile', patch: { avatar } }).success).toBe(true);
      expect(
        selectOfficialAvatar(
          { emotion: 'risa', gesture: 'celebracion', speaking: true, energy: 100 },
          avatar,
        ),
      ).toBe(avatar);
    }
    expect(
      commandSchema.safeParse({ type: 'profile', patch: { avatar: 'otro-personaje.png' } }).success,
    ).toBe(false);
  });
});
