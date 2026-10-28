import { it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReactionDirector } from '../packages/core/src/index';
import { NewsSourceManager } from '../apps/server/src/news-sources';
import { NewsService } from '../apps/server/src/news-service';
import { NewsStorage } from '../apps/server/src/news-storage';
it('recupera fuentes, verificación, preferencias y programas sin reiniciar una emisión ni conservar chat', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'samuia-news-'));
  const file = join(dir, 'state.json');
  const d = new ReactionDirector();
  const sources = new NewsSourceManager(() => {}, { NEWS_ALLOWED_HOSTS: 'publisher.org' });
  const service = new NewsService(sources, () => d, {
    storageFile: file,
    env: { OPENAI_API_KEY: 'secret-only-server' },
  });
  try {
    sources.add({
      termsUrl: 'https://publisher.org/terms',
      termsNote: 'Permiso ficticio documentado para la prueba de persistencia.',
      name: 'Medio',
      url: 'https://publisher.org/rss',
      kind: 'rss',
      category: 'Galicia',
      enabled: false,
      usage: 'headlines',
    });
    d.command({ type: 'program-mode', mode: 'NOTICIAS' });
    const story = d.news.state.stories[0];
    d.command({ type: 'news', action: 'review', id: story.id, review: 'approved' });
    await service.action({
      action: 'generate',
      config: {
        categories: [story.category],
        durationMinutes: 5,
        count: 1,
        format: 'resumen',
        interaction: false,
        breaking: true,
      },
    });
    await service.action({ action: 'save' });
    d.command({ type: 'news', action: 'approve' });
    d.command({ type: 'news', action: 'start' });
    d.profile.name = 'SamuIA persistente';
    d.command({ type: 'chat', username: 'persona-privada', message: 'mensaje-personal-secreto' });
    service.save();
    const next = new ReactionDirector();
    const nextSources = new NewsSourceManager(() => {}, {});
    const restored = new NewsService(nextSources, () => next, { storageFile: file, env: {} });
    expect(nextSources.sources).toHaveLength(1);
    expect(next.news.state.stories[0].review).toBe('approved');
    expect(next.news.state.program?.status).toBe('draft');
    expect(next.news.state.program?.approved).toBe(false);
    expect(next.news.state.current).toBeNull();
    expect(next.profile.name).toBe('SamuIA persistente');
    expect(restored.archive).toHaveLength(1);
    await restored.action({ action: 'load', id: restored.archive[0].id });
    expect(next.news.state.program?.approved).toBe(false);
    const text = readFileSync(file, 'utf8');
    expect(text).not.toContain('secret-only-server');
    expect(text).not.toContain('mensaje-personal-secreto');
    expect(text).not.toContain('persona-privada');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
it('conserva archivos dañados o de otra versión sin sobrescribirlos', () => {
  const dir = mkdtempSync(join(tmpdir(), 'samuia-news-'));
  const file = join(dir, 'state.json');
  try {
    writeFileSync(file, '{"version":99}');
    const store = new NewsStorage(file);
    expect(store.load()).toBeNull();
    store.save({ anything: true });
    expect(store.error).toBeTruthy();
    expect(readFileSync(file, 'utf8')).toBe('{"version":99}');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
it('prepara programación persistente sin activar emisiones', async () => {
  const d = new ReactionDirector();
  const s = new NewsService(new NewsSourceManager(() => {}), () => d, {
    storageFile: null,
    env: {},
  });
  await s.action({
    action: 'schedule',
    schedule: {
      id: 'daily',
      date: '2026-11-01',
      time: '09:00',
      timezone: 'Europe/Madrid',
      type: 'NOTICIAS',
      durationMinutes: 15,
      categories: ['Galicia'],
      status: 'draft',
      output: { platforms: [], simulation: true },
    },
  });
  expect(s.schedules).toHaveLength(1);
  expect(d.news.state.program).toBeNull();
  await expect(
    s.action({ action: 'configure', config: { ...s.brain.config, apiKey: 'no-client-secrets' } }),
  ).rejects.toThrow();
});
it('contextualiza preguntas con la noticia actual y las secciones del mismo programa', async () => {
  const d = new ReactionDirector();
  d.command({ type: 'program-mode', mode: 'NOTICIAS' });
  const story = d.news.state.stories[0];
  story.review = 'approved';
  let input = '';
  const s = new NewsService(new NewsSourceManager(() => {}), () => d, {
    storageFile: null,
    env: { OPENAI_API_KEY: 'secret' },
    generate: async (request) => {
      input = request.input;
      return {
        text: JSON.stringify({
          text: 'La fuente no indica cuándo estará disponible.',
          sourceIds: [story.sources[0].id],
        }),
        tokens: 80,
      };
    },
  });
  await s.action({ action: 'configure', config: { ...s.brain.config, mode: 'IA REAL' } });
  const response = await s.answer('¿Y cuándo estará disponible?', story, 'Sin datos');
  expect(response).toContain('no indica');
  expect(input).toContain(story.title);
  expect(input).toContain('¿Y cuándo');
});
it('la generación admite noticias pendientes como borrador sin autorizarlas para emitir', async () => {
  const d = new ReactionDirector();
  d.command({ type: 'program-mode', mode: 'NOTICIAS' });
  const s = new NewsService(new NewsSourceManager(() => {}), () => d, {
    storageFile: null,
    env: {},
  });
  const story = d.news.state.stories[0];
  await s.action({
    action: 'generate',
    config: {
      categories: [story.category],
      durationMinutes: 5,
      count: 1,
      format: 'resumen',
      interaction: false,
      breaking: true,
    },
  });
  expect(d.news.state.program?.cues.some((c) => c.storyId === story.id)).toBe(true);
  expect(story.review).toBe('pending');
  expect(() => d.command({ type: 'news', action: 'approve' })).toThrow(/pendientes/);
});
it('la categoría Deportes sigue incluyendo fútbol sin duplicar piezas al seleccionar ambas', async () => {
  const d = new ReactionDirector();
  d.news.ingest([
    {
      id: 'football-source',
      sourceId: 'sports',
      sourceName: 'Medio deportivo',
      title: 'Noticia de fútbol',
      summary: 'Contenido recibido.',
      url: 'https://publisher.org/football',
      publishedAt: Date.now(),
      category: 'Fútbol',
      simulated: false,
    },
  ]);
  d.news.state.stories[0].review = 'approved';
  d.buildNewsProgram({
    categories: ['Deportes', 'Fútbol'],
    count: 5,
    durationMinutes: 5,
    format: 'resumen',
    interaction: false,
    breaking: true,
  });
  expect(d.news.state.program?.cues.filter((c) => c.storyId)).toHaveLength(1);
});
it('recupera una escaleta extensa con titulares largos sin perder el archivo completo', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'samuia-news-long-')),
    file = join(dir, 'state.json');
  try {
    const d = new ReactionDirector();
    d.news.ingest(
      Array.from({ length: 20 }, (_, i) => ({
        id: `source-${i}`,
        sourceId: `medium-${i}`,
        sourceName: `Medio ${i}`,
        url: `https://publisher.org/article-${i}`,
        publishedAt: Date.now(),
        category: 'España' as const,
        title: `Información ${String(i).repeat(220).slice(0, 220)}`,
        summary: 'Datos publicados para esta prueba.',
        simulated: false,
      })),
    );
    for (const s of d.news.state.stories) s.review = 'approved';
    d.buildNewsProgram({
      categories: ['España'],
      count: 20,
      durationMinutes: 15,
      format: 'titular',
      interaction: false,
      breaking: false,
    });
    expect(d.news.state.program?.cues[1].text.length).toBeGreaterThan(4000);
    const service = new NewsService(new NewsSourceManager(() => {}), () => d, {
      storageFile: file,
      env: {},
    });
    service.save();
    const next = new ReactionDirector();
    const restored = new NewsService(new NewsSourceManager(() => {}), () => next, {
      storageFile: file,
      env: {},
    });
    expect(restored.store.error).toBeNull();
    expect(next.news.state.program?.cues.length).toBe(d.news.state.program?.cues.length);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
it('un fallo de IA REAL conserva la escaleta anterior y comunica el error', async () => {
  const d = new ReactionDirector();
  d.command({ type: 'program-mode', mode: 'NOTICIAS' });
  for (const story of d.news.state.stories) story.review = 'approved';
  const config = {
    categories: ['España'],
    count: 1,
    durationMinutes: 5,
    format: 'resumen',
    interaction: false,
    breaking: false,
  } as const;
  const service = new NewsService(new NewsSourceManager(() => {}), () => d, {
    storageFile: null,
    env: {},
  });
  await service.action({ action: 'generate', config });
  const previous = d.news.state.program;
  previous!.cues[0].text = 'Edición editorial que debe conservarse.';
  await service.action({
    action: 'configure',
    config: { ...service.brain.config, mode: 'IA REAL' },
  });
  await expect(service.action({ action: 'generate', config })).rejects.toThrow(
    'No se pudo generar',
  );
  expect(d.news.state.program).toBe(previous);
  expect(d.news.state.program?.cues[0].text).toContain('debe conservarse');
});
