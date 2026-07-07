export interface FriendPick {
  userId: string;
  username: string;
}

/** Parse comma-separated member usernames from the input value. */
export function parseMemberUsernames(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** The username fragment currently being typed (after the last comma). */
export function getActiveMemberToken(value: string): string {
  const parts = value.split(",");
  return parts[parts.length - 1]?.trim().toLowerCase() ?? "";
}

/** Friends matching the in-progress token, excluding already-added members. */
export function filterFriendsForMemberInput(
  friends: FriendPick[],
  value: string,
  limit = 8
): FriendPick[] {
  const selected = new Set(parseMemberUsernames(value));
  const token = getActiveMemberToken(value);
  const available = friends.filter((f) => !selected.has(f.username.toLowerCase()));
  if (!token) return available.slice(0, limit);
  return available
    .filter((f) => f.username.toLowerCase().includes(token))
    .slice(0, limit);
}

/** Insert a friend username at the current token position. */
export function appendMemberUsername(value: string, username: string): string {
  const parts = value.split(",");
  if (parts.length === 1 && !parts[0]!.trim()) {
    return `${username}, `;
  }
  const committed = parts
    .slice(0, -1)
    .map((p) => p.trim())
    .filter(Boolean);
  return [...committed, username].join(", ") + ", ";
}
