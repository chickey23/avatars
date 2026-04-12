/** Local portrait images (Phase B): data URLs or https URLs in persisted context. */

export const MAX_PORTRAIT_FILE_BYTES = 2 * 1024 * 1024;

export function getAvatarPortraitSrc(
  portraitSrcById: Record<string, string> | undefined,
  avatarId: string,
  appearancePortraitUrl?: string
): string | undefined {
  const override = portraitSrcById?.[avatarId];
  if (override) return override;
  return appearancePortraitUrl;
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
