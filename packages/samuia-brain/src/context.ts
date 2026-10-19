import {
  id,
  normalize,
  type LiveMatchContext,
  type MatchState,
  type MatchEvent,
  type ChatMessage,
  type CommentaryDraft,
  type MemoryEntry,
  type PersonalityMemory,
  type Prediction,
  type Side,
} from '../../shared/src/index';
export function emptyMemory(): PersonalityMemory {
  return {
    previousOpinions: [],
    predictions: [],
    successfulPredictions: [],
    failedPredictions: [],
    playersPraised: [],
    playersCriticized: [],
    communityQuestions: [],
    communityResponses: [],
    runningJokes: [],
    memorableMoments: [],
  };
}
export function intensity(match: MatchState, event?: MatchEvent): LiveMatchContext['intensity'] {
  if (
    event?.type === 'goal' &&
    match.minute >= 85 &&
    Math.abs(match.score.home - match.score.away) <= 1
  )
    return 5;
  if (event && ['goal', 'penalty', 'red', 'chance', 'missed_chance'].includes(event.type)) return 4;
  if (match.status === 'finished' && Math.abs(match.score.home - match.score.away) <= 1) return 5;
  const base = match.excitementScore >= 75 ? 3 : match.excitementScore >= 40 ? 2 : 1;
  return Math.min(3, base + (match.contextType === 'regular' ? 0 : 1)) as 1 | 2 | 3;
}
/** The source of truth for actual published commentary and observed local match events. */
export class LiveMatchContextService {
  contexts = new Map<string, LiveMatchContext>();
  get(matchId: string) {
    let c = this.contexts.get(matchId);
    if (!c) {
      c = {
        matchId,
        intensity: 1,
        personalityMemory: emptyMemory(),
        lastExpressions: [],
        publishedCount: 0,
        lastCommentAt: 0,
      };
      this.contexts.set(matchId, c);
    }
    return c;
  }
  remove(matchId: string) {
    this.contexts.delete(matchId);
  }
  refresh(match: MatchState, now = Date.now()) {
    const recent = match.events.at(-1);
    const c = this.get(match.id);
    c.intensity = intensity(match, recent && now - recent.timestamp < 20000 ? recent : undefined);
    for (const p of c.personalityMemory.predictions)
      if (
        p.status === 'pending' &&
        (match.status === 'finished' || match.minute >= p.expiresMinute)
      )
        this.resolve(c, p, 'failed', `clock:${match.minute}`);
  }
  private resolve(
    c: LiveMatchContext,
    p: Prediction,
    status: 'success' | 'failed',
    sourceId: string,
  ) {
    p.status = status;
    p.resolvedBy = sourceId;
    const list =
      status === 'success'
        ? c.personalityMemory.successfulPredictions
        : c.personalityMemory.failedPredictions;
    list.push(p);
    if (list.length > 100) list.shift();
  }
  observe(match: MatchState, event: MatchEvent) {
    const c = this.get(match.id);
    c.intensity = intensity(match, event);
    for (const p of c.personalityMemory.predictions) {
      if (p.status !== 'pending' || event.timestamp < p.timestamp || event.minute < p.minute)
        continue;
      if (event.type === 'goal' && event.minute <= p.expiresMinute)
        this.resolve(
          c,
          p,
          p.side === null || p.side === event.side ? 'success' : 'failed',
          event.id,
        );
      else if (event.type === 'fulltime') this.resolve(c, p, 'failed', event.id);
    }
    c.personalityMemory.memorableMoments.push({
      id: event.id,
      timestamp: event.timestamp,
      minute: event.minute,
      content: `${event.type}: ${match[event.side].shortName} (${match.score.home}-${match.score.away})`,
      relatedPlayer: event.relatedPlayer ?? null,
      relatedTeam: match[event.side].name,
      sourceIds: [event.id],
    });
    c.personalityMemory.memorableMoments = c.personalityMemory.memorableMoments.slice(-200);
    if (event.type === 'fulltime')
      for (const q of c.personalityMemory.communityQuestions) q.closed = true;
  }
  receiveCommunity(match: MatchState, message: ChatMessage) {
    if (message.status === 'muted') return;
    const mem = this.get(match.id).personalityMemory;
    const q = [...mem.communityQuestions]
      .reverse()
      .find(
        (q) =>
          !q.closed &&
          q.timestamp <= message.timestamp &&
          message.timestamp - q.timestamp <= 600000,
      );
    if (!q) return;
    const text = normalize(message.message)
      .replace(/[¿?¡!.,]/g, ' ')
      .trim();
    const yes = /^(si|yo si|claro|lo firmo|firmo|de acuerdo)\b/.test(text);
    const no = /^(no|yo no|ni de broma)\b/.test(text);
    if (!yes && !no) return;
    mem.communityResponses.push({
      id: id(),
      timestamp: message.timestamp,
      minute: match.minute,
      content: message.message,
      relatedPlayer: null,
      relatedTeam: null,
      sourceIds: [message.id, q.id],
      questionId: q.id,
      username: message.username,
      vote: yes ? 'yes' : 'no',
      messageId: message.id,
    });
    mem.communityResponses = mem.communityResponses.slice(-300);
  }
  community(matchId: string) {
    const mem = this.get(matchId).personalityMemory;
    const q = mem.communityQuestions.at(-1);
    if (!q) return null;
    const latest = new Map<string, (typeof mem.communityResponses)[number]>();
    for (const response of mem.communityResponses)
      if (response.questionId === q.id) latest.set(normalize(response.username), response);
    const responses = [...latest.values()];
    return {
      question: q,
      total: responses.length,
      yes: responses.filter((r) => r.vote === 'yes').length,
      responses,
    };
  }
  publish(match: MatchState, draft: CommentaryDraft, now = Date.now()): string[] {
    const c = this.get(match.id),
      mem = c.personalityMemory;
    const known = [...mem.previousOpinions, ...mem.predictions];
    if (draft.recallIds.some((ref) => !known.some((e) => e.id === ref)))
      throw new Error('Recuerdo no verificable');
    const recalls = mem.predictions.filter((p) => draft.recallIds.includes(p.id));
    if (
      /os (?:lo )?dije|ya avise|os avise/i.test(normalize(draft.decision.say)) &&
      !recalls.some((p) => p.status === 'success')
    )
      throw new Error('No existe una predicción acertada que respalde el recuerdo');
    const entry = (
      content: string,
      relatedTeam: string | null = null,
      confidence?: number,
    ): MemoryEntry => ({
      id: id(),
      timestamp: now,
      minute: match.minute,
      content,
      relatedPlayer: null,
      relatedTeam,
      confidence,
      sourceIds: [...draft.sourceIds],
    });
    const ids: string[] = [];
    if (draft.opinion) {
      const e = {
        ...entry(draft.decision.say, draft.opinion.team ? match[draft.opinion.team].name : null),
        ...draft.opinion,
      };
      mem.previousOpinions.push(e);
      mem.previousOpinions = mem.previousOpinions.slice(-150);
      ids.push(e.id);
    }
    if (draft.prediction) {
      if (!mem.predictions.some((p) => p.status === 'pending')) {
        const prediction: Prediction = {
          ...entry(
            draft.decision.say,
            draft.prediction.side ? match[draft.prediction.side].name : null,
            draft.prediction.confidence,
          ),
          target: 'next_goal',
          side: draft.prediction.side,
          baseline: { ...match.score },
          expiresMinute: Math.min(95, match.minute + 15),
          status: 'pending',
          acknowledged: false,
        };
        mem.predictions.push(prediction);
        mem.predictions = mem.predictions.slice(-100);
        ids.push(prediction.id);
      }
    }
    if (draft.question) {
      for (const q of mem.communityQuestions) q.closed = true;
      const e = { ...entry(draft.question), kind: 'yes-no' as const, closed: false };
      mem.communityQuestions.push(e);
      mem.communityQuestions = mem.communityQuestions.slice(-50);
      ids.push(e.id);
    }
    if (draft.joke) {
      const e = entry(draft.joke);
      mem.runningJokes.push(e);
      mem.runningJokes = mem.runningJokes.slice(-30);
      ids.push(e.id);
    }
    for (const p of recalls) if (p.status !== 'pending') p.acknowledged = true;
    if (draft.expression) {
      c.lastExpressions.push(draft.expression);
      c.lastExpressions = c.lastExpressions.slice(-8);
    }
    c.publishedCount++;
    c.lastCommentAt = now;
    return ids;
  }
  latestOpinion(matchId: string) {
    return this.get(matchId).personalityMemory.previousOpinions.at(-1);
  }
  pending(matchId: string) {
    return this.get(matchId).personalityMemory.predictions.find((p) => p.status === 'pending');
  }
  leader(match: MatchState): Side | null {
    if (
      match.liveData &&
      (!match.liveData.availableStatistics.home.includes('xG') ||
        !match.liveData.availableStatistics.away.includes('xG'))
    )
      return null;
    const d = match.statistics.home.xG - match.statistics.away.xG;
    return Math.abs(d) < 0.2 ? null : d > 0 ? 'home' : 'away';
  }
}
