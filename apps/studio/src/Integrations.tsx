import { Panel, Badge } from './ui';
export function Integrations() {
  return (
    <>
      <div className="info-banner">
        <b>Proveedores independientes, configuración en el servidor.</b>
        <p>
          SIMULATION funciona sin claves. LIVE admite HTTP JSON y API-Football con configuración
          privada en el servidor. Multiplataforma permite configurar chats y salidas independientes;
          OBS conserva su adaptador de prueba.
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
          ['Twitch', 'TwitchChatProvider', 'Lectura mediante IRC oficial con normalización y reconexión.'],
          ['YouTube', 'YouTubeChatProvider', 'Lectura del chat mediante la API oficial y OAuth del servidor.'],
          ['Kick', 'KickChatProvider', 'Recepción de webhooks oficiales con verificación de firma.'],
          ['TikTok', 'TikTokChatProvider', 'Disponible mediante un relay autorizado; restringido sin permisos.'],
          [
            'Retransmisión',
            'BroadcastOutputManager',
            'Composiciones propias 16:9 y 9:16, codificación FFmpeg y salidas RTMP/RTMPS independientes.',
          ],
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
                {name === 'OBS Studio' ? 'MOCK' : name === 'OpenAI' ? 'LOCAL' : 'ADAPTER'}
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
