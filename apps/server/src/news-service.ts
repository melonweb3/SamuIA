import { resolve } from 'node:path';
import { z } from 'zod';
import type { ReactionDirector } from '../../../packages/core/src/index';
import { estimateSpeech } from '../../../packages/news/src/index';
import { newsCommandSchema } from '../../../packages/news/src/schema';
import type { NewsProgram, NewsState } from '../../../packages/shared/src/news';
import { newsCategories, newsScenes, programModes } from '../../../packages/shared/src/news';
import { NewsSourceManager, newsSourceSchema } from './news-sources';
import { NewsBrainProvider, brainConfigSchema, type GenerateText } from './news-brain';
import { NewsStorage } from './news-storage';
const item = z.object({
  id: z.string(),
  sourceId: z.string(),
  sourceName: z.string().max(100),
  url: z.string().url(),
  publishedAt: z.number().finite(),
  title: z.string().max(250),
  summary: z.string().max(800),
  category: z.enum(newsCategories),
  location: z.string().optional(),
  simulated: z.boolean(),
});
const story = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  category: z.enum(newsCategories),
  location: z.string().optional(),
  publishedAt: z.number(),
  updatedAt: z.number(),
  revision: z.number().int(),
  sources: z.array(item).max(20),
  simulated: z.boolean(),
  importance: z.number(),
  breaking: z.boolean(),
  verification: z.enum(['pending', 'single-source', 'corroborated', 'confirmed', 'demo']),
  verificationNote: z.string(),
  review: z.enum(['pending', 'approved', 'discarded']),
  stale: z.boolean(),
});
const cue = z.object({
  id: z.string(),
  section: z.string(),
  storyId: z.string().optional(),
  storyRevision: z.number().optional(),
  storyVersions: z.array(z.object({ id: z.string(), revision: z.number() })).optional(),
  text: z.string().max(12000),
  headline: z.string(),
  scene: z.enum(newsScenes),
  sourceIds: z.array(z.string()),
  estimatedSeconds: z.number(),
});
// Program config is parsed through the existing command schema below as well.
const program = z.object({
  config: z.custom<NewsProgram['config']>(
    (v) => newsCommandSchema.safeParse({ type: 'news', action: 'build', config: v }).success,
  ),
  cues: z.array(cue).max(100),
  approved: z.boolean(),
  status: z.enum(['draft', 'running', 'paused', 'stopped', 'completed']),
  index: z.number().int().nonnegative(),
  estimatedSeconds: z.number(),
});
const savedProgram = z.object({ id: z.string(), at: z.number(), program });
const schedule = z
  .object({
    id: z.string().min(1).max(100),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((v) => {
        const d = new Date(v + 'T00:00:00Z');
        return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
      }),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    timezone: z.literal('Europe/Madrid'),
    type: z.enum(programModes),
    durationMinutes: z.number().int().min(1).max(240),
    categories: z.array(z.enum(newsCategories)),
    status: z.enum(['draft', 'cancelled']),
    output: z
      .object({
        platforms: z.array(z.enum(['twitch', 'youtube', 'kick', 'tiktok'])).max(4),
        simulation: z.literal(true),
      })
      .strict(),
  })
  .strict();
