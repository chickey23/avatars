/**
 * Text blobs for semantic routing (Ollama embeddings) per avatar.
 */

import type { Avatar } from "../types";
import type { LongTermTask } from "./longTermTasks";
import { PERSONALITY_TRAITS } from "../theme/designTokens";

const MAX_ROUTING_TEXT_LEN = 2000;

export function buildAvatarRoutingText(
  avatar: Avatar,
  tasksByAvatar: Map<string, LongTermTask[]>
): string {
  const parts: string[] = [];
  parts.push(avatar.givenName, avatar.appellation);
  parts.push(avatar.description, avatar.personality);
  if (avatar.tags.length > 0) {
    parts.push(`Tags: ${avatar.tags.join(", ")}`);
  }
  if (avatar.interests.length > 0) {
    parts.push(`Interests: ${avatar.interests.join(", ")}`);
  }
  if (avatar.traitIds && avatar.traitIds.length > 0) {
    const labels = avatar.traitIds.map(
      (tid) => PERSONALITY_TRAITS.find((t) => t.id === tid)?.label ?? tid
    );
    parts.push(`Traits: ${labels.join(", ")}`);
  }
  const tasks = tasksByAvatar.get(avatar.id) ?? [];
  for (const t of tasks) {
    parts.push(
      `Task: ${t.title}${t.description?.trim() ? ` — ${t.description.trim()}` : ""}`
    );
  }
  const s = parts.filter((p) => p && p.trim().length > 0).join("\n\n");
  if (s.length <= MAX_ROUTING_TEXT_LEN) return s;
  return s.slice(0, MAX_ROUTING_TEXT_LEN);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
