import { describe, it, expect } from 'vitest';
import { CommunityAnalyzer } from '../packages/community/src/index';
import { ReactionDirector } from '../packages/core/src/index';
import type { ExternalChatMessage } from '../packages/shared/src/index';
const now = 1000000;
const message = (id: string, values: Partial<ExternalChatMessage> = {}): ExternalChatMessage => ({
  id,
  platform: 'twitch',
  liveId: 'live1',
  userId: id,
  username: id,
  message: 'Vamos Celta, qué buen partido',
  timestamp: now,
  receivedAt: now,
  ...values,
});
describe('CommunityAnalyzer and external ingress', () => {
  it('filters duplicate, known bots, spam, repetition, abuse and burst limits', () => {
    const analyzer = new CommunityAnalyzer();
    const m = { ...message('one'), matchId: 'm1' };
    expect(analyzer.ingest(m, now)).toBe(true);
    expect(analyzer.ingest(m, now + 1)).toBe(false);
    expect(analyzer.ingest({ ...m, id: 'bot' }, now, true, true)).toBe(false);
    expect(
      analyzer.ingest(
        { ...m, id: 'spam', message: 'buy followers https://a.test https://b.test' },
        now,
      ),
    ).toBe(false);
    expect(analyzer.ingest({ ...m, id: 'abuse', message: 'Eres un racista' }, now)).toBe(false);
    expect(analyzer.ingest({ ...m, id: 'repeat' }, now + 2)).toBe(false);
    for (let i = 0; i < 6; i++)
      analyzer.ingest({ ...m, id: `burst${i}`, message: `Mensaje diferente ${i}` }, now + i + 3);
    expect(analyzer.summary(undefined, now + 20).filtered).toMatchObject({
      duplicate: 1,
      bot: 1,
      spam: 1,
      inappropriate: 1,
      repetition: 1,
      'rate-limit': expect.any(Number),
    });
  });
  it('does not invent sentiment or percentages from one repeated user; isolates match and platform', () => {
    const analyzer = new CommunityAnalyzer();
    for (let i = 0; i < 5; i++)
      analyzer.ingest(
        { ...message(`a${i}`), userId: 'one', message: `Vamos, bien ${i}`, matchId: 'm1' },
        now + i,
        false,
      );
    expect(analyzer.describe('m1', now + 10)).toContain('pocos participantes');
    expect(analyzer.summary('m2', now + 10).sampleSize).toBe(0);
    expect(analyzer.summary('m1', now + 10).platforms[0].users).toBe(1);
    expect(analyzer.summary('m1', now + 130000).sampleSize).toBe(0);
  });
  it('detects a divided penalty debate on YouTube and enthusiasm on Twitch', () => {
    const analyzer = new CommunityAnalyzer();
    [
      'Fue correcto, sí era penalti',
      'Bien, justo el penalti',
      'No era penalti, fatal',
      'Ese penalti es un robo',
    ].forEach((text, i) =>
      analyzer.ingest(
        { ...message(`y${i}`, { platform: 'youtube', message: text }), matchId: 'm1' },
        now,
      ),
    );
    for (let i = 0; i < 3; i++) analyzer.ingest({ ...message(`t${i}`), matchId: 'm1' }, now);
    const summary = analyzer.summary('m1', now);
    expect(summary.platforms.find((p) => p.platform === 'youtube')?.divided).toBe(true);
    expect(analyzer.describe('m1', now)).toContain('YouTube hay división sobre penalti');
    expect(analyzer.describe('m1', now)).toContain('Twitch os estáis viniendo arriba');
  });
  it('preserves identity, reply and origin; scoped mutes never mute same-name users on another platform', () => {
    const d = new ReactionDirector(now, false);
    expect(
      d.receiveExternalChat(message('x', { username: 'Ana', replyTo: { id: 'parent' } }), now),
    ).toBe(true);
    const first = d.chat.messages[0];
    expect(first.external?.replyTo?.id).toBe('parent');
    expect(d.receiveExternalChat(message('x'), now + 1)).toBe(false);
    d.chat.mute(first.id);
    expect(d.receiveExternalChat(message('next', { userId: 'x', username: 'Ana' }), now + 2)).toBe(
      false,
    );
    expect(
      d.receiveExternalChat(message('other', { platform: 'youtube', username: 'Ana' }), now + 3),
    ).toBe(true);
    expect(d.chat.messages.at(-1)?.platform).toBe('youtube');
  });
  it('uses actual analyzer sources when the engine summarizes external trends', () => {
    const d = new ReactionDirector(now, false);
    for (let i = 0; i < 3; i++) d.receiveExternalChat(message(`t${i}`), now + i);
    d.command({ type: 'comment', kind: 'community', matchId: d.manager.mainMatchId! }, now + 10);
    expect(d.history[0].decision.say).toContain('Twitch');
    expect(d.history[0].sourceIds).toHaveLength(3);
    expect(d.snapshot(now + 10).voice.status).toBe('playing');
  });
  it('keeps personality safety rules active when speaking a platform trend', () => {
    const d = new ReactionDirector(now, false);
    d.profile.prohibitedExpressions = ['Twitch'];
    for (let i = 0; i < 3; i++) d.receiveExternalChat(message(`u${i}`), now + i);
    d.command({ type: 'comment', kind: 'community', matchId: d.manager.mainMatchId! }, now + 10);
    expect(d.history[0].decision.say).toBe('Seguimos el partido con calma y con respeto.');
  });
});
