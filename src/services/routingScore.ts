/**
 * Shared routing score for user messages (switchboard + preflight Ollama skip).
 */

import type { Avatar } from "../types";
import { loadTasks, type LongTermTask } from "./longTermTasks";
import {
  getAddressTier,
  addressTierBonus,
} from "./routingDirectAddress";
import { getRoutingBiasFromRosterScore, getRosterScore } from "./avatarRoster";

const MIN_TASK_TITLE_MATCH_LEN = 4;
const TASK_MATCH_BONUS = 5;
const MAX_TASK_MATCH_SCORE_PER_AVATAR = 18;
export const MAX_TAG_INTEREST_SCORE = 40;
/** Combined tag/interest + task match ceiling (40 + 18). */
const MAX_COMBINED_MATCH_SCORE = 58;

function sumTagInterestScoreUncapped(avatar: Avatar, contentLower: string): number {
  let n = 0;
  for (const t of avatar.tags) {
    if (contentLower.includes(t.toLowerCase())) n += 6;
  }
  for (const i of avatar.interests) {
    if (contentLower.includes(i.toLowerCase())) n += 5;
  }
  return n;
}

/** Tag/interest overlap score vs user message (aligned with proactive affinity weights). */
export function scoreAvatarForUserMessageContent(
  avatar: Avatar,
  contentLower: string
): number {
  return Math.min(MAX_TAG_INTEREST_SCORE, sumTagInterestScoreUncapped(avatar, contentLower));
}

export function buildActiveTasksByAvatar(
  tasks: LongTermTask[]
): Map<string, LongTermTask[]> {
  const map = new Map<string, LongTermTask[]>();
  for (const task of tasks) {
    if (task.status !== "active") continue;
    const arr = map.get(task.avatarId) ?? [];
    arr.push(task);
    map.set(task.avatarId, arr);
  }
  return map;
}

/**
 * Bounded bonus when user text overlaps active long-term task title/description.
 */
export function scoreTaskMatchForAvatar(
  avatarId: string,
  contentLower: string,
  tasksByAvatar: Map<string, LongTermTask[]>
): number {
  const tasks = tasksByAvatar.get(avatarId) ?? [];
  let total = 0;
  for (const task of tasks) {
    if (total >= MAX_TASK_MATCH_SCORE_PER_AVATAR) break;
    const title = task.title.trim();
    let matched = false;
    if (title.length >= MIN_TASK_TITLE_MATCH_LEN) {
      matched = contentLower.includes(title.toLowerCase());
    }
    if (!matched && task.description?.trim()) {
      const blob = task.description.trim().toLowerCase();
      if (blob.length >= 12 && contentLower.includes(blob)) {
        matched = true;
      } else {
        for (const word of blob.split(/[^a-z0-9]+/)) {
          if (word.length >= 5 && contentLower.includes(word)) {
            matched = true;
            break;
          }
        }
      }
    }
    if (matched) {
      total += TASK_MATCH_BONUS;
    }
  }
  return Math.min(MAX_TASK_MATCH_SCORE_PER_AVATAR, total);
}

function combinedMatchScoreForAvatar(
  avatar: Avatar,
  contentLower: string,
  tasksByAvatar: Map<string, LongTermTask[]>
): number {
  const ti = Math.min(MAX_TAG_INTEREST_SCORE, sumTagInterestScoreUncapped(avatar, contentLower));
  const taskPart = scoreTaskMatchForAvatar(avatar.id, contentLower, tasksByAvatar);
  return Math.min(MAX_COMBINED_MATCH_SCORE, ti + taskPart);
}

/**
 * Same score used to order avatars in `pickRespondersForUserMessage` (tag/task + address tier + popularity).
 */
export function getRoutingScoreForAvatar(
  avatar: Avatar,
  userMessageContent: string,
  tasksOverride?: LongTermTask[],
  rosterScores?: Record<string, number>
): number {
  const contentLower = userMessageContent.toLowerCase();
  const tasks = tasksOverride ?? loadTasks();
  const tasksByAvatar = buildActiveTasksByAvatar(tasks);
  const base = combinedMatchScoreForAvatar(avatar, contentLower, tasksByAvatar);
  const tier = getAddressTier(avatar, contentLower);
  const rosterBias = getRoutingBiasFromRosterScore(
    getRosterScore(rosterScores, avatar.id)
  );
  return base + addressTierBonus(tier) + rosterBias;
}
