import { describe, it, expect } from 'vitest';
import { ReactionDirector } from '../packages/core/src/index';
import { Newsroom, classifyNews } from '../packages/news/src/index';
import { newsCategories, type NewsItem, type NewsProgramConfig } from '../packages/shared/src/news';
import { commandSchema } from '../apps/server/src/commands';
const now = Date.parse('2026-10-27T12:00:00Z');
const config: NewsProgramConfig = {
  categories: [...newsCategories],
  durationMinutes: 5,
  count: 3,
  format: 'resumen',
  interaction: false,
  breaking: true,
};
function prepare() {
  const d = new ReactionDirector(now, false);
  d.command({ type: 'program-mode', mode: 'NOTICIAS' }, now);
  for (const s of d.news.state.stories.slice(0, 3))
    d.command({ type: 'news', action: 'review', id: s.id, review: 'approved' }, now);
  d.command({ type: 'news', action: 'build', config }, now);
  d.command({ type: 'news', action: 'approve' }, now);
  return d;
}
function settle(d: ReactionDirector, t: number) {
  if (d.news.state.current) d.command({ type: 'news', action: 'finish' }, t);
  d.tick(t + 5000);
  return t + 5000;
}
const item = (patch: Partial<NewsItem> = {}): NewsItem => ({
  id: 'source-item',
  sourceId: 'medio-a',
  sourceName: 'Medio A',
  url: 'https://publisher.org/article',
  publishedAt: now,
  title: 'Alerta: apertura de una nueva biblioteca pública',
  summary: 'El municipio comunica la apertura de una biblioteca.',
  category: 'España',
  simulated: false,
  ...patch,
});
describe('redacción y verificación de noticias', () => {
  it('deduplica enlaces de seguimiento y mantiene una revisión estable al repetir una fuente', () => {
    const n = new Newsroom();
    n.ingest([item({ url: 'https://publisher.org/article?utm_source=rss' })], now);
    n.ingest([item()], now + 1);
    expect(n.state.stories).toHaveLength(1);
    expect(n.state.stories[0].revision).toBe(1);
    expect(n.state.stories[0].verification).toBe('single-source');
  });
  it('agrupa titulares coincidentes de varios medios sin confirmarlos automáticamente', () => {
    const n = new Newsroom();
    n.ingest(
      [
        item(),
        item({ id: 'b', sourceId: 'b', sourceName: 'Medio B', url: 'https://other.org/news' }),
      ],
      now,
    );
    expect(n.state.stories).toHaveLength(1);
    expect(n.state.stories[0].sources).toHaveLength(2);
    expect(n.state.stories[0].verification).toBe('corroborated');
  });
  it('dos feeds del mismo dominio no cuentan como verificación independiente', () => {
    const n = new Newsroom();
    n.ingest([item(), item({ id: 'b', sourceId: 'b', url: 'https://publisher.org/second' })], now);
    expect(n.state.stories[0].verification).toBe('single-source');
  });
  it('las noticias antiguas no entran en una escaleta y las futuras se rechazan', () => {
    const d = new ReactionDirector(now, false);
    d.news.ingest(
      [
        item({ publishedAt: now - 90000000 }),
        item({ publishedAt: now + 3600000, url: 'https://publisher.org/future' }),
      ],
      now,
    );
    expect(d.news.state.stories).toHaveLength(1);
    const s = d.news.state.stories[0];
    s.review = 'approved';
    expect(() => d.command({ type: 'news', action: 'build', config }, now)).toThrow(/actual/);
  });
  it('una actualización invalida revisión, confirmación y aprobación de la escaleta', () => {
    const d = new ReactionDirector(now, false);
    d.news.ingest([item()], now);
    const s = d.news.state.stories[0];
    d.command(
      {
        type: 'news',
        action: 'verify',
        id: s.id,
        note: 'Contrastado por el operador con el anuncio original.',
      },
      now,
    );
    d.command({ type: 'news', action: 'review', id: s.id, review: 'approved' }, now);
    d.command({ type: 'news', action: 'build', config }, now);
    d.command({ type: 'news', action: 'approve' }, now);
    d.news.ingest(
      [item({ summary: 'El municipio comunica un nuevo horario.', publishedAt: now + 1000 })],
      now + 1000,
    );
    expect(s.revision).toBe(2);
    expect(s.review).toBe('pending');
    expect(s.verification).toBe('single-source');
    expect(d.news.state.program?.approved).toBe(false);
  });
});
describe('informativo con el director, cerebro, voz y avatar existentes', () => {
  it('presenta un boletín completo sin alterar el fútbol ni necesitar credenciales', () => {
    const d = prepare(),
      before = structuredClone(d.manager.activeMatches),
      cues = d.news.state.program!.cues;
    expect(cues[0].section).toBe('INTRODUCCIÓN');
    expect(cues.at(-1)?.section).toBe('DESPEDIDA');
    expect(d.news.state.program!.estimatedSeconds).toBeLessThan(300);
    d.command({ type: 'news', action: 'start' }, now);
    let t = now;
    for (let i = 0; i < cues.length + 2 && d.news.state.program!.status !== 'completed'; i++)
      t = settle(d, t + 1);
    expect(d.news.state.program!.status).toBe('completed');
    expect(d.history.filter((h) => h.source.startsWith('Noticias'))).toHaveLength(cues.length);
    expect(d.manager.activeMatches.map((m) => m.score)).toEqual(before.map((m) => m.score));
    expect(d.history.some((h) => h.decision.say.includes('Demostración ficticia'))).toBe(true);
    expect(
      d.history.filter((h) => h.source.startsWith('Noticias')).every((h) => h.decision.avatar),
    ).toBe(true);
  });
  it('exige aprobar la escaleta y vuelve a exigirlo después de editar o reordenar', () => {
    const d = prepare(),
      p = d.news.state.program!;
    const cue = p.cues[1];
    d.command(
      {
        type: 'news',
        action: 'edit',
        id: cue.id,
        text: 'Titulares revisados por el operador.',
        scene: 'titulares',
        position: 0,
      },
      now,
    );
    expect(p.cues[0].id).toBe(cue.id);
    expect(p.approved).toBe(false);
    expect(() => d.command({ type: 'news', action: 'start' }, now)).toThrow(/aprueba/);
    d.command({ type: 'news', action: 'approve' }, now);
    d.command({ type: 'news', action: 'start' }, now);
    expect(d.decision.say).toBe('Titulares revisados por el operador.');
  });
  it('pausa y reanuda el mismo reloj de voz, y detener cancela el programa', () => {
    const d = prepare();
    d.command({ type: 'news', action: 'start' }, now);
    d.tick(now + 500);
    d.command({ type: 'news', action: 'pause' }, now + 500);
    const pos = d.playback.snapshot().positionMs;
    d.tick(now + 10000);
    expect(d.playback.snapshot().positionMs).toBe(pos);
    expect(d.news.state.program!.index).toBe(0);
    d.command({ type: 'news', action: 'start' }, now + 10001);
    expect(d.playback.snapshot().status).toBe('playing');
    d.command({ type: 'news', action: 'stop' }, now + 10002);
    d.tick(now + 30000);
    expect(d.news.state.program!.status).toBe('stopped');
    expect(d.playback.active).toBe(false);
  });
  it('alerta sin interrumpir, exige aprobación y retoma la pieza tras la última hora', () => {
    const d = prepare();
    d.command({ type: 'news', action: 'start' }, now);
    const original = d.news.state.current!;
    d.command({ type: 'news', action: 'demo-breaking' }, now + 1);
    const s = d.news.state.stories.find((v) => v.breaking)!;
    expect(d.news.state.current!.id).toBe(original.id);
    expect(() => d.command({ type: 'news', action: 'breaking', id: s.id }, now + 2)).toThrow(
      /requiere/,
    );
    d.command({ type: 'news', action: 'review', id: s.id, review: 'approved' }, now + 3);
    // Reviewing an unrelated alert must not invalidate the approved running rundown.
    expect(d.news.state.program!.approved).toBe(true);
    expect(d.news.state.program!.status).toBe('running');
    d.command({ type: 'news', action: 'breaking', id: s.id }, now + 4);
    expect(d.news.state.current?.scene).toBe('ultima-hora');
    expect(d.decision.say).toContain('Demostración ficticia');
    d.command({ type: 'news', action: 'finish' }, now + 5);
    d.tick(now + 5006);
    expect(d.news.state.current?.id).toBe(original.id);
    expect(() => d.command({ type: 'news', action: 'breaking', id: s.id }, now + 5007)).toThrow(
      /ya se ha anunciado/,
    );
  });
  it('una noticia real sin confirmar no interrumpe aunque esté aprobada editorialmente', () => {
    const d = prepare();
    d.news.ingest([item()], now);
    const s = d.news.state.stories.find((v) => !v.simulated)!;
    s.review = 'approved';
    expect(() => d.command({ type: 'news', action: 'breaking', id: s.id }, now)).toThrow(
      /confirmación/,
    );
    expect(() =>
      d.command(
        {
          type: 'news',
          action: 'verify',
          id: d.news.state.stories.find((v) => v.simulated)!.id,
          note: 'Comprobación editorial de demostración.',
        },
        now,
      ),
    ).toThrow(/ficción/);
  });
  it('responde preguntas usando el contexto actual sin inventar datos ni resultados deportivos', () => {
    const d = prepare();
    d.command({ type: 'news', action: 'start' }, now);
    let t = settle(d, now + 1);
    t = settle(d, t + 1);
    const story = d.news.story(d.news.state.current!.storyId!);
    d.command({ type: 'chat', username: 'Ana', message: '¿Dónde ocurrió eso?' }, t + 1);
    const msg = d.chat.messages.at(-1)!;
    d.command({ type: 'respond', id: msg.id }, t + 2);
    t = settle(d, t + 3);
    d.tick(t + 201);
    expect(d.decision.say).toContain(story.location);
    expect(d.decision.say).toContain('demostración ficticia');
    expect(d.history[0].sourceIds).toContain(msg.id);
    const answer = d.brain.newsAnswer('¿Cuántos millones costó?', story, d.profile);
    expect(answer.decision.say).toContain('No dispongo de datos suficientes');
  });
  it('cambia de modalidad conservando partidos, preferencias y la sesión de noticias', () => {
    const d = prepare();
    const p = d.news.state.program!;
    d.command({ type: 'program-mode', mode: 'DEPORTES' }, now);
    d.command({ type: 'event', matchId: 'celta-madrid', eventType: 'goal', side: 'home' }, now + 1);
    expect(d.manager.get('celta-madrid').score.home).toBe(1);
    d.command({ type: 'program-mode', mode: 'NOTICIAS' }, now + 2);
    expect(d.news.state.program).toBe(p);
    expect(d.manager.get('celta-madrid').score.home).toBe(1);
  });
  it('valida formatos, duraciones, límites, escenas y evidencia antes de admitir comandos', () => {
    for (const mode of ['DEPORTES', 'NOTICIAS', 'EVENTOS', 'CHAT', 'AUTOMÁTICO'])
      expect(commandSchema.safeParse({ type: 'program-mode', mode }).success).toBe(true);
    expect(
      commandSchema.safeParse({ type: 'news', action: 'build', config: { ...config, count: 500 } })
        .success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({ type: 'news', action: 'verify', id: 'a', note: 'sí' }).success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({ type: 'news', action: 'approve', unexpected: true }).success,
    ).toBe(false);
  });
});

it('clasifica por contenido con categoría de origen como alternativa explícita', () => {
  expect(classifyNews('Taller de IA en Galicia', 'España')).toBe('Inteligencia artificial');
  expect(classifyNews('Una nueva biblioteca en Vigo', 'España')).toBe('Galicia');
  expect(classifyNews('Noticias sobre bitcoin', 'Economía')).toBe('Criptomonedas');
  expect(classifyNews('Un acontecimiento sin más detalles', 'España')).toBe('España');
});
it('el titular completo respeta su objetivo y no rellena con hechos inventados', () => {
  const d = prepare();
  const s = d.news.state.stories[0];
  const cue = d.brain.newsCue(s, 'Titular', 'titular', d.profile);
  expect(cue.estimatedSeconds).toBeLessThanOrEqual(15);
  expect(cue.text).toContain('Demostración ficticia');
  expect(cue.text).not.toContain('millones');
});
