import {
  decryptAccountBackup,
  encryptAccountBackup,
  VaultDevice,
  type AccountKeyBackupPayload,
  type BackupCachedMessage,
  type BackupConversationTimeline,
} from "@vaultchat/crypto";
import { fetchAccountBackup, uploadAccountBackup } from "./api.js";
import {
  exportConversationTimelines,
  importConversationTimelines,
  type ConversationTimeline,
} from "./conversation-store.js";
import { exportGroupKeys, importGroupKeys } from "./group-keys.js";
import {
  exportMessageCache,
  importMessageCache,
  isReadableCachedMessage,
  type CachedDisplayMessage,
} from "./message-cache.js";
import { persistDevice } from "./session.js";
import type { StorageAdapter } from "./storage.js";

/** In-memory login password so we can refresh the backup during the session. */
let sessionBackupPassword: string | null = null;
let backupRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let pendingBackup: {
  storage: StorageAdapter;
  token: string;
  device: VaultDevice;
  userId: string;
} | null = null;

const BACKUP_PW_PREFIX = "vaultchat_backup_pw_";

function backupPasswordKey(userId: string): string {
  return `${BACKUP_PW_PREFIX}${userId}`;
}

export function setSessionBackupPassword(password: string): void {
  sessionBackupPassword = password;
}

/** Keep password available across page reloads until logout (needed for backup refresh). */
export async function bindBackupSession(
  storage: StorageAdapter,
  userId: string,
  password: string
): Promise<void> {
  sessionBackupPassword = password;
  await storage.setItem(backupPasswordKey(userId), password);
}

/** Restore in-memory backup password after a page reload. */
export async function hydrateBackupSession(
  storage: StorageAdapter,
  userId: string
): Promise<boolean> {
  if (sessionBackupPassword) return true;
  const saved = await storage.getItem(backupPasswordKey(userId));
  if (!saved) return false;
  sessionBackupPassword = saved;
  return true;
}

export async function clearSessionBackupPassword(
  storage?: StorageAdapter,
  userId?: string
): Promise<void> {
  sessionBackupPassword = null;
  pendingBackup = null;
  if (backupRefreshTimer) {
    clearTimeout(backupRefreshTimer);
    backupRefreshTimer = null;
  }
  if (storage && userId) {
    await storage.removeItem(backupPasswordKey(userId));
  }
}

export function hasSessionBackupPassword(): boolean {
  return Boolean(sessionBackupPassword);
}

/** Current session backup password when hydrated (null if user must re-enter it). */
export function getSessionBackupPassword(): string | null {
  return sessionBackupPassword;
}

function trimMessageCache(
  map: Record<string, CachedDisplayMessage | BackupCachedMessage>,
  max = 2500
): Record<string, BackupCachedMessage> {
  const entries = Object.entries(map).filter(([, m]) =>
    isReadableCachedMessage(m as CachedDisplayMessage)
  );
  entries.sort((a, b) => new Date(a[1].time).getTime() - new Date(b[1].time).getTime());
  const kept = entries.slice(-max);
  const out: Record<string, BackupCachedMessage> = {};
  for (const [id, msg] of kept) {
    out[id] = msg as BackupCachedMessage;
  }
  return out;
}

function trimTimelines(
  timelines: Record<string, ConversationTimeline | BackupConversationTimeline>,
  maxPeers = 40,
  maxPerPeer = 200
): Record<string, BackupConversationTimeline> {
  const ranked = Object.entries(timelines).sort((a, b) =>
    (a[1].updatedAt ?? "").localeCompare(b[1].updatedAt ?? "")
  );
  const kept = ranked.slice(-maxPeers);
  const out: Record<string, BackupConversationTimeline> = {};
  for (const [peerId, entry] of kept) {
    const messages = (entry.messages ?? [])
      .filter((m) => isReadableCachedMessage(m as CachedDisplayMessage))
      .slice(-maxPerPeer) as BackupCachedMessage[];
    if (messages.length === 0) continue;
    out[peerId] = {
      peerId,
      messages,
      newestAt: entry.newestAt,
      updatedAt: entry.updatedAt,
    };
  }
  return out;
}

/** Union of caches — never drop remote entries just because local is empty. */
function mergeMessageCaches(
  remote: Record<string, BackupCachedMessage> | undefined,
  local: Record<string, BackupCachedMessage>
): Record<string, BackupCachedMessage> {
  const merged: Record<string, BackupCachedMessage> = { ...(remote ?? {}) };
  for (const [id, msg] of Object.entries(local)) {
    if (!isReadableCachedMessage(msg as CachedDisplayMessage)) continue;
    merged[id] = msg;
  }
  return trimMessageCache(merged);
}

