import type { StudioSnapshot } from '../../../packages/shared/src/index';
import { avatarAssets, sceneAssets } from '../../../packages/core/src/visual';
const frames = {
  primer_plano: 'translateY(70px) scale(1.45)',
  plano_medio: 'translateY(20px) scale(1.07)',
  streamer: 'translateY(10px) scale(.94)',
  tres_cuartos: 'translate(30px,20px) scale(1.02) rotate(-4deg)',
};
export function Avatar({ state }: { state: StudioSnapshot }) {
  const portable = document.documentElement.dataset.portable === 'true';
  const surprise = state.avatar.emotion === 'sorpresa',
    angry = state.avatar.emotion === 'enfadado_leve';
  const avatar =
    state.profile.avatar === 'placeholder'
      ? avatarAssets[state.avatar.emotion]
      : state.profile.avatar;
  return (
    <div className={`avatar-stage scene-${state.decision.scene}`}>
      {!portable && (
        <img
          key={state.decision.scene}
          className="scene-image"
          alt=""
          src={`/samuia/scenes/${sceneAssets[state.decision.scene]}`}
          onError={(e) => {
            e.currentTarget.hidden = true;
          }}
        />
      )}
      <div className="grid-bg" />
      <div className="orbit" />
      <div className="stage-top">
        <span className="stage-tag">● PREVIEW LOCAL</span>
        <span className="stage-tag">{prettyFrame(state.camera)}</span>
      </div>
      <div className="monitor monitor-left">
        <b>
          SAMU<span>IA</span>
        </b>
        <p>▁ ▃ ▅ ▂ ▆ ▄ ▂</p>
      </div>
      <div className="monitor monitor-right">
        <small>ON AIR</small>
        <b>
          LOCAL
          <br />
          STUDIO
        </b>
      </div>
      <div
        className={`avatar-frame gesture-${state.avatar.gesture}`}
        style={{ transform: frames[state.camera] }}
      >
        <svg
          className="placeholder"
          viewBox="0 0 420 460"
          role="img"
          aria-label={`Avatar provisional de ${state.profile.name}: ${state.avatar.emotion}`}
        >
          <defs>
            <linearGradient id="hood" x1="0" y1="0" x2="1" y2="1">
              <stop stopColor="#3b4c59" />
              <stop offset="1" stopColor="#14212d" />
            </linearGradient>
            <linearGradient id="skin" x1="0" x2="1" y1="0" y2="1">
              <stop stopColor="#f4c7a2" />
              <stop offset="1" stopColor="#c88666" />
            </linearGradient>
          </defs>
          <path
            d="M76 460V320Q72 270 139 263L160 236H262L285 263Q349 270 348 330V460"
            fill="#0b1820"
            stroke="#62e2cf"
            strokeOpacity=".2"
            strokeWidth="3"
          />
          <path
            d="M93 460V331Q90 288 147 274L166 253H253L275 274Q331 287 331 331V460"
            fill="url(#hood)"
          />
          <path d="M168 235V276Q211 309 253 276V235" fill="#c58d70" />
          <path
            d="M146 277L176 301L210 332L244 301L275 277L259 321L210 349L158 320Z"
            fill="#25333f"
            stroke="#52616c"
            strokeWidth="2"
          />
          <path d="M182 313V372M239 313V372" stroke="#9caaa9" strokeWidth="3" />
          <ellipse cx="141" cy="183" rx="16" ry="24" fill="#d29a7a" />
          <ellipse cx="280" cy="183" rx="16" ry="24" fill="#d29a7a" />
          <path
            d="M143 135Q142 78 210 79Q280 78 278 142L274 211Q264 260 210 267Q156 257 147 212Z"
            fill="url(#skin)"
          />
          <path
            d="M145 153L139 131Q133 81 170 69Q228 45 269 84Q290 108 276 155L265 127Q228 137 179 119L154 139L153 162Z"
            fill="#302a2b"
          />
          <path
            d="M138 126Q132 70 183 58Q241 43 279 81L286 114Q214 88 146 129Z"
            fill="#263b44"
            stroke="#607c80"
            strokeWidth="2"
          />
          <path
            d="M160 76Q212 48 263 80"
            fill="none"
            stroke="#69e5ce"
            strokeOpacity=".5"
            strokeWidth="3"
          />
          <path d="M271 84L314 102Q322 113 304 120L277 116" fill="#263b44" />
          <path
            d={
              angry
                ? 'M167 163L190 171M231 171L253 163'
                : 'M165 160Q179 153 192 160M231 160Q246 153 256 160'
            }
            fill="none"
            stroke="#52382f"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <ellipse cx="180" cy="180" rx="6" ry={surprise ? 10 : 7} fill="#313335" />
          <ellipse cx="244" cy="180" rx="6" ry={surprise ? 10 : 7} fill="#313335" />
          <path d="M211 179L205 204L217 206" fill="none" stroke="#b87960" strokeWidth="3" />
          {surprise ? (
            <ellipse cx="211" cy="228" rx="11" ry="15" fill="#593d36" />
          ) : (
            <path
              d={
                angry
                  ? 'M191 229Q210 218 231 227'
                  : state.avatar.speaking
                    ? 'M187 219Q211 249 237 219Q211 229 187 219'
                    : 'M187 221Q211 240 237 220'
              }
              fill={state.avatar.speaking ? '#593d36' : 'none'}
              stroke="#8b5548"
              strokeWidth="3"
              strokeLinecap="round"
            />
          )}
          <path
            d="M170 226Q176 251 210 255Q243 251 251 226"
            fill="none"
            stroke="#5e453b"
            strokeWidth="5"
            strokeOpacity=".3"
          />
          <rect x="180" y="390" width="61" height="27" rx="7" fill="#12242c" />
          <text x="210" y="409" fill="#78dacb" fontSize="12" textAnchor="middle">
            SAMU IA
          </text>
        </svg>
        {!portable && (
          <img
            key={avatar}
            className="avatar-image"
            src={`/samuia/avatar/${avatar}`}
            alt={state.profile.name}
            onLoad={(e) => e.currentTarget.parentElement?.classList.add('has-image')}
            onError={(e) => {
              e.currentTarget.hidden = true;
              e.currentTarget.parentElement?.classList.remove('has-image');
            }}
          />
        )}
      </div>
      <div className="desk" />
      <div className="mic" />
      <div className="stage-bottom">
        <span>
          ▂ ▄ ▆ ▄ ▂ {state.avatar.speaking ? 'Reproducción simulada' : 'Listo para la siguiente'}
        </span>
        <small>AVATAR PLACEHOLDER</small>
      </div>
    </div>
  );
}
const prettyFrame = (s: string) => s.replaceAll('_', ' ');
