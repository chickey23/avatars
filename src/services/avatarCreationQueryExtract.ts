/** Extract a short wiki/search query from a user creation request (shared by agents + repair). */
export function extractAvatarCreationQuery(userContent: string): string {
  const normalized = userContent.replace(/\s+/g, " ").trim();
  const patterns = [
    /\b(?:for|about)\s+(.+?)(?:[.?!]|$)/i,
    /\b(?:named|called)\s+(.+?)(?:[.?!]|$)/i,
    /\b(?:avatar|persona|character)\s+(?:of|for)?\s*(.+?)(?:[.?!]|$)/i,
  ];
  for (const re of patterns) {
    const match = normalized.match(re);
    const raw = match?.[1]?.trim();
    if (!raw) continue;
    const cleaned = raw
      .replace(/\b(?:please|thanks|thank you|using the workshop)\b.*$/i, "")
      .replace(/^["'`]+|["'`]+$/g, "")
      .trim();
    if (cleaned.length >= 2) return cleaned.slice(0, 500);
  }
  return normalized.slice(0, 500);
}
