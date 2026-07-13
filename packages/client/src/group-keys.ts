import { GroupCipher } from "@vaultchat/crypto";
import type { StorageAdapter } from "./storage.js";

const LEGACY_GROUP_KEYS_KEY = "vaultchat_group_keys";

export function groupKeysStorageKey(userId: string): string {
  return `vaultchat_group_keys_${userId}`;
}

async function loadKeyMap(
  storage: StorageAdapter,
  userId: string
): Promise<Record<string, string>> {
  const key = groupKeysStorageKey(userId);
  try {
    let raw = await storage.getItem(key);
    if (!raw) {
      const legacy = await storage.getItem(LEGACY_GROUP_KEYS_KEY);
      if (legacy) {
        await storage.setItem(key, legacy);
        await storage.removeItem(LEGACY_GROUP_KEYS_KEY);
        raw = legacy;
      }
    }
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

async function saveKeyMap(
  storage: StorageAdapter,
  userId: string,
  map: Record<string, string>
): Promise<void> {
  await storage.setItem(groupKeysStorageKey(userId), JSON.stringify(map));
}

export async function saveGroupKey(
  storage: StorageAdapter,
  userId: string,
  groupId: string,
  keyBase64: string
): Promise<void> {
  const map = await loadKeyMap(storage, userId);
  map[groupId] = keyBase64;
  await saveKeyMap(storage, userId, map);
}

export async function getStoredGroupKey(
  storage: StorageAdapter,
  userId: string,
  groupId: string
): Promise<string | null> {
  const map = await loadKeyMap(storage, userId);
  return map[groupId] ?? null;
}

/**
 * Persist a community/group AES key from a `group_key` DM.
 * By default, does not replace an existing different key (avoids older inbox
 * pages clobbering a newer key during catch-up). Pass `replaceExisting: true`
 * for live reshare delivery.
 */
export async function captureGroupKeyFromContent(
  storage: StorageAdapter,
  userId: string,
  content: import("@vaultchat/protocol").MessageContent,
  opts?: { replaceExisting?: boolean }
): Promise<boolean> {
  if (content.type !== "group_key" || !content.groupKey) return false;
  const { groupId, key } = content.groupKey;
  const existing = await getStoredGroupKey(storage, userId, groupId);
  if (existing === key) return false;
  if (existing && opts?.replaceExisting === false) return false;
  await saveGroupKey(storage, userId, groupId, key);
  return true;
}

export async function loadGroupCipher(
  storage: StorageAdapter,
  userId: string,
  groupId: string
): Promise<GroupCipher | null> {
  const key = await getStoredGroupKey(storage, userId, groupId);
  if (!key) return null;
  return GroupCipher.fromKeyBase64(key);
}

/** Try candidate keys until one decrypts sample ciphertext; persist the winner. */
export async function adoptWorkingGroupKey(
  storage: StorageAdapter,
  userId: string,
  groupId: string,
  sampleCiphertext: string,
  candidateKeys: string[]
): Promise<boolean> {
  const unique = [...new Set(candidateKeys.filter(Boolean))];
  for (const key of unique) {
    try {
      const cipher = GroupCipher.fromKeyBase64(key);
      await cipher.decrypt(sampleCiphertext);
      await saveGroupKey(storage, userId, groupId, key);
      return true;
    } catch {
      // try next
    }
  }
  return false;
}

/** Remove all cached group/community encryption keys for a user. */
export async function clearGroupKeys(
  storage: StorageAdapter,
  userId: string
): Promise<void> {
  await storage.removeItem(groupKeysStorageKey(userId));
}
