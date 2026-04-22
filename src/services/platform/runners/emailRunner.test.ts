import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailItem } from "../../../connectors/types";
import { PLATFORM_CACHE_STORAGE_KEYS } from "../constants";
import { readSourceCache } from "../sourceCache";
import { subscribePlatformEvents, type PlatformBusEvent } from "../bus";
import { startEmailRunner } from "./emailRunner";

function installMemoryLocalStorage(): void {
  const map = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  } as Storage);
}

const mk = (id: string, date = 0): EmailItem => ({
  id,
  from: "sender@example.com",
  subject: `subject-${id}`,
  snippet: `snippet ${id}`,
  date,
});

describe("email runner", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    for (const key of Object.values(PLATFORM_CACHE_STORAGE_KEYS)) {
      localStorage.removeItem(key);
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("populates the cache on initial tick and emits source_cache_updated", async () => {
    const events: PlatformBusEvent[] = [];
    const unsubscribe = subscribePlatformEvents((e) => events.push(e));
    const items = [mk("a", 1), mk("b", 2), mk("c", 3)];
    const fetchRecent = vi.fn().mockResolvedValue(items);

    const handle = startEmailRunner({
      fetchRecent,
      intervalMs: 1_000_000,
      runImmediately: true,
    });
    /** Runner's initial tick is fire-and-forget; wait for it via refreshNow. */
    await handle.refreshNow();
    handle.stop();
    unsubscribe();

    expect(fetchRecent).toHaveBeenCalled();
    const snap = await readSourceCache("email");
    expect(snap).not.toBeNull();
    expect(snap!.items.map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(
      events.some((e) => e.type === "source_cache_updated" && e.kind === "email")
    ).toBe(true);
    expect(
      events.some((e) => e.type === "runner_heartbeat" && e.kind === "email")
    ).toBe(true);
  });

  it("skips writes when the snapshot is unchanged", async () => {
    const items = [mk("x", 1)];
    const fetchRecent = vi.fn().mockResolvedValue(items);
    const handle = startEmailRunner({
      fetchRecent,
      intervalMs: 1_000_000,
      runImmediately: true,
    });
    await handle.refreshNow();
    const first = await readSourceCache("email");
    /** Second call returns the same items; cache should not be rewritten. */
    await handle.refreshNow();
    const second = await readSourceCache("email");
    handle.stop();
    expect(first?.fetchedAt).toBe(second?.fetchedAt);
  });
});
