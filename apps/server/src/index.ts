import { createStudioServer } from './server';
const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT inválido');
const app = createStudioServer();
app.server.listen(port, process.env.HOST ?? '127.0.0.1', () =>
  console.log(`SamuIA DEMO local · puerto ${port}`),
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.stop());
