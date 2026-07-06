import type { StorageAdapter } from "@vaultchat/client";
import * as SecureStore from "expo-secure-store";

const MAX_CHUNK = 1800;

function chunkKey(key: string, i: number) {
  return `${key}__chunk_${i}`;
}

/** SecureStore has a ~2KB limit — split large device state across chunks. */
export function createSecureStorageAdapter(): StorageAdapter {
  return {
    async getItem(key: string) {
      const meta = await SecureStore.getItemAsync(`${key}__meta`);
      if (!meta) return SecureStore.getItemAsync(key);

      const { chunks } = JSON.parse(meta) as { chunks: number };
      let value = "";
      for (let i = 0; i < chunks; i++) {
        const part = await SecureStore.getItemAsync(chunkKey(key, i));
        if (part === null) return null;
        value += part;
      }
      return value;
    },

    async setItem(key: string, value: string) {
      await SecureStore.deleteItemAsync(key);
      const metaKey = `${key}__meta`;
      const oldMeta = await SecureStore.getItemAsync(metaKey);
      if (oldMeta) {
        const { chunks } = JSON.parse(oldMeta) as { chunks: number };
        for (let i = 0; i < chunks; i++) {
          await SecureStore.deleteItemAsync(chunkKey(key, i));
        }
      }

      if (value.length <= MAX_CHUNK) {
        await SecureStore.deleteItemAsync(metaKey);
        await SecureStore.setItemAsync(key, value);
        return;
      }

      const chunks = Math.ceil(value.length / MAX_CHUNK);
      for (let i = 0; i < chunks; i++) {
        await SecureStore.setItemAsync(chunkKey(key, i), value.slice(i * MAX_CHUNK, (i + 1) * MAX_CHUNK));
      }
      await SecureStore.setItemAsync(metaKey, JSON.stringify({ chunks }));
    },

    async removeItem(key: string) {
      await SecureStore.deleteItemAsync(key);
      const meta = await SecureStore.getItemAsync(`${key}__meta`);
      if (meta) {
        const { chunks } = JSON.parse(meta) as { chunks: number };
        for (let i = 0; i < chunks; i++) {
          await SecureStore.deleteItemAsync(chunkKey(key, i));
        }
        await SecureStore.deleteItemAsync(`${key}__meta`);
      }
    },
  };
}
