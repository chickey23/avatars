import type { ToolWorkshopAddendumItem, ToolWorkshopProposal } from "./types";
import { loadToolWorkshopDoc, saveToolWorkshopDoc } from "./persist";

function clampBody(body: string, maxChars: number): string {
  const t = body.trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, Math.max(0, maxChars - 1))}…`;
}

/**
 * Approve a proposal: append items as active addenda, enforcing caps.
 * Returns message for UI if items were truncated or skipped at cap.
 */
export function approveToolWorkshopProposal(
  proposal: ToolWorkshopProposal
): { ok: true; warnings: string[] } | { ok: false; error: string } {
  if (!proposal.items.length) {
    return { ok: false, error: "Proposal has no items to approve." };
  }
  const doc = loadToolWorkshopDoc();
  const maxItems = Math.max(1, doc.settings.maxActiveAddenda);
  const maxChars = Math.max(80, doc.settings.maxAddendumItemChars);
  const warnings: string[] = [];

  const active = doc.activeAddenda.filter((a) => a.active);
  let slots = maxItems - active.length;
  if (slots <= 0) {
    return {
      ok: false,
      error: `At max active addenda (${maxItems}). Deactivate or remove items first.`,
    };
  }

  const now = Date.now();
  for (const it of proposal.items) {
    if (slots <= 0) {
      warnings.push("Some proposal items were skipped (max addenda reached).");
      break;
    }
    const body = clampBody(it.bodyMarkdown, maxChars);
    if (body.length < it.bodyMarkdown.trim().length) {
      warnings.push(`Item truncated to ${maxChars} characters.`);
    }
    const item: ToolWorkshopAddendumItem = {
      id: crypto.randomUUID(),
      category: it.category,
      body,
      approvedAt: now,
      active: true,
    };
    doc.activeAddenda.push(item);
    slots--;
  }

  doc.pendingProposals = doc.pendingProposals.filter((p) => p.id !== proposal.id);
  saveToolWorkshopDoc(doc);
  return { ok: true, warnings };
}

export function rejectToolWorkshopProposal(proposalId: string): void {
  const doc = loadToolWorkshopDoc();
  doc.pendingProposals = doc.pendingProposals.filter((p) => p.id !== proposalId);
  saveToolWorkshopDoc(doc);
}

export function setAddendumActive(id: string, active: boolean): void {
  const doc = loadToolWorkshopDoc();
  const item = doc.activeAddenda.find((a) => a.id === id);
  if (item) {
    item.active = active;
    saveToolWorkshopDoc(doc);
  }
}

export function removeAddendum(id: string): void {
  const doc = loadToolWorkshopDoc();
  doc.activeAddenda = doc.activeAddenda.filter((a) => a.id !== id);
  saveToolWorkshopDoc(doc);
}

export function updateToolWorkshopSettings(
  patch: Partial<import("./types").ToolWorkshopSettings>
): void {
  const doc = loadToolWorkshopDoc();
  doc.settings = { ...doc.settings, ...patch };
  saveToolWorkshopDoc(doc);
}
