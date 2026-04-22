import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailItem } from "../../connectors/types";
import {
  hashItemIds,
  readSourceCache,
  readSourceCacheSync,
  writeSourceCache,
} from "./sourceCache";
import { PLATFORM_CACHE_STORAGE_KEYS } from "./constants";

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

const e = (id: string, date = 0): EmailItem => ({
  id,
  from: "a@b.c",
  subject: id,
  snippet: id,
  date,
});

describe("hashItemIds", () => {
  it("is deterministic and sensitive to order", () => {
    const a = [e("1"), e("2"), e("3")];
    const b = [e("1"), e("2"), e("3")];
    const c = [e("2"), e("1"), e("3")];
    expect(hashItemIds(a)).toBe(hashItemIds(b));
    expect(hashItemIds(a)).not.toBe(hashItemIds(c));
  });

  it("differs when ids change", () => {
    expect(hashItemIds([e("1")])).not.toBe(hashItemIds([e("1x")]));
  });
});

describe("sourceCache localStorage roundtrip", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    for (const key of Object.values(PLATFORM_CACHE_STORAGE_KEYS)) {
      localStorage.removeItem(key);
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null before any runner has written", async () => {
    expect(await readSourceCache("email")).toBeNull();
    expect(readSourceCacheSync("email")).toBeNull();
  });

  it("writes and reads an email snapshot", async () => {
    const items = [e("a", 10), e("b", 20)];
    await writeSourceCache({
      kind: "email",
      items,
      topKIds: ["a"],
      fetchedAt: 1700,
    });

    const snap = await readSourceCache("email");
    expect(snap).not.toBeNull();
    expect(snap!.source).toBe("email");
    expect(snap!.fetchedAt).toBe(1700);
    expect(snap!.items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(snap!.topKIds).toEqual(["a"]);
    expect(snap!.snapshotHash).toBe(hashItemIds(items));
  });

  it("rejects cross-source payloads", async () => {
    await writeSourceCache({
      kind: "email",
      items: [e("x")],
      topKIds: [],
    });
    /** Corrupt the stored source field to simulate a mismatched payload. */
    const key = PLATFORM_CACHE_STORAGE_KEYS.email;
    const raw = localStorage.getItem(key)!;
    localStorage.setItem(key, raw.replace('"email"', '"calendar"'));
    expect(await readSourceCache("email")).toBeNull();
  });
});
