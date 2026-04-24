import { AGENTIC_TOOL_IDS, TOOL_GROUPS } from "../services/agenticTools/registry";

/** Short offline descriptions for the worldview / agentic tool surface. */
export const COMPANION_TOOL_BLURBS: Record<string, string> = {
  "world_metadata.patch_projects":
    "Patch project titles, summaries, and notes in shared world metadata.",
  "world_metadata.patch_people":
    "Update per-contact overlays (tags, relationship notes) from connector ids.",
  "user_profile.patch": "Update the local user display name, pronouns, and notes.",
  "gmail.fetch_message_body": "Fetch full email body for the current turn (Gmail connected).",
  "drafts.tasks": "Propose a new task or update platform task state (draft, needs confirmation).",
  "drafts.calendar_event": "Propose a calendar event draft.",
  "drafts.email_reply": "Propose an email reply draft.",
  "avatars.workshop.open_draft":
    "Open Workshops → Creation with optional seed and wiki search prefill.",
};

export function getAgenticToolIds(): readonly string[] {
  return AGENTIC_TOOL_IDS;
}

export function getToolGroupEntries(): { group: string; members: string[] }[] {
  return Object.entries(TOOL_GROUPS).map(([group, members]) => ({
    group,
    members: [...members],
  }));
}

export function blurbForTool(name: string): string {
  return COMPANION_TOOL_BLURBS[name] ?? "See Avatars main app and worldview tool execution for behavior.";
}
