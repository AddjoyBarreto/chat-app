export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const STORAGE_KEY = "vaultchat_session";
/** @deprecated Legacy single-device key — migrated to per-user storage on load */
export const DEVICE_KEY = "vaultchat_device";
export const LOGIN_HINTS_KEY = "vaultchat_login_hints";

export function deviceStorageKey(userId: string): string {
  return `vaultchat_device_${userId}`;
}

export interface LoginHint {
  userId: string;
  deviceId: number;
}

export function createLocalStorageAdapter(): StorageAdapter {
  return {
    async getItem(key) {
      if (typeof localStorage === "undefined") return null;
      return localStorage.getItem(key);
    },
    async setItem(key, value) {
      localStorage.setItem(key, value);
    },
    async removeItem(key) {
      localStorage.removeItem(key);
    },
  };
}
