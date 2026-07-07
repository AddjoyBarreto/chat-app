import { devices, friendships, friendRequests, oneTimePreKeys, signedPreKeys, users } from "@vaultchat/db";
import { verifyPreKeyBundle } from "@vaultchat/crypto";
import type {
  OwnDeviceKeysResponse,
  PreKeyBundleResponse,
  UploadPreKeysRequest,
  UserProfile,
  UserSearchResponse,
  UserSearchResult,
} from "@vaultchat/protocol";
import { and, asc, desc, eq, ilike, ne } from "drizzle-orm";
import type { ApiContext } from "./context.js";
import { ApiCoreError } from "./errors.js";

function bundleFromDevice(
  userId: string,
  device: { deviceId: number; registrationId: number; identityKeyPublic: string },
  signed: { keyId: number; publicKey: string; signature: string },
  oneTimePreKey?: { keyId: number; publicKey: string }
): PreKeyBundleResponse {
  return {
    userId,
    deviceId: device.deviceId,
    registrationId: device.registrationId,
    identityKey: device.identityKeyPublic,
    signedPreKey: {
      keyId: signed.keyId,
      publicKey: signed.publicKey,
      signature: signed.signature,
    },
    oneTimePreKey: oneTimePreKey
      ? { keyId: oneTimePreKey.keyId, publicKey: oneTimePreKey.publicKey }
      : undefined,
  };
}

/** True when the latest stored signed prekey matches the device identity. */
export async function isDeviceBundleValid(
  ctx: ApiContext,
  userId: string,
  deviceId: number
): Promise<boolean> {
  const [device] = await ctx.db
    .select()
    .from(devices)
    .where(and(eq(devices.userId, userId), eq(devices.deviceId, deviceId)))
    .limit(1);
  if (!device) return false;

  const [signed] = await ctx.db
    .select()
    .from(signedPreKeys)
    .where(eq(signedPreKeys.deviceRef, device.id))
    .orderBy(desc(signedPreKeys.createdAt))
    .limit(1);
  if (!signed) return false;

  const bundle = bundleFromDevice(userId, device, signed);
  return verifyPreKeyBundle(bundle);
}

/** Peek at own published keys without consuming a one-time prekey. */
export async function getOwnDeviceKeys(
  ctx: ApiContext,
  userId: string,
  deviceId: number
): Promise<OwnDeviceKeysResponse> {
  const [user] = await ctx.db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new ApiCoreError("User not found", 404, "NOT_FOUND");

  const [device] = await ctx.db
    .select()
    .from(devices)
    .where(and(eq(devices.userId, userId), eq(devices.deviceId, deviceId)))
    .limit(1);
  if (!device) throw new ApiCoreError("Device not found", 404, "DEVICE_NOT_FOUND");

  const [signed] = await ctx.db
    .select()
    .from(signedPreKeys)
    .where(eq(signedPreKeys.deviceRef, device.id))
    .orderBy(desc(signedPreKeys.createdAt))
    .limit(1);
  if (!signed) throw new ApiCoreError("No signed prekey on file", 404, "NO_PREKEYS");

  return {
    userId: user.id,
    deviceId: device.deviceId,
    registrationId: device.registrationId,
    identityKey: device.identityKeyPublic,
    signedPreKey: {
      keyId: signed.keyId,
      publicKey: signed.publicKey,
      signature: signed.signature,
    },
  };
}

export async function registerDeviceForUser(
  ctx: ApiContext,
  userId: string,
  body: {
    registrationId: number;
    identityKeyPublic: string;
    deviceName?: string;
    deviceId: number;
  }
): Promise<{ id: string; deviceId: number }> {
  const [device] = await ctx.db
    .insert(devices)
    .values({
      userId,
      deviceId: body.deviceId,
      registrationId: body.registrationId,
      identityKeyPublic: body.identityKeyPublic,
      deviceName: body.deviceName ?? "Primary",
    })
    .returning({ id: devices.id, deviceId: devices.deviceId });

  return device;
}

export async function getUserByUsername(ctx: ApiContext, username: string): Promise<UserProfile> {
  const [user] = await ctx.db
    .select()
    .from(users)
    .where(eq(users.username, username.trim().toLowerCase()))
    .limit(1);
  if (!user) throw new ApiCoreError("User not found", 404, "NOT_FOUND");

  return {
    id: user.id,
    username: user.username,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt.toISOString(),
  };
}

const USERNAME_PREFIX_RE = /^[a-z0-9_]*$/;

