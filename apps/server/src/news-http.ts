import { createRequire } from 'node:module';
// Undici is CommonJS: load it from server dependencies instead of embedding dynamic requires in ESM.
const { EnvHttpProxyAgent, fetch: proxyFetch } = createRequire(import.meta.url)(
  'undici',
) as typeof import('undici');
/** Keep the deployment's proxy, NO_PROXY and inherited CA trust; never disable TLS verification. */
export function createNewsFetch(env: NodeJS.ProcessEnv = process.env): typeof fetch {
  if (!env.HTTPS_PROXY && !env.HTTP_PROXY && !env.https_proxy && !env.http_proxy) return fetch;
  const dispatcher = new EnvHttpProxyAgent({
    httpProxy: env.HTTP_PROXY ?? env.http_proxy,
    httpsProxy: env.HTTPS_PROXY ?? env.https_proxy,
    noProxy: env.NO_PROXY ?? env.no_proxy,
  });
  return ((input, init) =>
    proxyFetch(
      input as Parameters<typeof proxyFetch>[0],
      { ...init, dispatcher } as Parameters<typeof proxyFetch>[1],
    )) as typeof fetch;
}
export const newsFetch = createNewsFetch();
