import { Panel, Badge } from './ui';
export function Integrations() {
  return (
    <>
      <div className="info-banner">
        <b>Un estudio local. Cero credenciales.</b>
        <p>Todos los adaptadores son mocks. No se emite ni se conecta con plataformas externas.</p>
      </div>
      <div className="integration-grid">
        {[
          [
            'OpenAI',
            'BrainProvider',
            'Decisiones locales con CommentaryEngine y memoria verificable.',
          ],
          [
            'Datos deportivos',
            'SportsDataProvider',
            'Encuentros y eventos simulados; futuro proveedor autorizado.',
          ],
          [
            'OBS Studio',
            'OBSController',
            'Escenas, fuentes, cámara virtual, overlays, iluminación y avatar.',
          ],
          ['Twitch', 'ChatProvider', 'Buzón mock de comentarios y envío.'],
          ['YouTube', 'ChatProvider', 'Adaptador intercambiable sin conexión.'],
          ['TikTok', 'ChatProvider', 'Adaptador intercambiable sin conexión.'],
          [
            'Avatar 2D/3D',
            'AvatarRendererAdapter',
            'AvatarAnimationController conectado al motor; renderer sustituible. Imágenes como fallback y señales verificables en SIMULATION.',
          ],
          [
            'Voz de SamuIA',
            'VoiceProvider',
            'Temporizador de reproducción; sin audio ni clonación.',
          ],
        ].map(([name, contract, text]) => (
          <Panel key={name} title={name} meta={<Badge>MOCK</Badge>}>
            <div className="integration-body">
              <span>⌘</span>
              <code>{contract}</code>
              <p>{text}</p>
            </div>
          </Panel>
        ))}
      </div>
    </>
  );
}
