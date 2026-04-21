import type { SituationFocus } from "../types";

function focusBits(f: SituationFocus | undefined): string[] {
  if (!f) return [];
  const out: string[] = [];
  if (f.email) out.push(`email "${f.email.title}"`);
  if (f.calendar) out.push(`calendar "${f.calendar.title}"`);
  if (f.contact) out.push(`contact "${f.contact.title}"`);
  if (f.project) out.push(`project "${f.project.title}"`);
  return out;
}

/**
 * One-line event when the user's Focus changes (Focus Watcher, MVP).
 */
export function describeFocusChange(
  prev: SituationFocus | undefined,
  next: SituationFocus | undefined
): string | null {
  const a = focusBits(prev).sort().join("; ");
  const b = focusBits(next).sort().join("; ");
  if (a === b) return null;
  if (!b) return "Focus cleared.";
  if (!a) return `Focus set: ${b}.`;
  return `Focus changed to: ${b}.`;
}
