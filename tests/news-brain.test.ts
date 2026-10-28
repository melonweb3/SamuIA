import { it, expect, vi } from 'vitest';
import { NewsBrainProvider, type GenerateText } from '../apps/server/src/news-brain';
import { Newsroom } from '../packages/news/src/index';
const room = new Newsroom();
room.demo(Date.now());
const story = room.state.stories[0];
const answer = () => ({
  text: JSON.stringify({
    text: 'La fuente describe una demostración ficticia, sin datos de disponibilidad.',
    sourceIds: [story.sources[0].id],
  }),
  tokens: 120,
});
it('usa el adaptador solo en modo real, con fuentes estructuradas, cache y credenciales privadas', async () => {
  const generate = vi.fn<GenerateText>(async () => answer());
  const brain = new NewsBrainProvider({ OPENAI_API_KEY: 'server-secret' }, generate);
  expect(await brain.text('guion', [story], 'local')).toBe('local');
  expect(generate).not.toHaveBeenCalled();
  brain.configure({ ...brain.config, mode: 'IA REAL' });
  const result = await brain.text('guion', [story], 'local');
  expect(result).toContain('Demostración ficticia');
  expect(result).toContain(story.sources[0].sourceName);
  expect(JSON.parse(generate.mock.calls[0]?.[0]?.input ?? '{}')).toBeDefined();
  await brain.text('guion', [story], 'local');
  expect(generate).toHaveBeenCalledOnce();
  expect(brain.usage.tokens).toBe(120);
  expect(JSON.stringify(brain.snapshot())).not.toContain('server-secret');
});
it('fallback conserva el texto local y modo real comunica un fallo sin revelar la clave', async () => {
  const generate = vi.fn(async () => {
    throw Error('Authorization: server-secret');
  });
  const brain = new NewsBrainProvider({ OPENAI_API_KEY: 'server-secret' }, generate);
  brain.configure({ ...brain.config, mode: 'AUTOMÁTICO CON FALLBACK' });
  expect(await brain.text('guion', [story], 'guion seguro')).toBe('guion seguro');
  expect(brain.status).toContain('generador local');
  brain.configure({ ...brain.config, mode: 'IA REAL' });
  await expect(brain.text('guion', [story], 'local')).rejects.toThrow('No se pudo generar');
  expect(JSON.stringify(brain.snapshot())).not.toContain('server-secret');
});
it('rechaza fuentes inventadas y limita llamadas y tokens incluso ante errores', async () => {
  const generate = vi.fn(async () => ({
    text: JSON.stringify({ text: 'Dato', sourceIds: ['inventada'] }),
    tokens: 100,
  }));
  const brain = new NewsBrainProvider({ OPENAI_API_KEY: 'secret' }, generate);
  brain.configure({ ...brain.config, mode: 'AUTOMÁTICO CON FALLBACK', dailyCallLimit: 1 });
  expect(await brain.text('uno', [story], 'local')).toBe('local');
  expect(await brain.text('dos', [story], 'local')).toBe('local');
  expect(generate).toHaveBeenCalledOnce();
  expect(brain.usage.calls).toBe(1);
  brain.configure({ ...brain.config, dailyCallLimit: 10, dailyTokenLimit: 1000 });
  expect(await brain.text('tres', [story], 'local')).toBe('local');
  expect(generate).toHaveBeenCalledOnce();
});
it('sin credencial no llama al proveedor y conserva simulación y fallback', async () => {
  const generate = vi.fn<GenerateText>(async () => answer());
  const brain = new NewsBrainProvider({}, generate);
  brain.configure({ ...brain.config, mode: 'AUTOMÁTICO CON FALLBACK' });
  expect(await brain.text('noticia', [story], 'local')).toBe('local');
  expect(generate).not.toHaveBeenCalled();
});
it('el adaptador asíncrono de chat mantiene una sola intervención y comparte el texto con la voz', async () => {
  const { ReactionDirector } = await import('../packages/core/src/index');
  const now = Date.now(),
    d = new ReactionDirector(now);
  d.command({ type: 'program-mode', mode: 'NOTICIAS' }, now);
  for (const s of d.news.state.stories) s.review = 'approved';
  d.command(
    {
      type: 'news',
      action: 'build',
      config: {
        categories: ['España'],
        durationMinutes: 5,
        count: 1,
        format: 'resumen',
        interaction: false,
        breaking: true,
      },
    },
    now,
  );
  d.command({ type: 'news', action: 'approve' }, now);
  d.command({ type: 'news', action: 'start' }, now);
  let t = now;
  for (let i = 0; i < 2; i++) {
    d.command({ type: 'news', action: 'finish' }, t + 1);
    t += 5000;
    d.tick(t);
  }
  let complete: (value: string) => void = () => {};
  const responder = vi.fn(
    () =>
      new Promise<string>((resolve) => {
        complete = resolve;
      }),
  );
  d.brain.newsResponder = responder;
  d.command({ type: 'chat', username: 'Ana', message: '¿Cuándo estará disponible?' }, t + 1);
  d.command({ type: 'respond', id: d.chat.messages.at(-1)!.id }, t + 2);
  d.command({ type: 'news', action: 'finish' }, t + 3);
  t += 5000;
  d.tick(t);
  d.tick(t + 201);
  d.tick(t + 501);
  expect(responder).toHaveBeenCalledOnce();
  complete('La fuente no concreta la disponibilidad.');
  await Promise.resolve();
  await Promise.resolve();
  expect(d.decision.say).toBe('La fuente no concreta la disponibilidad.');
  expect(d.snapshot(Date.now()).voice.text).toBe('La fuente no concreta la disponibilidad.');
});
it('el SDK oficial utiliza Responses API sin almacenamiento remoto y con autenticación solo del servidor', async () => {
  let body: Record<string, unknown> = {};
  const transport = vi.fn<typeof fetch>(async (url, init) => {
    expect(String(url)).toBe('https://api.openai.com/v1/responses');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer secret-for-sdk');
    body = JSON.parse(String(init?.body));
    return Response.json({
      id: 'resp_test',
      object: 'response',
      created_at: 1,
      model: 'gpt-4.1-mini',
      status: 'completed',
      output: [
        {
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: answer().text, annotations: [] }],
        },
      ],
      usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
    });
  });
  const brain = new NewsBrainProvider({ OPENAI_API_KEY: 'secret-for-sdk' }, undefined, transport);
  brain.configure({ ...brain.config, mode: 'IA REAL' });
  expect(await brain.text('guion', [story], 'local')).toContain('demostración ficticia');
  expect(transport).toHaveBeenCalledOnce();
  expect(body.store).toBe(false);
  expect(body.model).toBe('gpt-4.1-mini');
  expect(JSON.stringify(body)).not.toContain('secret-for-sdk');
});
