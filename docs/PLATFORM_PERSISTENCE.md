# Platform persistence (durable identifiers)

**Non-normative.** Authoritative values are defined in [`../src/services/platform/constants.ts`](../src/services/platform/constants.ts) and the Tauri module [`../src-tauri/src/platform_cache.rs`](../src-tauri/src/platform_cache.rs).

## On disk (Tauri desktop)

Base path: `%LOCALAPPDATA%\avatars\data\platform\`

| Item | Filename |
|------|----------|
| Email source cache | `source_cache.email.json` |
| Calendar source cache | `source_cache.calendar.json` |
| Contacts source cache | `source_cache.contacts.json` |
| Project / task store | `platform_store.json` |
| Draft write-tool rows | `platform_drafts.json` |

Atomic read/write is exposed as Tauri commands `platform_cache_read`, `platform_cache_write`, and `platform_cache_dir_display` (see `lib.rs`).

## Browser / tests (localStorage)

When the Tauri disk API is unavailable, the same logical data uses the keys in `PLATFORM_*_STORAGE_KEY` in `constants.ts` (e.g. `avatars_platform_store_v1`).

## Session log

- **Platform infrastructure** — `platformLog` emits categories `platform_<event>` (e.g. `platform_runner_tick`); the segment is `PLATFORM_LOG_CATEGORY` in `constants.ts`.
- **Monitor contracts** — `contractLog` emits `contract:<contract>__<event>` where `<contract>` matches the **monitor name** (the part after `monitor:` in `Avatar.systemTags`).

## Default platform steward avatar

`PLATFORM_ATTRIBUTION_AVATAR_ID` is the catalog id of the system row that owns draft tools and unclaimed-contract warnings by default (see `defaultAvatars.ts`).
