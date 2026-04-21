/** Max age since last access before a cached row is pruned (14 days). */
export const EMAIL_INSIGHT_ACCESS_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export const EMAIL_INSIGHTS_STORAGE_KEY = "avatars_email_insights_v1";

export const EMAIL_INSIGHTS_SCHEMA_VERSION = 1 as const;

/** Max characters of body sent to Ollama prep (blocking budget). */
export const EMAIL_PREP_BODY_MAX_CHARS = 12_000;