function mergeTimelineMaps(
  remote: Record<string, BackupConversationTimeline> | undefined,
  local: Record<string, BackupConversationTimeline>
): Record<string, BackupConversationTimeline> {
  const merged: Record<string, BackupConversationTimeline> = { ...(remote ?? {}) };
  for (const [peerId, localEntry] of Object.entries(local)) {
    const remoteEntry = merged[peerId];
    if (!remoteEntry) {
      merged[peerId] = localEntry;
      continue;
    }
    const byId = new Map<string, BackupCachedMessage>();
    for (const m of remoteEntry.messages ?? []) {
      if (isReadableCachedMessage(m as CachedDisplayMessage)) byId.set(m.id, m);
    }
    for (const m of localEntry.messages ?? []) {
      if (isReadableCachedMessage(m as CachedDisplayMessage)) byId.set(m.id, m);
    }
    const messages = [...byId.values()].sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );
    merged[peerId] = {
      peerId,
      messages,
      newestAt: messages[messages.length - 1]?.time ?? localEntry.newestAt ?? remoteEntry.newestAt,
      updatedAt:
        (localEntry.updatedAt ?? "") > (remoteEntry.updatedAt ?? "")
          ? localEntry.updatedAt
          : remoteEntry.updatedAt,
    };
  }
  return trimTimelines(merged);
}

async function collectHistory(
  storage: StorageAdapter,
  userId: string
): Promise<Pick<AccountKeyBackupPayload, "messageCache" | "timelines" | "groupKeys">> {
  const [messageCache, timelines, groupKeys] = await Promise.all([
    exportMessageCache(storage, userId),
    exportConversationTimelines(storage, userId),
    exportGroupKeys(storage, userId),
  ]);
  return {
    messageCache: trimMessageCache(messageCache),
    timelines: trimTimelines(timelines),
    groupKeys,
  };
}

export interface RestoreHistoryResult {
  messages: number;
  timelines: number;
  groupKeys: number;
}

/** Apply plaintext history from a decrypted backup into local sealed storage. */
export async function applyHistoryFromBackup(
  storage: StorageAdapter,
  userId: string,
  payload: AccountKeyBackupPayload
): Promise<RestoreHistoryResult> {
  let messages = 0;
  let timelines = 0;
  let groupKeys = 0;

  if (payload.messageCache && Object.keys(payload.messageCache).length > 0) {
    messages = await importMessageCache(
      storage,
      userId,
      payload.messageCache as Record<string, CachedDisplayMessage>
    );
  }
  if (payload.timelines && Object.keys(payload.timelines).length > 0) {
    timelines = await importConversationTimelines(
      storage,
      userId,
      payload.timelines as Record<string, ConversationTimeline>
    );
  }
  if (payload.groupKeys && Object.keys(payload.groupKeys).length > 0) {
    groupKeys = await importGroupKeys(storage, userId, payload.groupKeys);
  }

  return { messages, timelines, groupKeys };
}

/**
 * Merge current device + local history into the password-encrypted server backup.
 * History is a UNION with the existing remote backup — never wipe remote chats
 * just because this install has an empty cache (e.g. brand-new linked device).
 */
export async function mergeAndUploadAccountBackup(
  token: string,
  password: string,
  device: VaultDevice,
  storage?: StorageAdapter,
  userId?: string
): Promise<void> {
  if (storage && userId) {
    await bindBackupSession(storage, userId, password);
  } else {
    setSessionBackupPassword(password);
  }

  let payload: AccountKeyBackupPayload = { version: 2, devices: {} };
  let hadExistingBackup = false;

  try {
    const { backup } = await fetchAccountBackup(token);
    if (backup) {
      hadExistingBackup = true;
      const existing = await decryptAccountBackup(password, backup);
      if (!existing) {
        throw new Error("ACCOUNT_BACKUP_DECRYPT_FAILED");
      }
      payload = { ...existing, version: 2, devices: { ...existing.devices } };
    }
  } catch (err) {
    if (err instanceof Error && err.message === "ACCOUNT_BACKUP_DECRYPT_FAILED") {
      throw err;
    }
    if (hadExistingBackup) throw err;
  }

  payload.devices[String(device.deviceId)] = device.exportState();

  if (storage && userId) {
    const history = await collectHistory(storage, userId);
    payload.messageCache = mergeMessageCaches(payload.messageCache, history.messageCache ?? {});
    payload.timelines = mergeTimelineMaps(payload.timelines, history.timelines ?? {});
    payload.groupKeys = { ...(payload.groupKeys ?? {}), ...(history.groupKeys ?? {}) };
  }

  const encrypted = await encryptAccountBackup(password, payload);
  await uploadAccountBackup(token, encrypted);
}

