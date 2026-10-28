import { id, normalize } from '../../shared/src/index';
import {
  newsCategories,
  newsCategorySelected,
  type NewsStory,
  type NewsItem,
  type NewsCue,
  type NewsState,
  type NewsProgramConfig,
  type NewsSource,
} from '../../shared/src/news';
export const newsIsStale = (date: number, now: number) =>
  now - date > 24 * 3600000 || date > now + 300000;
export const estimateSpeech = (text: string) =>
  Math.max(1, Math.ceil(text.split(/\s+/).filter(Boolean).length / 2.5));
const key = (url: string) => {
  const u = new URL(url);
  u.hash = '';
  for (const k of [...u.searchParams.keys()])
    if (/^(utm_|fbclid|gclid)/i.test(k)) u.searchParams.delete(k);
  return u.toString();
};
const tokens = (text: string) =>
  new Set(
    normalize(text)
      .split(/\W+/)
      .filter((w) => w.length > 3),
  );
function related(a: string, b: string) {
  const x = tokens(a),
    y = tokens(b),
    intersection = [...x].filter((w) => y.has(w)).length;
  return intersection >= 3 && intersection / Math.max(1, new Set([...x, ...y]).size) >= 0.65;
}
/** Editorial state only. Delivery always belongs to the existing ReactionDirector. */
export class Newsroom {
  state: NewsState = {
    sources: [],
    stories: [],
    categories: [...newsCategories],
    program: null,
    current: null,
    breakingAlerts: [],
    externalAvailable: false,
    error: null,
  };
  private deliveredBreaking = new Set<string>();
  ingest(items: NewsItem[], now = Date.now()) {
    for (const item of items) {
      if (
        !item.title.trim() ||
        !Number.isFinite(item.publishedAt) ||
        item.publishedAt > now + 300000
      )
        continue;
      let url: string;
      try {
        const u = new URL(item.url);
        if (u.protocol !== 'https:' || u.username || u.password) continue;
        url = key(item.url);
      } catch {
        continue;
      }
      const incoming = { ...item, url };
      let story = this.state.stories.find(
        (s) =>
          s.simulated === item.simulated &&
          (s.sources.some((v) => v.url === url) ||
            (s.category === item.category &&
              (normalize(s.title) === normalize(item.title) || related(s.title, item.title)))),
      );
      const prior = story?.sources.find((v) => v.sourceId === item.sourceId && v.url === url);
      if (
        prior &&
        prior.title === item.title &&
        prior.summary === item.summary &&
        prior.publishedAt === item.publishedAt
      )
        continue;
      if (prior && item.publishedAt < prior.publishedAt) continue;
      if (!story) {
        story = {
          id: id(),
          title: item.title,
          summary: item.summary,
          category: item.category,
          location: item.location,
          publishedAt: item.publishedAt,
          updatedAt: now,
          revision: 0,
          sources: [],
          simulated: item.simulated,
          importance: 0,
          breaking: false,
          verification: 'pending',
          verificationNote: '',
          review: 'pending',
          stale: false,
        };
        this.state.stories.unshift(story);
      }
      story.sources = [
        ...story.sources.filter((s) => !(s.sourceId === item.sourceId && s.url === url)),
        incoming,
      ].slice(-20);
      story.revision++;
      story.updatedAt = now;
      if (item.publishedAt >= story.publishedAt)
        Object.assign(story, {
          title: item.title,
          summary: item.summary,
          publishedAt: item.publishedAt,
          location: item.location,
        });
      const publishers = new Set(story.sources.map((s) => new URL(s.url).hostname));
      story.verification = story.simulated
        ? 'demo'
        : publishers.size > 1
          ? 'corroborated'
          : 'single-source';
      story.verificationNote = '';
      story.review = 'pending';
      story.stale = newsIsStale(story.publishedAt, now);
      story.importance = story.stale
        ? 0
        : Math.min(
            100,
            30 +
              publishers.size * 10 +
              (/ultima hora|alerta|urgente|emergencia/i.test(normalize(story.title)) ? 40 : 0),
          );
      story.breaking = story.importance >= 80;
      const program = this.state.program;
      if (program && this.referencesStory(story.id)) {
        program.approved = false;
        if (program.status === 'running') program.status = 'paused';
        this.state.error = 'Hay actualizaciones: vuelve a preparar y aprobar la escaleta.';
      }
    }
    this.state.stories = this.state.stories.slice(0, 200);
  }
  story(id: string) {
    const story = this.state.stories.find((s) => s.id === id);
    if (!story) throw Error('Noticia no encontrada');
    return story;
  }
  demo(now: number, breaking = false) {
    const rows: [NewsItem['category'], string, string, string][] = breaking
      ? [
          [
            'Galicia',
            'DEMO · Última hora: ensayo de aviso en la plaza de prueba',
            'En esta ficción, la organización ha adelantado el inicio del ensayo. No existe una alerta real.',
            'plaza de prueba',
          ],
        ]
      : [
          [
            'España',
            'DEMO · Una ciudad ficticia prepara su feria de lectura',
            'El ayuntamiento ficticio anuncia una jornada de intercambio de libros. El lugar de demostración es Villa Ejemplo.',
            'Villa Ejemplo',
          ],
          [
            'Galicia',
            'DEMO · Un laboratorio ficticio abre sus puertas',
            'La iniciativa de demostración presenta un taller abierto de ciencia. La actividad ficticia se desarrolla en Galicia.',
            'Galicia',
          ],
          [
            'Internacional',
            'DEMO · Encuentro ficticio de cooperación científica',
            'Equipos de una ciudad imaginaria preparan un encuentro para compartir proyectos. No corresponde a un acontecimiento real.',
            'ciudad imaginaria',
          ],
          [
            'Deportes',
            'DEMO · Jornada deportiva de exhibición',
            'Los equipos ficticios preparan una jornada de exhibición. Todavía no hay resultados en esta demostración.',
            'recinto de prueba',
          ],
          [
            'Tecnología',
            'DEMO · Presentación de una herramienta ficticia',
            'El equipo de demostración presenta una herramienta para organizar tareas. No hay cifras de rendimiento verificadas.',
            'estudio de prueba',
          ],
          [
            'Inteligencia artificial',
            'DEMO · Taller ficticio de inteligencia artificial',
            'El taller de demostración explica cómo identificar contenidos simulados. Los asistentes y la convocatoria son ficticios.',
            'aula de prueba',
          ],
          [
            'Economía',
            'DEMO · Boletín económico de ejemplo',
            'Este contenido es ficticio. No incluye cotizaciones reales ni recomendaciones financieras.',
            'redacción de prueba',
          ],
          [
            'Criptomonedas',
            'DEMO · Sesión educativa ficticia sobre criptoactivos',
            'La demostración trata conceptos generales. No comunica precios, oportunidades de inversión ni operaciones reales.',
            'aula de prueba',
          ],
          [
            'Entretenimiento',
            'DEMO · Gala cultural imaginaria',
            'Una gala ficticia reúne propuestas culturales de demostración. No se han anunciado premios reales.',
            'teatro imaginario',
          ],
        ];
    this.ingest(
      rows.map(([category, title, summary, location], i) => ({
        id: id(),
        sourceId: 'demo',
        sourceName: 'Redacción ficticia · SIMULATION',
        url: `https://demo.invalid/${breaking ? 'breaking' : 'story'}/${breaking ? now : i}`,
        publishedAt: now,
        title,
        summary,
        location,
        category,
        simulated: true,
      })),
      now,
    );
  }
  build(
    config: NewsProgramConfig,
    generate: (story: NewsStory | null, section: string) => NewsCue,
    now: number,
    includePending = false,
  ) {
    const stories = this.state.stories
      .filter(
        (s) =>
          (s.review === 'approved' || (includePending && s.review === 'pending')) &&
          !newsIsStale(s.publishedAt, now) &&
          newsCategorySelected(config.categories, s.category),
      )
      .sort((a, b) => b.importance - a.importance || b.publishedAt - a.publishedAt)
      .slice(0, config.count);
    if (!stories.length)
      throw Error(
        includePending
          ? 'No hay noticias actuales de las categorías seleccionadas.'
          : 'Aprueba al menos una noticia actual de las categorías seleccionadas.',
      );
    const cues = [generate(null, 'INTRODUCCIÓN')];
    const headlines = generate(null, 'TITULARES');
    headlines.text = `Estos son nuestros titulares. ${stories.map((s) => s.title).join('. ')}.`;
    headlines.headline = 'Titulares del informativo';
    headlines.sourceIds = stories.flatMap((s) => s.sources.map((v) => v.id));
    headlines.storyVersions = stories.map((s) => ({ id: s.id, revision: s.revision }));
    headlines.estimatedSeconds = estimateSpeech(headlines.text);
    cues.push(headlines);
    const closing = generate(null, 'DESPEDIDA');
    const budget = config.durationMinutes * 60;
    for (const category of config.categories)
      for (const story of stories.filter(
        (s) =>
          newsCategorySelected([category], s.category) && !cues.some((c) => c.storyId === s.id),
      )) {
        const cue = generate(story, category);
        if (
          cues.reduce((n, c) => n + c.estimatedSeconds, 0) +
            cue.estimatedSeconds +
            closing.estimatedSeconds <=
          budget
        )
          cues.push(cue);
      }
    if (!cues.some((c) => c.storyId)) throw Error('El contenido no cabe en la duración elegida.');
    if (config.interaction) cues.push(generate(null, 'PREGUNTAS DEL CHAT'));
    cues.push(closing);
    this.state.program = {
      config: structuredClone(config),
      cues,
      approved: false,
      status: 'draft',
      index: 0,
      estimatedSeconds: cues.reduce((n, c) => n + c.estimatedSeconds, 0),
    };
    this.state.current = null;
    this.state.error = null;
  }
  referencesStory(id: string) {
    return !!this.state.program?.cues.some(
      (c) => c.storyId === id || c.storyVersions?.some((s) => s.id === id),
    );
  }
  private validateCue(cue: NewsCue, now: number) {
    const references = [
      ...(cue.storyVersions ?? []),
      ...(cue.storyId ? [{ id: cue.storyId, revision: cue.storyRevision }] : []),
    ];
    for (const ref of references) {
      const story = this.story(ref.id);
      if (
        story.review !== 'approved' ||
        newsIsStale(story.publishedAt, now) ||
        story.revision !== ref.revision
      )
        throw Error('La escaleta contiene noticias pendientes, antiguas o actualizadas.');
    }
  }
  approve(now: number) {
    const p = this.state.program;
    if (!p) throw Error('Prepara primero la escaleta.');
    for (const cue of p.cues) this.validateCue(cue, now);
    if (!p.cues.length || p.cues.some((c) => !c.text.trim()))
      throw Error('La escaleta contiene intervenciones vacías.');
    p.estimatedSeconds = p.cues.reduce((n, c) => n + c.estimatedSeconds, 0);
    if (p.estimatedSeconds > p.config.durationMinutes * 60)
      throw Error('La escaleta supera la duración solicitada.');
    p.approved = true;
  }
  next(now: number) {
    const p = this.state.program;
    if (!p || p.status !== 'running' || !p.approved) return null;
    const cue = p.cues[p.index];
    if (!cue) {
      p.status = 'completed';
      this.state.current = null;
      return null;
    }
    try {
      this.validateCue(cue, now);
    } catch {
      p.status = 'paused';
      p.approved = false;
      this.state.error = 'Revisa la actualidad y aprobación de las noticias.';
      return null;
    }
    this.state.current = cue;
    return cue;
  }
  finish(cue: NewsCue) {
    const p = this.state.program;
    if (p?.cues[p.index]?.id === cue.id) {
      p.index++;
      if (p.index >= p.cues.length) p.status = 'completed';
    }
    if (this.state.current?.id === cue.id) this.state.current = null;
  }
  breaking(id: string, generate: (s: NewsStory) => NewsCue, now: number) {
    const s = this.story(id),
      p = this.state.program;
    if (!p?.config.breaking) throw Error('Activa las alertas de última hora en el programa.');
    if (
      !s.breaking ||
      s.review !== 'approved' ||
      !['confirmed', 'demo'].includes(s.verification) ||
      newsIsStale(s.publishedAt, now)
    )
      throw Error(
        'La última hora requiere actualidad, revisión y confirmación explícitas (o una DEMO identificada).',
      );
    const key = `${id}:${s.revision}`;
    if (this.deliveredBreaking.has(key)) throw Error('Esta actualización ya se ha anunciado.');
    this.deliveredBreaking.add(key);
    const cue = generate(s);
    cue.scene = 'ultima-hora';
    this.state.current = cue;
    return cue;
  }
  setSources(sources: NewsSource[]) {
    this.state.sources = structuredClone(sources);
  }
  snapshot(now: number) {
    const result = structuredClone(this.state);
    for (const s of result.stories) s.stale = newsIsStale(s.publishedAt, now);
    result.breakingAlerts = result.stories
      .filter(
        (s) =>
          s.breaking &&
          !s.stale &&
          s.review !== 'discarded' &&
          !this.deliveredBreaking.has(`${s.id}:${s.revision}`),
      )
      .map((s) => s.id);
    return result;
  }
}

/** Transparent local classification; the source category remains the fallback. */
export function classifyNews(text: string, fallback: NewsItem['category']): NewsItem['category'] {
  const value = normalize(text);
  const rules: [NewsItem['category'], RegExp][] = [
    ['Inteligencia artificial', /inteligencia artificial|\bia\b|machine learning/],
    ['Criptomonedas', /cripto|bitcoin|ethereum|blockchain/],
    ['Fútbol', /futbol|balompie/],
    ['Otros deportes', /baloncesto|tenis|ciclismo|olimpic/],
    ['Deportes', /deportivo|partido|liga|campeonato/],
    ['Tecnología', /tecnolog|software|ciberseguridad|informatica/],
    ['Economía', /econom|inflacion|presupuesto|banco central|mercado financiero/],
    ['Entretenimiento', /cine|musica|festival|gala|teatro/],
    ['Galicia', /galicia|gallego|vigo|coruna|santiago de compostela|pontevedra|ourense|lugo/],
    ['Internacional', /internacional|naciones unidas|parlamento europeo/],
  ];
  return rules.find(([, pattern]) => pattern.test(value))?.[0] ?? fallback;
}
