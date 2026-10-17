import {
  normalDecision,
  scoreline,
  normalize,
  type AICommentatorProfile,
  type MatchState,
  type MatchEvent,
  type CommentaryDraft,
  type Side,
} from '../../shared/src/index';
import { LiveMatchContextService } from './context';
export class CommentaryEngine {
  constructor(public context: LiveMatchContextService) {}
  private choose(match: MatchState, variants: string[]) {
    const count = this.context.get(match.id).publishedCount;
    return variants[count % variants.length];
  }
  profileFor(match: MatchState, profile: AICommentatorProfile) {
    let result = profile;
    for (const rule of profile.specialRules)
      if (
        rule.scope === 'league'
          ? rule.key === match.leagueId
          : [match.home.name, match.away.name].includes(rule.key)
      )
        result = { ...result, emotionLevel: rule.emotionLevel, rivalryLevel: rule.rivalryLevel };
    return result;
  }
  private style(
    draft: CommentaryDraft,
    match: MatchState,
    profile: AICommentatorProfile,
    allowHumor = true,
  ): CommentaryDraft {
    const p = this.profileFor(match, profile),
      c = this.context.get(match.id);
    const n = c.publishedCount;
    if (allowHumor && p.humorLevel > 0 && (n * 37 + 13) % 100 < p.humorLevel * 0.35) {
      const jokes = [
        'El sofá hoy cuenta como deporte de riesgo.',
        'Aquí el mando de la tele no va a tener descanso.',
        'La calculadora ya está calentando en la banda.',
      ];
      const joke = jokes.find(
        (j) => !c.personalityMemory.runningJokes.slice(-3).some((e) => e.content === j),
      );
      if (joke) {
        draft.decision.say += ` ${joke}`;
        draft.joke = joke;
      }
    }
    if ((n * 31 + 29) % 100 < p.galicianLevel * 0.35) draft.decision.say += ' Vamos allá, meu.';
    const expression = p.catchphrases.find((e) => !c.lastExpressions.includes(e));
    if (allowHumor && expression && (n * 41 + 17) % 100 < 20) {
      draft.decision.say = `${expression}. ${draft.decision.say}`;
      draft.expression = expression;
    }
    if ((n * 29 + 53) % 100 < p.emojiFrequency)
      draft.decision.say += c.intensity >= 4 ? ' 🔥' : ' 👀';
    const prohibited = p.prohibitedExpressions.filter(Boolean);
    if (prohibited.some((e) => normalize(draft.decision.say).includes(normalize(e)))) {
      draft.decision.say = 'Seguimos el partido con calma y con respeto.';
      delete draft.prediction;
      delete draft.question;
      delete draft.opinion;
      delete draft.joke;
      delete draft.expression;
      draft.recallIds = [];
    }
    return draft;
  }
  analyze(
    match: MatchState,
    profile: AICommentatorProfile,
    kind: 'analysis' | 'prediction' | 'question' | 'community' = 'analysis',
  ): CommentaryDraft {
    profile = this.profileFor(match, profile);
    const c = this.context.get(match.id);
    const leader = this.context.leader(match);
    const previous = this.context.latestOpinion(match.id);
    let say = '';
    const draft: CommentaryDraft = {
      decision: {
        ...normalDecision(),
        say: '',
        emotion: 'pensativo',
        camera: 'plano_medio',
        gesture: 'mano_barbilla',
        energy: 35 + c.intensity * 10,
      },
      matchId: match.id,
      sourceIds: match.events.slice(-6).map((e) => e.id),
      recallIds: [],
    };
    if (kind === 'community') {
      const poll = this.context.community(match.id);
      if (!poll || !poll.total)
        say =
          'Todavía no tengo respuestas a una pregunta publicada. No os voy a poner palabras en la boca.';
      else if (poll.total < 3)
        say = `Os estoy leyendo: ${poll.total} ${poll.total === 1 ? 'persona ha contestado' : 'personas han contestado'} a «${poll.question.content}». Aún son pocas para sacar porcentajes.`;
      else {
        const pct = Math.round((poll.yes / poll.total) * 100);
        say = `Sobre «${poll.question.content}», el ${pct}% ha dicho sí: ${poll.yes} de ${poll.total} participantes distintos. ${pct >= 40 && pct <= 60 ? 'Hay división aquí.' : 'Mensaje bastante claro.'}`;
        draft.sourceIds = poll.responses.map((r) => r.messageId);
      }
    } else if (kind === 'question') {
      say =
        match.score.home === match.score.away
          ? 'Encuesta rápida: ¿firmáis el empate? Responded sí o no.'
          : 'Encuesta rápida: ¿veis otro gol? Responded sí o no.';
      draft.question = say;
    } else if (kind === 'prediction') {
      const pending = this.context.pending(match.id);
      const recent = match.events.filter(
        (e) => e.type === 'chance' && match.minute - e.minute <= 10,
      );
      if (pending) {
        say = `Sigue pendiente lo que comenté: «${pending.content}». Vamos a ver qué pasa antes del minuto ${pending.expiresMinute}.`;
        draft.recallIds = [pending.id];
      } else if (match.status !== 'live' || match.minute >= 90 || recent.length < 2)
        say =
          'No me voy a tirar a la piscina sin ocasiones suficientes. Necesito al menos dos ocasiones simuladas en los últimos diez minutos y tiempo por delante.';
      else {
        const side: Side | null = leader;
        say = `Con ${recent.length} ocasiones recientes en la simulación, ${side ? `veo más cerca el próximo gol de ${match[side].shortName}` : 'esto tiene pinta de dejarnos otro gol'}. Me mojo para los próximos ${Math.min(15, 95 - match.minute)} minutos, pero puedo equivocarme. Es una estimación simulada, no una certeza.`;
        draft.prediction = { side, confidence: 0.55 };
        draft.sourceIds = recent.map((e) => e.id);
      }
    } else {
      say = `${scoreline(match)}. `;
      if (leader) {
        say += `${match[leader].shortName} está generando más ocasiones: ${match.statistics[leader].xG.toFixed(2)} xG simulado.`;
        if (previous?.team && previous.team !== leader) {
          say = `Vale, cambio de opinión: antes destacaba al ${match[previous.team].shortName}, pero ahora ${match[leader].shortName} lleva más xG simulado. ${scoreline(match)}.`;
          draft.recallIds = [previous.id];
        }
        const community = profile.communityTeams[match.id];
        if (community && community !== leader)
          say += ` Tenemos configurada afinidad con ${match[community].shortName}, pero hay que reconocer lo que está generando el rival.`;
      } else
        say +=
          match.minute < 10
            ? 'Primeros minutos tranquilos por ahora. No hay diferencia clara en las ocasiones registradas.'
            : 'En ocasiones registradas están bastante parejos. Aquí todavía hay partido.';
      if (profile.responseLength === 'long')
        say += ` Tiros ${match.statistics.home.shots}-${match.statistics.away.shots}; posesión ${match.statistics.home.possession}-${match.statistics.away.possession}.`;
      draft.opinion = {
        metric: 'xG',
        team: leader,
        homeXG: match.statistics.home.xG,
        awayXG: match.statistics.away.xG,
      };
    }
    if (kind === 'analysis') {
      const resolved = [
        ...c.personalityMemory.failedPredictions,
        ...c.personalityMemory.successfulPredictions,
      ].find((p) => !p.acknowledged);
      if (resolved) {
        say +=
          resolved.status === 'success'
            ? ' Os lo dije: aquella posibilidad que publiqué se ha cumplido. Seguía siendo una estimación.'
            : ' Mi predicción anterior envejeció regular. Ha vencido el plazo o ha ocurrido algo distinto; me equivoqué.';
        draft.recallIds.push(resolved.id);
      }
      if (profile.responseLength === 'short' && !resolved)
        say = say
          .split(/(?<=[.!?])\s/)
          .slice(0, 2)
          .join(' ');
    }
    draft.decision.energy = Math.round(25 + (c.intensity * profile.emotionLevel) / 5);
    draft.decision.say = say;
    return this.style(draft, match, profile, kind === 'analysis');
  }
  event(
    match: MatchState,
    event: MatchEvent,
    profile: AICommentatorProfile,
    groupedCount = 1,
  ): CommentaryDraft {
    const c = this.context.get(match.id),
      p = this.profileFor(match, profile);
    const name = match[event.side].shortName;
    const draft: CommentaryDraft = {
      decision: {
        ...normalDecision(),
        emotion: 'pensativo',
        camera: 'plano_medio',
        gesture: 'señalar',
        energy: Math.min(100, Math.round(25 + (c.intensity * p.emotionLevel) / 5)),
      },
      matchId: match.id,
      recallIds: [],
      sourceIds: [event.id],
    };
    const mem = c.personalityMemory;
    const success = mem.successfulPredictions.find(
      (p) => !p.acknowledged && p.resolvedBy === event.id,
    );
    const failed = mem.failedPredictions.find((p) => !p.acknowledged && p.resolvedBy === event.id);
    let say = '';
    if (groupedCount > 1)
      say = `Se está calentando el ${match.home.shortName} - ${match.away.shortName}: ${groupedCount} avisos menores seguidos. Cabeza fría.`;
    else
      switch (event.type) {
        case 'goal':
          say =
            c.intensity === 5
              ? `¡NO PUEDE SER! ¡GOL DE ${name.toUpperCase()} EN EL ${match.minute}! ${scoreline(match)}.`
              : name === 'Celta'
                ? 'GOOOOOL! Iepaaa meu!'
                : this.choose(match, [
                    `¡GOOOOL de ${name}! ${scoreline(match)}.`,
                    `¡Dentro! Marca ${name}. ${scoreline(match)}.`,
                    `¡La ha metido ${name}! ${scoreline(match)}.`,
                  ]);
          draft.decision = {
            say: '',
            scene: 'celebracion',
            emotion: 'sorpresa',
            camera: 'primer_plano',
            gesture: 'celebracion',
            energy: 100,
          };
          break;
        case 'chance':
          say = this.choose(match, [
            `Ufff, esa era buenísima para ${name}. Otra ocasión apuntada.`,
            `¡Cuidado con ${name}! Está llegando al área.`,
            `¡Uy, ${name}! Esa ocasión suma y el partido se anima.`,
          ]);
          draft.decision.emotion = 'sorpresa';
          break;
        case 'red':
          say = `¡Roja para ${name}! Ahora cambia mucho el panorama. Toca recalcular, sin dar nada por hecho.`;
          draft.decision.camera = 'primer_plano';
          draft.decision.emotion = 'sorpresa';
          break;
        case 'penalty':
          say = `¡Penalti para ${name}! Ojo con esto. ${p.humorLevel >= 50 ? 'Ahora mismo hay tensión hasta en el sofá.' : 'Momento importante para el partido.'}`;
          draft.decision.camera = 'primer_plano';
          draft.decision.emotion = 'sorpresa';
          break;
        case 'var':
          say =
            'El VAR está revisando la acción. Esperamos la decisión: no voy a darla por resuelta antes de tiempo.';
          break;
        case 'yellow':
          say = `Amarilla para ${name}. Hay que bajar una marcha y seguir jugando.`;
          break;
        case 'substitution':
          say = `Cambio en ${name}. Vamos a ver qué aporta; todavía no tenemos datos para juzgar al jugador.`;
          break;
        case 'halftime':
          say = `Descanso: ${scoreline(match)}. Cogemos aire. ¿Qué os está pareciendo?`;
          break;
        case 'fulltime':
          say = `¡Final! ${scoreline(match)}. Se acabó lo que se daba. Gracias por vivirlo juntos.`;
          break;
      }
    if (success) {
      say += ` Os lo dije: había dejado publicada esa posibilidad y ha llegado el gol. Era una estimación, no una garantía.`;
      draft.recallIds.push(success.id);
    }
    if (failed) {
      say += ` Bueno, esa predicción envejeció regular. Me había mojado y no ha salido; toca reconocerlo.`;
      draft.recallIds.push(failed.id);
    }
    if (event.type === 'goal' && p.rivalryLevel >= 60) {
      say += ` Los de ${match[event.side === 'home' ? 'away' : 'home'].shortName} van a mirar el reloj un poquito más ahora.`;
    }
    if (
      ['var', 'penalty'].includes(event.type) &&
      (c.publishedCount * 37 + 7) % 100 < p.communityInteractionLevel
    ) {
      const question = '¿Veis otro gol? Responded sí o no.';
      say += ` ${question}`;
      draft.question = question;
    }
    draft.decision.say = say;
    return this.style(draft, match, p, event.type !== 'goal');
  }
}