const transmission = z.object({
  at: z.number(),
  status: z.enum(['running', 'paused', 'stopped', 'completed']),
  duration: z.number(),
  categories: z.array(z.enum(newsCategories)),
});
const persistent = z.object({
  broadcasts: z.array(transmission).max(100).default([]),
  sources: z
    .array(
      newsSourceSchema.extend({
        id: z.string(),
        lastFetchedAt: z.number().optional(),
        error: z.string().optional(),
      }),
    )
    .max(30),
  stories: z.array(story).max(200),
  categories: z.array(z.enum(newsCategories)),
  program: program.nullable(),
  config: brainConfigSchema,
  usage: z.object({
    day: z.string(),
    calls: z.number().nonnegative(),
    tokens: z.number().nonnegative(),
  }),
  settings: z.record(z.unknown()),
  profile: z.record(z.unknown()),
  archive: z.array(savedProgram).max(30),
  schedules: z.array(schedule).max(100),
  events: z.array(z.object({ at: z.number(), code: z.string().max(100) })).max(100),
  updates: z
    .array(
      z.object({ at: z.number(), sourceId: z.string(), received: z.number(), ok: z.boolean() }),
    )
    .max(100),
  refreshSeconds: z.number().int().min(60).max(3600),
});
export class NewsService {
  readonly brain: NewsBrainProvider;
  readonly store: NewsStorage;
  archive: z.infer<typeof savedProgram>[] = [];
  schedules: z.infer<typeof schedule>[] = [];
  events: { at: number; code: string }[] = [];
  broadcasts: z.infer<typeof transmission>[] = [];
  private lastProgramStatus: string | undefined;
  generating = false;
  constructor(
    private sources: NewsSourceManager,
    private director: () => ReactionDirector,
    options: { storageFile?: string | null; generate?: GenerateText; env?: NodeJS.ProcessEnv } = {},
  ) {
    const env = options.env ?? process.env;
    this.brain = new NewsBrainProvider(env, options.generate);
    this.store = new NewsStorage(
      options.storageFile === undefined
        ? env.NODE_ENV === 'test'
          ? null
          : resolve(env.NEWS_STORAGE_FILE || '.local/news/state.json')
        : options.storageFile,
    );
    this.brain.onUsage = () => this.save();
    const data = this.store.load();
    if (data) {
      const parsed = persistent.safeParse(data);
      if (!parsed.success)
        this.store.error =
          'Formato de almacenamiento inválido; se conserva el archivo sin sobrescribir.';
      else {
        const d = parsed.data,
          owner = director();
        sources.sources.push(...d.sources);
        sources.refreshSeconds = d.refreshSeconds;
        sources.history = d.updates;
        owner.news.state.stories = d.stories;
        owner.news.state.categories = d.categories;
        owner.news.state.program = d.program;
        if (d.program) {
          d.program.status = 'draft';
          d.program.approved = false;
          d.program.index = 0;
        }
        // Restore only existing preference keys with matching primitive types.
        for (const [key, value] of Object.entries(d.settings))
          if (
            key in owner.settings &&
            typeof value === typeof owner.settings[key as keyof typeof owner.settings]
          )
            Object.assign(owner.settings, { [key]: value });
        for (const [key, value] of Object.entries(d.profile))
          if (
            key in owner.profile &&
            typeof value === typeof owner.profile[key as keyof typeof owner.profile]
          )
            Object.assign(owner.profile, { [key]: value });
        this.brain.configure(d.config);
        this.brain.usage = d.usage;
        this.archive = d.archive;
        this.schedules = d.schedules;
        this.events = d.events;
        this.broadcasts = d.broadcasts;
        this.log('storage-restored-review-required');
      }
    }
  }
  log(code: string) {
    this.events.unshift({ at: Date.now(), code });
    this.events = this.events.slice(0, 100);
  }
  snapshot() {
    return {
      ...this.brain.snapshot(),
      archive: this.archive.map((p) => ({
        id: p.id,
        at: p.at,
        duration: p.program.estimatedSeconds,
      })),
      broadcasts: this.broadcasts,
      schedules: this.schedules,
      events: this.events,
      updates: this.sources.history,
      refreshSeconds: this.sources.refreshSeconds,
      storageError: this.store.error,
      generating: this.generating,
    };
  }
  save() {
    const d = this.director();
    const p = d.news.state.program;
    if (p?.status !== this.lastProgramStatus) {
      this.lastProgramStatus = p?.status;
      if (p && p.status !== 'draft') {
        this.broadcasts.unshift({
          at: Date.now(),
          status: p.status,
          duration: p.estimatedSeconds,
          categories: [...p.config.categories],
        });
        this.broadcasts = this.broadcasts.slice(0, 100);
        this.log(`program-${p.status}`);
      }
    }
    this.store.save({
      sources: this.sources.sources,
      stories: d.news.state.stories,
      categories: d.news.state.categories,
      program: d.news.state.program,
      config: this.brain.config,
      usage: this.brain.usage,
      settings: d.settings,
      profile: d.profile,
      archive: this.archive,
      broadcasts: this.broadcasts,
      schedules: this.schedules,
      events: this.events,
      updates: this.sources.history,
      refreshSeconds: this.sources.refreshSeconds,
    });
  }
  async action(raw: unknown) {
    const cmd = z
      .discriminatedUnion('action', [
        z.object({ action: z.literal('configure'), config: brainConfigSchema }).strict(),
        z
          .object({ action: z.literal('interval'), seconds: z.number().int().min(60).max(3600) })
          .strict(),
        z.object({ action: z.literal('generate'), config: z.unknown() }).strict(),
        z.object({ action: z.literal('save') }).strict(),
        z.object({ action: z.literal('load'), id: z.string() }).strict(),
        z.object({ action: z.literal('schedule'), schedule }).strict(),
      ])
      .parse(raw);
    if (this.generating) throw Error('Espera a que termine la generación.');
    const owner = this.director();
    if (cmd.action === 'configure') this.brain.configure(cmd.config);
    if (cmd.action === 'interval') this.sources.refreshSeconds = cmd.seconds;
    if (cmd.action === 'schedule') {
      this.schedules = [
        cmd.schedule,
        ...this.schedules.filter((s) => s.id !== cmd.schedule.id),
      ].slice(0, 100);
    }
    if (cmd.action === 'save') {
      const p = owner.news.state.program;
      if (!p) throw Error('No hay escaleta que guardar.');
      this.archive.unshift({
        id: crypto.randomUUID(),
        at: Date.now(),
        program: structuredClone(p),
      });
      this.archive = this.archive.slice(0, 30);
    }
    if (cmd.action === 'load') {
      const saved = this.archive.find((p) => p.id === cmd.id);
      if (!saved) throw Error('Programa no encontrado.');
      owner.command({ type: 'news', action: 'stop' });
      owner.news.state.program = structuredClone(saved.program);
      Object.assign(owner.news.state.program, { status: 'draft', approved: false, index: 0 });
    }
    if (cmd.action === 'generate') {
      const command = newsCommandSchema.parse({
        type: 'news',
        action: 'build',
        config: cmd.config,
      });
      if (command.action !== 'build') throw Error('Configuración inválida');
      if (owner.news.state.program?.status === 'running' || owner.news.state.current)
        throw Error('Detén el programa antes de generar.');
      const previousProgram = owner.news.state.program;
      this.generating = true;
      try {
        if (this.brain.config.mode !== 'SIMULACIÓN')
          await this.sources.refresh(Date.now(), command.config.categories);
        owner.buildNewsProgram(command.config, Date.now(), true);
        const p = owner.news.state.program!;
        const draft = structuredClone(p);
        for (const c of draft.cues) {
          const ids = c.storyId ? [c.storyId] : (c.storyVersions?.map((v) => v.id) ?? []);
          const stories = ids.map((id) => owner.news.story(id));
          c.text = await this.brain.text(
            `Guion de ${c.section}. Formato ${command.config.format}. Máximo ${command.config.format === 'titular' ? 25 : command.config.format === 'resumen' ? 60 : 140} palabras. Tono ${owner.profile.name}; transición coherente con las secciones anteriores, sin añadir hechos.`,
            stories,
            c.text,
            draft.cues.slice(0, draft.cues.indexOf(c)).map((v) => v.section),
          );
          c.estimatedSeconds = estimateSpeech(c.text);
        }
        if (
          this.director() !== owner ||
          owner.news.state.program !== p ||
          p.status !== 'draft' ||
          draft.cues.some(
            (c) =>
              (c.storyVersions ?? []).some((v) => owner.news.story(v.id).revision !== v.revision) ||
              (c.storyId && owner.news.story(c.storyId).revision !== c.storyRevision),
          )
        )
          throw Error('El contexto cambió durante la generación; vuelve a generar.');
        draft.estimatedSeconds = draft.cues.reduce((n, c) => n + c.estimatedSeconds, 0);
        draft.approved = false;
        owner.news.state.program = draft;
        this.log('program-generated-review-required');
      } catch (error) {
        owner.news.state.program = previousProgram;
        this.log('program-generation-failed');
        throw error;
      } finally {
        this.generating = false;
        this.save();
      }
    }
    this.log(`news-${cmd.action}`);
    this.save();
  }
  /** Shared current-story context, without storing spectator text or personal identifiers. */
  async answer(question: string, story: NewsState['stories'][number] | undefined, local: string) {
    if (!story || story.review !== 'approved') return local;
    const owner = this.director();
    try {
      return await this.brain.text(
        `Pregunta sobre la noticia actual: ${question.slice(0, 500)}`,
        [story],
        local,
        owner.news.state.program?.cues
          .slice(0, owner.news.state.program.index)
          .map((c) => c.section),
      );
    } catch {
      return `La IA no está disponible. Respuesta del generador local: ${local}`;
    } finally {
      this.save();
    }
  }
}
