import { appendSessionLog } from "../sessionLog";
import { generateWithOllama, getOllamaModelNames, getOllamaPresence } from "../ollama";
import { EMAIL_PREP_BODY_MAX_CHARS } from "./constants";
import { emailBodyContentHash } from "./hash";
import { parseJsonObjectFromModelText } from "./parseModelJson";
import { getValidCachedInsight, upsertEmailInsight } from "./store";
import { extractTemplateHints } from "./templates";
import type {
  EmailFocusPrepInput,
  EmailFocusPrepResult,
  EmailInsightInvoice,
  EmailInsightRelevance,
} from "./types";

function clampRelevance(s: string | undefined): EmailInsightRelevance {
  if (s === "relevant" || s === "irrelevant" || s === "uncertain") return s;
  return "uncertain";
}

function mergeInvoices(
  template: EmailInsightInvoice | undefined,
  llm: EmailInsightInvoice | undefined
): EmailInsightInvoice | undefined {
  const out: EmailInsightInvoice = { ...llm, ...template };
  for (const k of Object.keys(out) as (keyof EmailInsightInvoice)[]) {
    if (out[k] == null || String(out[k]).trim() === "") {
      delete out[k];
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function buildFallbackSummary(
  subject: string,
  templateLines: string[] | undefined
): string {
  const sub = subject.trim().slice(0, 200);
  if (templateLines?.length) {
    return [sub || "(no subject)", ...templateLines].join(" — ");
  }
  return sub || "Email (summary unavailable — Ollama not ready).";
}

function normalizeInvoice(raw: unknown): EmailInsightInvoice | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const pick = (k: string): string | undefined => {
    const v = o[k];
    return typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : undefined;
  };
  const inv: EmailInsightInvoice = {
    total: pick("total"),
    currency: pick("currency"),
    orderId: pick("orderId"),
    confirmationId: pick("confirmationId"),
    lastFour: pick("lastFour"),
    routingOrReference: pick("routingOrReference"),
  };
  for (const k of Object.keys(inv) as (keyof EmailInsightInvoice)[]) {
    if (inv[k] == null) delete inv[k];
  }
  return Object.keys(inv).length ? inv : undefined;
}

export async function runEmailFocusPrep(input: EmailFocusPrepInput): Promise<EmailFocusPrepResult> {
  const t0 = performance.now();
  const body = input.body;
  const hash = emailBodyContentHash(body);
  const templateHints = input.templateHints ?? extractTemplateHints(input.from, input.subject, body);

  const cached = getValidCachedInsight(input.messageId, body);
  if (cached) {
    appendSessionLog("email_insights", "prep_cache_hit", {
      level: "info",
      detail: input.messageId.slice(0, 20),
    });
    return {
      summary: cached.summary,
      relevance: cached.relevance,
      invoice: cached.invoice,
      senderKind: cached.senderKind,
      cacheHit: true,
      contentHash: hash,
      modelId: cached.modelId,
    };
  }

  const presence = await getOllamaPresence();
  if (presence !== "ready") {
    appendSessionLog("email_insights", "prep_skip_ollama", {
      level: "info",
      detail: presence,
    });
    return {
      summary: buildFallbackSummary(input.subject, templateHints.summaryLines),
      relevance: "uncertain",
      invoice: templateHints.invoice,
      senderKind: "unknown",
      cacheHit: false,
      contentHash: hash,
    };
  }

  const names = await getOllamaModelNames();
  const modelId = names[0]?.trim();
  const bodyTrim = body.slice(0, EMAIL_PREP_BODY_MAX_CHARS);
  const hintsJson = JSON.stringify(templateHints, null, 0);

  const prompt = `You analyze one email in context of the user's chat message. Output a single JSON object only (no markdown, no prose). Schema:
{
  "summary": string (max 400 chars, factual, no invented numbers),
  "relevance": "relevant" | "irrelevant" | "uncertain" (whether this email matters for answering the USER_MESSAGE),
  "senderKind": string (short e.g. receipt, newsletter, personal, notification),
  "invoice": {
    "total": string?,
    "currency": string?,
    "orderId": string?,
    "confirmationId": string?,
    "lastFour": string?,
    "routingOrReference": string?
  } | null
}
Rules: Only include invoice fields that appear VERBATIM or as clear structured values in the email body. If unsure, omit the field or use null for invoice. Do not invent amounts or ids.

Template/heuristic hints (may be empty): ${hintsJson}

From: ${input.from.slice(0, 400)}
Subject: ${input.subject.slice(0, 400)}
USER_MESSAGE: ${input.userMessage.slice(0, 800)}

Email body (truncated):
${bodyTrim}

JSON:`;

  const gen = await generateWithOllama({ prompt, model: modelId });
  const elapsed = Math.round(performance.now() - t0);
  if (!gen.ok) {
    appendSessionLog("email_insights", "prep_ollama_fail", {
      level: "warn",
      detail: `${elapsed}ms ${gen.error.slice(0, 120)}`,
    });
    return {
      summary: buildFallbackSummary(input.subject, templateHints.summaryLines),
      relevance: "uncertain",
      invoice: templateHints.invoice,
      cacheHit: false,
      contentHash: hash,
    };
  }

  const obj = parseJsonObjectFromModelText(gen.text);
  let summary =
    typeof obj?.summary === "string" && obj.summary.trim()
      ? obj.summary.trim().slice(0, 600)
      : buildFallbackSummary(input.subject, templateHints.summaryLines);
  const relevance = clampRelevance(
    typeof obj?.relevance === "string" ? obj.relevance : undefined
  );
  const senderKind =
    typeof obj?.senderKind === "string" && obj.senderKind.trim()
      ? obj.senderKind.trim().slice(0, 80)
      : undefined;
  const llmInv = normalizeInvoice(obj?.invoice);
  const invoice = mergeInvoices(templateHints.invoice, llmInv);

  if (templateHints.summaryLines?.length && summary.length < 40) {
    summary = buildFallbackSummary(input.subject, templateHints.summaryLines);
  }

  upsertEmailInsight({
    messageId: input.messageId,
    contentHash: hash,
    summary,
    relevance,
    invoice,
    senderKind,
    modelId: modelId ?? "default",
    createdAt: Date.now(),
    lastAccessedAt: Date.now(),
  });

  appendSessionLog("email_insights", "prep_ollama_ok", {
    level: "info",
    detail: `${elapsed}ms relevance=${relevance}`,
  });

  return {
    summary,
    relevance,
    invoice,
    senderKind,
    cacheHit: false,
    contentHash: hash,
    modelId: modelId ?? undefined,
  };
}