export async function searchUsers(
  ctx: ApiContext,
  viewerId: string,
  query: string,
  limit = 8
): Promise<UserSearchResponse> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return { users: [] };
  if (!USERNAME_PREFIX_RE.test(q)) {
    throw new ApiCoreError("Invalid search query", 400, "INVALID_QUERY");
  }

  const pageSize = Math.min(Math.max(Math.floor(limit), 1), 10);

  const rows = await ctx.db
    .select({
      id: users.id,
      username: users.username,
      emailVerified: users.emailVerified,
    })
    .from(users)
    .where(and(ilike(users.username, `${q}%`), ne(users.id, viewerId)))
    .orderBy(asc(users.username))
    .limit(pageSize);

  if (rows.length === 0) return { users: [] };

  const [friendRows, outgoingPending, incomingPending] = await Promise.all([
    ctx.db
      .select({ friendId: friendships.friendId })
      .from(friendships)
      .where(eq(friendships.userId, viewerId)),
    ctx.db
      .select({ recipientId: friendRequests.recipientId })
      .from(friendRequests)
      .where(
        and(eq(friendRequests.senderId, viewerId), eq(friendRequests.status, "pending"))
      ),
    ctx.db
      .select({ senderId: friendRequests.senderId })
      .from(friendRequests)
      .where(
        and(eq(friendRequests.recipientId, viewerId), eq(friendRequests.status, "pending"))
      ),
  ]);

  const friendSet = new Set(friendRows.map((r) => r.friendId));
  const pendingOut = new Set(outgoingPending.map((r) => r.recipientId));
  const pendingIn = new Set(incomingPending.map((r) => r.senderId));

  return {
    users: rows.map((row) => {
      let relationship: UserSearchResult["relationship"] = "none";
      if (friendSet.has(row.id)) relationship = "friend";
      else if (pendingOut.has(row.id)) relationship = "pending_out";
      else if (pendingIn.has(row.id)) relationship = "pending_in";

      return {
        id: row.id,
        username: row.username,
        emailVerified: row.emailVerified,
        relationship,
      };
    }),
  };
}

export async function uploadPreKeys(
  ctx: ApiContext,
  userId: string,
  deviceId: number,
  body: UploadPreKeysRequest
): Promise<{ ok: true }> {
  const [device] = await ctx.db
    .select()
    .from(devices)
    .where(and(eq(devices.userId, userId), eq(devices.deviceId, deviceId)))
    .limit(1);
  if (!device) throw new ApiCoreError("Device not found", 404, "DEVICE_NOT_FOUND");

  if (!body.signedPreKey && body.oneTimePreKeys.length === 0) {
    throw new ApiCoreError("No prekeys to upload", 400, "INVALID_PREKEY");
  }

  if (body.signedPreKey) {
    const bundle = bundleFromDevice(userId, device, body.signedPreKey);
    if (!(await verifyPreKeyBundle(bundle))) {
      throw new ApiCoreError("Signed prekey does not match device identity", 400, "INVALID_PREKEY");
    }

    await ctx.db.delete(signedPreKeys).where(eq(signedPreKeys.deviceRef, device.id));
    await ctx.db.insert(signedPreKeys).values({
      deviceRef: device.id,
      keyId: body.signedPreKey.keyId,
      publicKey: body.signedPreKey.publicKey,
      signature: body.signedPreKey.signature,
    });
  }

  if (body.oneTimePreKeys.length > 0) {
    await ctx.db.insert(oneTimePreKeys).values(
      body.oneTimePreKeys.map((pk) => ({
        deviceRef: device.id,
        keyId: pk.keyId,
        publicKey: pk.publicKey,
      }))
    );
  }

  return { ok: true };
}

export async function getPreKeyBundle(
  ctx: ApiContext,
  userId: string,
  deviceId = 1
): Promise<PreKeyBundleResponse> {
  const [user] = await ctx.db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new ApiCoreError("User not found", 404, "NOT_FOUND");

  const [device] = await ctx.db
    .select()
    .from(devices)
    .where(and(eq(devices.userId, userId), eq(devices.deviceId, deviceId)))
    .limit(1);
  if (!device) throw new ApiCoreError("Device not found", 404, "DEVICE_NOT_FOUND");

  const [signed] = await ctx.db
    .select()
    .from(signedPreKeys)
    .where(eq(signedPreKeys.deviceRef, device.id))
    .orderBy(desc(signedPreKeys.createdAt))
    .limit(1);
  if (!signed) {
    throw new ApiCoreError("No signed prekey on file", 404, "NO_PREKEYS");
  }

  const probe = bundleFromDevice(userId, device, signed);
  if (!(await verifyPreKeyBundle(probe))) {
    await ctx.db.delete(signedPreKeys).where(eq(signedPreKeys.deviceRef, device.id));
    throw new ApiCoreError("No valid signed prekey on file", 404, "NO_PREKEYS");
  }

  await ctx.db
    .delete(signedPreKeys)
    .where(and(eq(signedPreKeys.deviceRef, device.id), ne(signedPreKeys.id, signed.id)));

  const [oneTime] = await ctx.db
    .select()
    .from(oneTimePreKeys)
    .where(and(eq(oneTimePreKeys.deviceRef, device.id), eq(oneTimePreKeys.used, false)))
    .orderBy(asc(oneTimePreKeys.createdAt))
    .limit(1);

  if (oneTime) {
    await ctx.db
      .update(oneTimePreKeys)
      .set({ used: true })
      .where(eq(oneTimePreKeys.id, oneTime.id));
  }

  return bundleFromDevice(
    user.id,
    device,
    signed,
    oneTime ? { keyId: oneTime.keyId, publicKey: oneTime.publicKey } : undefined
  );
}

export async function listUserDevices(
  ctx: ApiContext,
  userId: string
): Promise<import("@vaultchat/protocol").ListDevicesResponse> {
  const rows = await ctx.db
    .select({ deviceId: devices.deviceId, deviceName: devices.deviceName })
    .from(devices)
    .where(eq(devices.userId, userId))
    .orderBy(asc(devices.deviceId));

  return {
    devices: rows.map((r) => ({
      deviceId: r.deviceId,
      deviceName: r.deviceName ?? undefined,
    })),
  };
}

export async function listPublicUserDevices(
  ctx: ApiContext,
  userId: string
): Promise<import("@vaultchat/protocol").PublicUserDevicesResponse> {
  const [user] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new ApiCoreError("User not found", 404, "NOT_FOUND");
  return listUserDevices(ctx, userId);
}
