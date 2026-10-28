import type { StudioSnapshot } from '../../../packages/shared/src/index';
export function NewsGraphics({ state }: { state: StudioSnapshot }) {
  const cue = state.news.current,
    story = state.news.stories.find((s) => s.id === cue?.storyId);
  const titles = state.news.stories
    .filter(
      (s) => s.review === 'approved' && !s.stale && state.news.categories.includes(s.category),
    )
    .map((s) => s.title);
  return (
    <div
      className="news-frame"
      data-presentation={cue?.scene ?? 'estudio'}
      aria-label="Escena de noticias"
    >
      <div className="news-masthead">
        <b>SAMUIA NEWS {cue?.scene === 'ultima-hora' ? '· ÚLTIMA HORA' : ''}</b>
        <time>{new Date(state.now).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}</time>
      </div>
      <strong data-testid="news-headline">{cue?.headline ?? 'Estudio de noticias'}</strong>
      <p>
        {story?.simulated
          ? 'DEMO · NOTICIA FICTICIA'
          : story
            ? story.verification === 'confirmed'
              ? 'Confirmación editorial registrada'
              : 'Información pendiente de verificación independiente'
            : 'Presentación del informativo'}
      </p>
      {cue?.scene === 'imagenes' && (
        <div className="news-image-placeholder">
          Espacio para imágenes autorizadas · sin material remoto cargado
        </div>
      )}
      {story && (
        <small>
          Fuentes: {[...new Set(story.sources.map((s) => s.sourceName))].join(' · ')} · Publicación:{' '}
          {new Date(story.publishedAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}
        </small>
      )}
      <div className="news-ticker" aria-label="Ticker de titulares">
        <span>{titles.join('   •   ') || 'SamuIA News · esperando contenidos aprobados'}</span>
      </div>
    </div>
  );
}
