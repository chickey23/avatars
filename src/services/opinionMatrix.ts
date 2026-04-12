/**
 * Opinion Matrix - Avatar-to-Avatar relations, updated by interactions.
 * Influences cascade participation: who reacts to whom, and how.
 */

import type { Avatar, ConversationMessage } from "../types";

const OPINION_KEY = "avatars_opinion_matrix";

export function loadOpinions(avatars: Avatar[]): Map<string, Record<string, string>> {
  try {
    const raw = localStorage.getItem(OPINION_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, Record<string, string>>;
    const map = new Map<string, Record<string, string>>();
    for (const avatar of avatars) {
      if (parsed[avatar.id]) map.set(avatar.id, parsed[avatar.id]);
    }
    return map;
  } catch {
    return new Map();
  }
}

export function persistOpinions(opinions: Map<string, Record<string, string>>): void {
  try {
    const obj: Record<string, Record<string, string>> = {};
    opinions.forEach((v, k) => { obj[k] = v; });
    localStorage.setItem(OPINION_KEY, JSON.stringify(obj));
  } catch {
    /* ignore */
  }
}

/**
 * Update opinions based on a conversation turn.
 * E.g. if Diogenes challenges Calliope's idea, Calliope's opinion of Diogenes may shift.
 */
export function updateOpinionsFromTurn(
  avatars: Avatar[],
  lastMessages: ConversationMessage[],
  opinionOverrides: Map<string, Record<string, string>>
): Map<string, Record<string, string>> {
  const result = new Map(opinionOverrides);
  for (const avatar of avatars) {
    const current = result.get(avatar.id) ?? { ...avatar.opinions };
    result.set(avatar.id, current);
  }

  const avatarMsgs = lastMessages.filter((m) => m.role === "avatar");
  if (avatarMsgs.length < 2) return result;

  const prev = avatarMsgs[avatarMsgs.length - 2];
  const last = avatarMsgs[avatarMsgs.length - 1];
  if (!prev.avatarId || !last.avatarId) return result;

  const prevAvatar = avatars.find((a) => a.id === prev.avatarId);
  const lastAvatar = avatars.find((a) => a.id === last.avatarId);
  if (!prevAvatar || !lastAvatar) return result;

  const lastContent = last.content.toLowerCase();

  const challenging = ["hold on", "what if we're wrong", "but", "however", "doubt", "assumption"].some(
    (w) => lastContent.includes(w)
  );
  const agreeing = ["yes", "agreed", "exactly", "i'm with you", "good point"].some(
    (w) => lastContent.includes(w)
  );

  const lastOpinions = result.get(last.avatarId) ?? {};
  if (challenging) {
    lastOpinions[prev.avatarId] = "challenge";
  } else if (agreeing) {
    lastOpinions[prev.avatarId] = "affinity";
  }
  result.set(last.avatarId, lastOpinions);

  return result;
}

/**
 * Should this avatar react to the previous responder? Opinion influences this.
 */
export function shouldReact(
  _candidateId: string,
  _lastResponderId: string,
  opinions: Record<string, string>
): boolean {
  const opinion = opinions[_lastResponderId];
  if (opinion === "doubt" || opinion === "challenge") return true;
  if (opinion === "affinity" || opinion === "trust") return true;
  return true; // default: can react
}
