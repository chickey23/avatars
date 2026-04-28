import type { AvatarCreationWorkshopIntent, ConversationMessage } from "../types";
import { registerSyntheticAction } from "./monitors/actions";
import { postSyntheticMessage } from "./monitors/postSynthetic";
import { updateTaskWorkflow } from "./platform/store";
import { appendSessionLog } from "./sessionLog";

export const AVATAR_CREATION_OFFER_MONITOR_TAG =
  "monitor:avatar_creation_offer" as const;

const OPEN_ACTION_ID = "open_avatar_creation_draft";
const REFINE_ACTION_ID = "refine_avatar_creation_draft";
const NOT_NOW_ACTION_ID = "not_now";

type AvatarCreationOfferPayload = {
  intent: AvatarCreationWorkshopIntent;
  /** When set, "Not now" cancels this platform task so the queue advances. */
  platformTaskId?: string;
};

let openHandler: ((intent: AvatarCreationWorkshopIntent) => void) | null = null;
let actionsInstalled = false;

function cleanIntent(
  intent: AvatarCreationWorkshopIntent
): AvatarCreationWorkshopIntent | null {
  const seedText = intent.seedText?.trim().slice(0, 2000) ?? "";
  const wikiQuery = intent.wikiQuery?.trim().slice(0, 500) ?? "";
  if (!seedText && !wikiQuery) return null;
  return {
    ...(seedText ? { seedText } : {}),
    ...(wikiQuery ? { wikiQuery } : {}),
  };
}

function isOfferPayload(payload: unknown): payload is AvatarCreationOfferPayload {
  const p = payload as AvatarCreationOfferPayload | null;
  return !!p?.intent && !!cleanIntent(p.intent);
}

function actionPayloadFor(
  intent: AvatarCreationWorkshopIntent,
  platformTaskId?: string
): AvatarCreationOfferPayload {
  const tid = platformTaskId?.trim();
  return tid ? { intent, platformTaskId: tid } : { intent };
}

function summarizeIntent(intent: AvatarCreationWorkshopIntent): string {
  const pieces: string[] = [];
  if (intent.wikiQuery?.trim()) pieces.push(`Query: ${intent.wikiQuery.trim()}`);
  if (intent.seedText?.trim()) pieces.push(`Seed: ${intent.seedText.trim()}`);
  return pieces.join("\n");
}

export function setAvatarCreationOfferOpenHandler(
  fn: ((intent: AvatarCreationWorkshopIntent) => void) | null
): void {
  openHandler = fn;
}

export function installAvatarCreationOfferActions(): void {
  if (actionsInstalled) return;
  actionsInstalled = true;

  registerSyntheticAction(
    AVATAR_CREATION_OFFER_MONITOR_TAG,
    OPEN_ACTION_ID,
    ({ action }) => {
      if (!isOfferPayload(action.payload)) return;
      const intent = cleanIntent(action.payload.intent);
      if (!intent) return;
      if (!openHandler) {
        appendSessionLog("monitors", "avatar_creation_offer_no_open_handler", {
          level: "warn",
        });
        return;
      }
      openHandler(intent);
    }
  );

  registerSyntheticAction(
    AVATAR_CREATION_OFFER_MONITOR_TAG,
    REFINE_ACTION_ID,
    ({ message, action }) => {
      if (!isOfferPayload(action.payload)) return;
      const actor = message.avatarId ?? "avatar_creation_offer";
      const intent = cleanIntent(action.payload.intent);
      if (!intent) return;
      postSyntheticMessage({
        avatarId: actor,
        monitorTag: AVATAR_CREATION_OFFER_MONITOR_TAG,
        content:
          "Okay. Reply in chat with what you want changed, or open the draft from the original card when the prompt looks right.\n\nCurrent draft hint:\n" +
          summarizeIntent(intent),
        dedupKey: `refine|${message.id}`,
      });
    }
  );

  registerSyntheticAction(
    AVATAR_CREATION_OFFER_MONITOR_TAG,
    NOT_NOW_ACTION_ID,
    ({ action }) => {
      if (!isOfferPayload(action.payload)) return;
      const taskId = action.payload.platformTaskId?.trim();
      if (!taskId) return;
      updateTaskWorkflow({
        taskId,
        actor: "user",
        workflowStatus: "cancelled",
        nextActor: null,
        detail: "skipped from avatar creation offer card",
      });
    }
  );
}

export function postAvatarCreationWorkshopOffer(args: {
  avatarId: string;
  intent: AvatarCreationWorkshopIntent;
  sourceMessage?: ConversationMessage;
  /** Binds buttons to a platform task (dedupe, skip-to-cancel). */
  linkedPlatformTaskId?: string;
  /** Prepended above the stock offer copy (e.g. queue banner). */
  contentIntro?: string;
}): boolean {
  installAvatarCreationOfferActions();
  const intent = cleanIntent(args.intent);
  if (!intent) return false;
  const hint = summarizeIntent(intent);
  const plat = args.linkedPlatformTaskId?.trim();
  const dedupExtra = plat ?? args.sourceMessage?.id ?? "";
  const core =
    "I prepared an avatar creation draft. Review the hint below, then open the workshop or refine it in chat.";
  const intro = args.contentIntro?.trim();
  const body = intro ? `${intro}\n\n${core}\n\n${hint}` : `${core}\n\n${hint}`;
  const pl = actionPayloadFor(intent, plat);
  return postSyntheticMessage({
    avatarId: args.avatarId,
    monitorTag: AVATAR_CREATION_OFFER_MONITOR_TAG,
    content: body,
    actions: [
      {
        id: OPEN_ACTION_ID,
        label: "Open draft",
        payload: pl,
      },
      {
        id: REFINE_ACTION_ID,
        label: "Refine prompt",
        payload: pl,
      },
      {
        id: NOT_NOW_ACTION_ID,
        label: "Not now",
        payload: pl,
      },
    ],
    dedupKey: `offer|${args.avatarId}|${hint}|${dedupExtra}`,
  });
}

export function __resetAvatarCreationOfferForTests(): void {
  openHandler = null;
  actionsInstalled = false;
}
