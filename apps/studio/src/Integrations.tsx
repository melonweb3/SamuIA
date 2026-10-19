import { Panel, Badge } from './ui';
export function Integrations() {
  return (
    <>
      <div className="info-banner">
        <b>Proveedores independientes, configuración en el servidor.</b>
        <p>
          SIMULATION funciona sin claves. LIVE admite HTTP JSON y API-Football con configuración
          privada en el servidor. Las integraciones sociales y OBS siguen como mocks.
        </p>
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
            'MatchDataProvider / LiveCommentaryProvider',
            'Datos normalizados, narración opcional, reconexión y fallback con eventos.',
          ],
          [
            'OBS Studio',
            'OBSController',
            'Escenas, fuentes, cámara virtual, overlays, iluminación y avatar.',
          ],
          [
            'Comunidad propia',
            'CommunityCommentProvider',
            'Mensajes de la app con partido, ID y timestamp; cola y memoria existentes.',
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
            'Controlador TTS independiente; simulación y voz local opcional en Partido de prueba.',
          ],
        ].map(([name, contract, text]) => (
          <Panel
            key={name}
            title={name}
            meta={
              <Badge>
                {['Datos deportivos', 'Comunidad propia', 'Voz de SamuIA'].includes(name)
                  ? 'ADAPTER'
                  : 'MOCK'}
              </Badge>
            }
          >
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
