import type { LoginHint } from "./storage.js";
import { LOGIN_HINTS_KEY, type StorageAdapter } from "./storage.js";

type HintMap = Record<string, LoginHint>;

async function loadHints(storage: StorageAdapter): Promise<HintMap> {
  try {
    const raw = await storage.getItem(LOGIN_HINTS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as HintMap;
  } catch {
    return {};
  }
}

export async function getLoginHint(
  storage: StorageAdapter,
  identifier: string
): Promise<LoginHint | null> {
  const key = identifier.trim().toLowerCase();
  const hints = await loadHints(storage);
  return hints[key] ?? null;
}

export async function saveLoginHint(
  storage: StorageAdapter,
  identifier: string,
  hint: LoginHint
): Promise<void> {
  const key = identifier.trim().toLowerCase();
  const hints = await loadHints(storage);
  hints[key] = hint;
  await storage.setItem(LOGIN_HINTS_KEY, JSON.stringify(hints));
}