/** Debounced backup refresh using the in-memory / hydrated login password. */
export function scheduleAccountBackupRefresh(
  storage: StorageAdapter,
  token: string,
  device: VaultDevice,
  userId: string
): void {
  pendingBackup = { storage, token, device, userId };
  if (backupRefreshTimer) clearTimeout(backupRefreshTimer);
  // Short debounce so a quick quit still usually lands within the upload window;
  // pagehide / AppState also call uploadAccountBackupNow for a hard flush.
  backupRefreshTimer = setTimeout(() => {
    void flushAccountBackupRefresh();
  }, 2_000);
}

export async function flushAccountBackupRefresh(): Promise<void> {
  if (backupRefreshTimer) {
    clearTimeout(backupRefreshTimer);
    backupRefreshTimer = null;
  }
  const pending = pendingBackup;
  if (!pending) return;

  if (!sessionBackupPassword) {
    await hydrateBackupSession(pending.storage, pending.userId);
  }
  const password = sessionBackupPassword;
  if (!password) return;
  pendingBackup = null;
  try {
    await mergeAndUploadAccountBackup(
      pending.token,
      password,
      pending.device,
      pending.storage,
      pending.userId
    );
  } catch {
    // non-fatal
  }
}

/** Force a full backup upload (e.g. on logout) when the session password is known. */
export async function uploadAccountBackupNow(
  storage: StorageAdapter,
  token: string,
  device: VaultDevice,
  userId: string
): Promise<void> {
  if (!sessionBackupPassword) {
    await hydrateBackupSession(storage, userId);
  }
  const password = sessionBackupPassword;
  if (!password) return;
  pendingBackup = null;
  if (backupRefreshTimer) {
    clearTimeout(backupRefreshTimer);
    backupRefreshTimer = null;
  }
  await mergeAndUploadAccountBackup(token, password, device, storage, userId);
}

export interface RestoreDeviceResult {
  device: VaultDevice;
  history: RestoreHistoryResult;
  restoredFromBackup: true;
}

/** Download + decrypt backup blob (does not change device keys). */
export async function fetchDecryptedAccountBackup(
  token: string,
  password: string
): Promise<AccountKeyBackupPayload | null> {
  const { backup } = await fetchAccountBackup(token);
  if (!backup) return null;
  return decryptAccountBackup(password, backup);
}

/**
 * Re-apply message history from the password backup without rotating device keys.
 * Safe to call on every login so chats come back even when local keys already exist.
 */
export async function restoreHistoryFromBackupOnly(
  storage: StorageAdapter,
  token: string,
  password: string,
  userId: string
): Promise<RestoreHistoryResult> {
  const payload = await fetchDecryptedAccountBackup(token, password);
  if (!payload) return { messages: 0, timelines: 0, groupKeys: 0 };
  const history = await applyHistoryFromBackup(storage, userId, payload);
  await bindBackupSession(storage, userId, password);
  return history;
}

/**
 * Restore local keys (+ history) from server backup after reinstall / new browser.
 * Tries preferDeviceId first, then any other backed-up device slot.
 */
export async function tryRestoreDeviceFromBackup(
  storage: StorageAdapter,
  password: string,
  userId: string,
  preferDeviceId: number,
  token: string
): Promise<RestoreDeviceResult | null> {
  const payload = await fetchDecryptedAccountBackup(token, password);
  if (!payload) return null;

  const ids = Object.keys(payload.devices)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (ids.length === 0) return null;

  const ordered = [
    preferDeviceId,
    ...ids.filter((id) => id !== preferDeviceId).reverse(),
  ].filter((id, i, arr) => arr.indexOf(id) === i && payload.devices[String(id)]);

  for (const deviceId of ordered) {
    const state = payload.devices[String(deviceId)];
    if (!state) continue;
    const device = await VaultDevice.restore(userId, deviceId, state);
    await persistDevice(storage, device, userId);
    const history = await applyHistoryFromBackup(storage, userId, payload);
    await bindBackupSession(storage, userId, password);
    return { device, history, restoredFromBackup: true };
  }

  return null;
}
