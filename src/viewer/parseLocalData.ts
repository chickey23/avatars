import { PLATFORM_STORE_SCHEMA_VERSION } from "../services/platform/constants";
import type { PlatformStoreDoc } from "../services/platform/store";

export function parsePlatformStoreJson(raw: string): PlatformStoreDoc | null {
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return null;
    const r = o as Record<string, unknown>;
    if (r.schemaVersion !== PLATFORM_STORE_SCHEMA_VERSION) return null;
    if (!r.projects || typeof r.projects !== "object") return null;
    if (!r.tasks || typeof r.tasks !== "object") return null;
    if (!r.migrations || typeof r.migrations !== "object") return null;
    return o as PlatformStoreDoc;
  } catch {
    return null;
  }
}
