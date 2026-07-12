import {
  createGroup,
  createLocalStorageAdapter,
  distributeGroupKey,
  loadDevice,
  saveGroupKey,
} from "@vaultchat/client";
import { GroupCipher, type VaultDevice } from "@vaultchat/crypto";

export async function createGroupWithKey(
  token: string,
  userId: string,
  username: string,
  deviceId: number,
  device: VaultDevice,
  name: string,
  memberUsernames: string[]
) {
  const storage = createLocalStorageAdapter();
  const group = await createGroup(token, { name, memberUsernames });
  const { keyBase64 } = await GroupCipher.generate();
  await saveGroupKey(storage, userId, group.id, keyBase64);
  await distributeGroupKey(storage, token, device, userId, group.id, keyBase64);
  return group;
}

export async function loadUserDevice(
  token: string,
  userId: string,
  username: string,
  deviceId: number
) {
  const storage = createLocalStorageAdapter();
  return loadDevice(storage, { userId, username, token, deviceId });
}
