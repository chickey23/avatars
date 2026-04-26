/** Local portrait images (Phase B): data URLs or https URLs in persisted context. */

export const MAX_PORTRAIT_FILE_BYTES = 2 * 1024 * 1024;

export type AvatarPortraitPosition = {
  x: number;
  y: number;
};

export const DEFAULT_AVATAR_PORTRAIT_POSITION: AvatarPortraitPosition = {
  x: 50,
  y: 50,
};

export const DEFAULT_AVATAR_PORTRAIT_SCALE = 1;
export const MIN_AVATAR_PORTRAIT_SCALE = 0.5;
export const MAX_AVATAR_PORTRAIT_SCALE = 2;

export function getAvatarPortraitSrc(
  portraitSrcById: Record<string, string> | undefined,
  avatarId: string,
  appearancePortraitUrl?: string
): string | undefined {
  const override = portraitSrcById?.[avatarId];
  if (override) return override;
  return appearancePortraitUrl;
}

export function normalizeAvatarPortraitPosition(
  position: AvatarPortraitPosition | undefined
): AvatarPortraitPosition {
  const clamp = (n: number | undefined) =>
    typeof n === "number" && Number.isFinite(n)
      ? Math.max(0, Math.min(100, Math.round(n)))
      : 50;

  return {
    x: clamp(position?.x),
    y: clamp(position?.y),
  };
}

export function getAvatarPortraitObjectPosition(
  position: AvatarPortraitPosition | undefined
): string {
  const p = normalizeAvatarPortraitPosition(position);
  return `${p.x}% ${p.y}%`;
}

export function normalizeAvatarPortraitScale(scale: number | undefined): number {
  if (typeof scale !== "number" || !Number.isFinite(scale)) {
    return DEFAULT_AVATAR_PORTRAIT_SCALE;
  }
  return Math.max(
    MIN_AVATAR_PORTRAIT_SCALE,
    Math.min(MAX_AVATAR_PORTRAIT_SCALE, Math.round(scale * 100) / 100)
  );
}

export function getAvatarPortraitTransform(scale: number | undefined): string {
  return `scale(${normalizeAvatarPortraitScale(scale)})`;
}

export async function readPortraitFileAsDataUrl(file: File): Promise<string | null> {
  if (file.size > MAX_PORTRAIT_FILE_BYTES) return null;
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
