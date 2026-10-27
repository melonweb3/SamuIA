import {
  normalDecision,
  normalize,
  scoreline,
  type AICommentatorProfile,
  type ChatMessage,
  type CommentaryDraft,
  type StudioCommand,
} from '../../shared/src/index';
import { relatedMatch } from '../../chat-engine/src/index';
import type { MatchManager } from '../../football-engine/src/index';
import { CommentaryEngine } from './commentary';
import { LiveMatchContextService } from './context';
import { legacyEmotion, type ReactionEvent } from '../../voice/src/contracts';
import { directiveForAnimation, type AvatarAnimation } from '../../shared/src/index';
import { stateAnimation } from '../../avatar-engine/src/contracts';
export { CommentaryEngine, LiveMatchContextService };
export class SamuIABrain {
  constructor(public commentary: CommentaryEngine) {}
  /** Compatibility controls generate content here, just like operator interventions. */
  control(
    action: Exclude<Extract<StudioCommand, { type: 'control' }>['action'], 'silence'>,
  ): CommentaryDraft {
    let decision = normalDecision();
    if (action === 'angry')
      decision = {
        ...decision,
        say: 'Nah, meu… hoy venís buscando pique. Pero aquí todo con cariño.',
        scene: 'enfado',
        emotion: 'enfadado_leve',
        camera: 'primer_plano',
        energy: 82,
      };
    else if (action === 'celebrate')
      decision = {
        ...decision,
        say: '¡Buena esa! ¡Vamos allá, meu!',
        scene: 'celebracion',
        emotion: 'risa',
        camera: 'primer_plano',
        gesture: 'celebracion',
        energy: 100,
      };
    else decision.say = 'Volvemos al lío, con calma.';
    return { decision, recallIds: [], sourceIds: [] };
  }
  operator(reaction: ReactionEvent): CommentaryDraft {
    const clips: Partial<Record<ReactionEvent['emotion'], AvatarAnimation>> = {
      celebrating: 'goal',
      happy: 'happy',
      excited: 'shock',
      surprised: 'shock',
      angry: 'angry',
      frustrated: 'frustrated',
      laughing: 'laugh',
      thinking: 'thinking',
      tense: 'penalty',
      sad: 'loss',
    };
    return {
      reaction,
      matchId: reaction.matchId,
      recallIds: [],
      sourceIds: [reaction.id],
      decision: {
        ...normalDecision(),
        say: reaction.text,
        emotion: legacyEmotion[reaction.emotion],
        energy: Math.round(reaction.intensity * 100),
        avatar: directiveForAnimation(
          reaction.animationOverride ??
            (reaction.avatarState
              ? stateAnimation[reaction.avatarState]
              : (clips[reaction.emotion] ?? 'talking')),
          reaction.intensity,
        ),
      },
    };
  }
  respond(
    message: ChatMessage,
    manager: MatchManager,
    profile: AICommentatorProfile,
  ): CommentaryDraft {
    const text = normalize(message.message),
      matches = manager.followed();
    const match =
      relatedMatch(message.message, matches) ??
      (message.detectedTopic === 'futbol'
        ? matches.find((m) => m.id === message.relatedMatchId)
        : undefined);
    const pollMatch = matches.find((m) => m.id === message.relatedMatchId);
    const isVote =
      /^(si|no)\b/.test(text) && pollMatch && this.commentary.context.community(pollMatch.id);
    let say = '';
    if (/insulta|humilla|idiota|imbecil|mierda|racista|odio/.test(text))
      say =
        'Aquí el pique es futbolero, no personal. Nos podemos calentar con el partido sin atacar a nadie.';
    else if (isVote && pollMatch) return this.commentary.analyze(pollMatch, profile, 'community');
    else if (/interesante|loco|cambiamos|pasando algo/.test(text)) {
      const best = manager.radar()[0];
      say = best
        ? `${scoreline(best)} está arriba del radar, con ${best.excitementScore}/100 de interés simulado. Ahí tenemos el foco.`
        : 'Ahora mismo no hay partidos en seguimiento.';
    } else if (/hubo gol|donde.*gol|van todos|ganando/.test(text) && !/otro gol/.test(text)) {
      const list = matches.filter((m) =>
        /hubo|donde/.test(text)
          ? m.events.some((e) => e.type === 'goal')
          : /ganando/.test(text)
            ? m.score.home !== m.score.away
            : true,
      );
      say = list.length
        ? list.map(scoreline).join('. ')
        : 'Todavía no hay resultados que encajen con eso en los partidos seguidos.';
    } else if (/igualado/.test(text)) {
      const m = [...matches].sort(
        (a, b) =>
          Math.abs(a.probabilities.home - a.probabilities.away) -
          Math.abs(b.probabilities.home - b.probabilities.away),
      )[0];
      say = m
        ? `El más equilibrado de la simulación es ${scoreline(m)}. El empate tiene un ${m.probabilities.draw}% estimado.`
        : 'No hay partidos activos para comparar.';
    } else if (/otro gol|predic|mojate|pinta de gol/.test(text)) {
      const target = match ?? manager.radar()[0];
      if (target) return this.commentary.analyze(target, profile, 'prediction');
      say = 'Necesito un partido activo y ocasiones registradas antes de mojarme.';
    } else if (match) {
      if (/encuesta|pregunta a/.test(text))
        return this.commentary.analyze(match, profile, 'question');
      if (/comunidad|vot|hemos dicho|opina el chat/.test(text))
        return this.commentary.analyze(match, profile, 'community');
      return this.commentary.analyze(match, profile);
    } else if (message.detectedTopic === 'gaming')
      say =
        'Buena esa. Hoy el mando lo compartimos con el marcador. Dime a qué juego le estás dando; de novedades sin datos no te voy a inventar nada.';
    else if (message.detectedTopic === 'tecnologia')
      say =
        'La tecnología tiene mucha miga. Podemos charlar, pero aquí no estoy consultando Internet ni una IA externa.';
    else if (/hola|que tal|buenas/.test(text))
      say = '¡Qué tal! Ponte cómodo, que aquí vemos el fútbol entre todos. ¿Qué partido seguimos?';
    else
      say =
        'Esa no te la quiero inventar. Puedo comentar los partidos que tenemos en pantalla, comparar el radar y seguir vuestras respuestas a las encuestas.';
    return {
      decision: {
        ...normalDecision(),
        say,
        scene: message.detectedTopic,
        emotion: 'sonrisa',
        camera: 'plano_medio',
        gesture: 'asentir',
        energy: 60,
      },
      recallIds: [],
      sourceIds: [message.id],
    };
  }
}
