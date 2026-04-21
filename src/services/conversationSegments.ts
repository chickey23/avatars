/**
 * Topic segments — marks where a conversation "chapter" ended (SPEC: archive segment / dismiss topic, MVP).
 * Distinct from Clear chat; does not delete the visible thread.
 */

import type { SituationFocus } from "../types";

export const TOPIC_SEGMENTS_KEY = "avatars_topic_segments";

export interface TopicSegmentRecord {
  id: string;
  ts: number;
  /** Segment covers turns after this user message (exclusive of that message's topic). */
  afterUserMessageId: string;
  projectId?: string;
  /** Optional user-facing note */
  note?: string;
}

export function loadTopicSegments(): TopicSegmentRecord[] {
  try {
    const raw = localStorage.getItem(TOPIC_SEGMENTS_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    return p as TopicSegmentRecord[];
  } catch {
    return [];
  }
}

export function appendTopicSegment(record: TopicSegmentRecord): void {
  try {
    const arr = loadTopicSegments();
    arr.push(record);
    while (arr.length > 500) arr.shift();
    localStorage.setItem(TOPIC_SEGMENTS_KEY, JSON.stringify(arr));
  } catch {
    /* quota */
  }
}

export function buildTopicSegmentRecord(
  afterUserMessageId: string,
  focus?: SituationFocus,
  note?: string
): TopicSegmentRecord {
  return {
    id: crypto.randomUUID(),
    ts: Date.now(),
    afterUserMessageId,
    projectId: focus?.project?.id,
    note: note?.trim() || undefined,
  };
}
