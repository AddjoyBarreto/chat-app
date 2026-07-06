import { emailVerificationTokens, users } from "@vaultchat/db";
import type {
  LoginUserRequest,
  LoginUserResponse,
  MeResponse,
  RegisterUserRequest,
  RegisterUserResponse,
  ResendVerificationResponse,
  VerifyEmailResponse,
} from "@vaultchat/protocol";
import { and, desc, eq, gt, or } from "drizzle-orm";
import { isValidPhoneNumber } from "libphonenumber-js";
import { createToken } from "./auth.js";
import type { ApiContext } from "./context.js";
import { throwIfUniqueViolation } from "./db-errors.js";
import { createVerificationToken, sendVerificationEmail } from "./email.js";
import { ApiCoreError } from "./errors.js";
import { hashPassword, verifyPassword } from "./password.js";
import { registerDeviceForUser, isDeviceBundleValid } from "./users.js";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COUNTRY_CODE_RE = /^\+[1-9]\d{0,3}$/;
const MIN_PASSWORD_LEN = 8;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeCountryCode(code: string): string {
  const trimmed = code.trim();
  return trimmed.startsWith("+") ? trimmed : `+${trimmed}`;
}

function normalizePhoneNumber(number: string): string {
  return number.replace(/\D/g, "");
}

function validateCredentialsFields(body: {
  username: string;
  email: string;
  password: string;
  phoneCountryCode: string;
  phoneNumber: string;
}): {
  username: string;
  email: string;
  phoneCountryCode: string;
  phoneNumber: string;
} {
  const username = body.username.trim().toLowerCase();
  if (!USERNAME_RE.test(username)) {
    throw new ApiCoreError("Username must be 3–32 alphanumeric characters", 400, "INVALID_USERNAME");
  }

  const email = normalizeEmail(body.email);
  if (!EMAIL_RE.test(email)) {
    throw new ApiCoreError("Invalid email address", 400, "INVALID_EMAIL");
  }

  if (!body.password || body.password.length < MIN_PASSWORD_LEN) {
    throw new ApiCoreError("Password must be at least 8 characters", 400, "INVALID_PASSWORD");
  }

  const phoneCountryCode = normalizeCountryCode(body.phoneCountryCode);
  if (!COUNTRY_CODE_RE.test(phoneCountryCode)) {
    throw new ApiCoreError("Invalid country code (e.g. +1, +44)", 400, "INVALID_PHONE");
  }

  const phoneNumber = normalizePhoneNumber(body.phoneNumber);
  if (!phoneNumber) {
    throw new ApiCoreError("Phone number is required", 400, "INVALID_PHONE");
  }

  const e164 = `${phoneCountryCode}${phoneNumber}`;
  if (!isValidPhoneNumber(e164)) {
    throw new ApiCoreError(
      "Enter a valid phone number for the selected country",
      400,
      "INVALID_PHONE"
    );
  }

  return { username, email, phoneCountryCode, phoneNumber };
}

async function assertUniqueUserFields(
  ctx: ApiContext,
  fields: { username: string; email: string; phoneCountryCode: string; phoneNumber: string }
): Promise<void> {
  const [usernameMatch] = await ctx.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, fields.username))
    .limit(1);
  if (usernameMatch) {
    throw new ApiCoreError("Username already taken", 409, "USERNAME_TAKEN");
  }

  const [emailMatch] = await ctx.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, fields.email))
    .limit(1);
  if (emailMatch) {
    throw new ApiCoreError("Email already registered", 409, "EMAIL_TAKEN");
  }

  const [phoneMatch] = await ctx.db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.phoneCountryCode, fields.phoneCountryCode),
        eq(users.phoneNumber, fields.phoneNumber)
      )
    )
    .limit(1);
  if (phoneMatch) {
    throw new ApiCoreError("Phone number already registered", 409, "PHONE_TAKEN");
  }
}

async function createEmailVerificationToken(ctx: ApiContext, userId: string): Promise<string> {
  const token = createVerificationToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await ctx.db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, userId));

  await ctx.db.insert(emailVerificationTokens).values({
    userId,
    token,
    expiresAt,
  });

  return token;
}

export async function registerUser(
  ctx: ApiContext,
  body: RegisterUserRequest
): Promise<RegisterUserResponse> {
  const fields = validateCredentialsFields(body);
  await assertUniqueUserFields(ctx, fields);

  const passwordHash = await hashPassword(body.password);

  const autoVerify = process.env.SKIP_EMAIL_VERIFICATION === "true";

  let user: { id: string };
  try {
    [user] = await ctx.db
      .insert(users)
      .values({
        username: fields.username,
        email: fields.email,
        passwordHash,
        phoneCountryCode: fields.phoneCountryCode,
        phoneNumber: fields.phoneNumber,
        emailVerified: autoVerify,
      })
      .returning({ id: users.id });
  } catch (err) {
    throwIfUniqueViolation(err);
  }

  const device = await registerDeviceForUser(ctx, user.id, {
    registrationId: body.registrationId,
    identityKeyPublic: body.identityKeyPublic,
    deviceName: body.deviceName ?? "Primary",
    deviceId: 1,
  });

  if (!autoVerify) {
    const verificationToken = await createEmailVerificationToken(ctx, user.id);
    await sendVerificationEmail(fields.email, verificationToken);
  }

  const token = await createToken(ctx.jwtSecret, user.id, device.deviceId);

  return {
    userId: user.id,
    deviceId: device.deviceId,
    token,
    emailVerified: autoVerify,
  };
}

export async function loginUser(
  ctx: ApiContext,
  body: LoginUserRequest
): Promise<LoginUserResponse> {
  const identifier = body.identifier.trim().toLowerCase();
  if (!identifier || !body.password) {
    throw new ApiCoreError("Identifier and password are required", 400, "INVALID_CREDENTIALS");
  }

  const [user] = await ctx.db
    .select()
    .from(users)
    .where(or(eq(users.username, identifier), eq(users.email, identifier)))
    .limit(1);

  if (!user || !user.passwordHash) {
    throw new ApiCoreError("Invalid username/email or password", 401, "INVALID_CREDENTIALS");
  }

  const valid = await verifyPassword(body.password, user.passwordHash);
  if (!valid) {
    throw new ApiCoreError("Invalid username/email or password", 401, "INVALID_CREDENTIALS");
  }

  if (!user.emailVerified) {
    throw new ApiCoreError(
      "Please verify your email before signing in",
      403,
      "EMAIL_NOT_VERIFIED"
    );
  }

  const { devices, oneTimePreKeys, signedPreKeys } = await import("@vaultchat/db");
  let deviceId = body.deviceId ?? 1;
  let preKeysRequired = false;

  if (body.identityKeyPublic && body.registrationId !== undefined) {
    const [existing] = await ctx.db
      .select()
      .from(devices)
      .where(and(eq(devices.userId, user.id), eq(devices.deviceId, deviceId)))
      .limit(1);

    if (!existing) {
      const [maxRow] = await ctx.db
        .select({ deviceId: devices.deviceId })
        .from(devices)
        .where(eq(devices.userId, user.id))
        .orderBy(desc(devices.deviceId))
        .limit(1);

      const nextDeviceId = maxRow ? maxRow.deviceId + 1 : 1;
      const created = await registerDeviceForUser(ctx, user.id, {
        registrationId: body.registrationId,
        identityKeyPublic: body.identityKeyPublic,
        deviceName: body.deviceName ?? "Device",
        deviceId: nextDeviceId,
      });
      deviceId = created.deviceId;
      preKeysRequired = true;
    } else if (existing.identityKeyPublic !== body.identityKeyPublic) {
      await ctx.db
        .update(devices)
        .set({
          identityKeyPublic: body.identityKeyPublic,
          registrationId: body.registrationId,
        })
        .where(eq(devices.id, existing.id));
      await ctx.db.delete(signedPreKeys).where(eq(signedPreKeys.deviceRef, existing.id));
      await ctx.db.delete(oneTimePreKeys).where(eq(oneTimePreKeys.deviceRef, existing.id));
      preKeysRequired = true;
    } else {
      const bundleValid = await isDeviceBundleValid(ctx, user.id, deviceId);
      if (!bundleValid) {
        await ctx.db.delete(signedPreKeys).where(eq(signedPreKeys.deviceRef, existing.id));
        preKeysRequired = true;
      }
    }
  } else {
    const [existing] = await ctx.db
      .select({ deviceId: devices.deviceId })
      .from(devices)
      .where(and(eq(devices.userId, user.id), eq(devices.deviceId, deviceId)))
      .limit(1);

    if (!existing) {
      throw new ApiCoreError(
        "Device keys required for this sign-in",
        400,
        "DEVICE_KEYS_REQUIRED"
      );
    }
  }

  const token = await createToken(ctx.jwtSecret, user.id, deviceId);

  return {
    userId: user.id,
    deviceId,
    token,
    username: user.username,
    emailVerified: user.emailVerified,
    preKeysRequired: preKeysRequired || undefined,
  };
}

export async function verifyEmail(ctx: ApiContext, token: string): Promise<VerifyEmailResponse> {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new ApiCoreError("Verification token is required", 400, "INVALID_TOKEN");
  }

  const [row] = await ctx.db
    .select()
    .from(emailVerificationTokens)
    .where(and(eq(emailVerificationTokens.token, trimmed), gt(emailVerificationTokens.expiresAt, new Date())))
    .limit(1);

  if (!row) {
    throw new ApiCoreError("Invalid or expired verification link", 400, "INVALID_TOKEN");
  }

  await ctx.db.update(users).set({ emailVerified: true }).where(eq(users.id, row.userId));
  await ctx.db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, row.userId));

  return { ok: true, emailVerified: true };
}

export async function resendVerificationEmail(
  ctx: ApiContext,
  userId: string
): Promise<ResendVerificationResponse> {
  const [user] = await ctx.db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new ApiCoreError("User not found", 404, "NOT_FOUND");
  if (user.emailVerified) {
    return { ok: true, message: "Email is already verified." };
  }

  const verificationToken = await createEmailVerificationToken(ctx, user.id);
  await sendVerificationEmail(user.email, verificationToken);

  return { ok: true, message: "Verification email sent." };
}

export async function getMe(ctx: ApiContext, userId: string): Promise<MeResponse> {
  const [user] = await ctx.db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new ApiCoreError("User not found", 404, "NOT_FOUND");

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    emailVerified: user.emailVerified,
    phoneCountryCode: user.phoneCountryCode,
    phoneNumber: user.phoneNumber,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function requireVerifiedEmail(ctx: ApiContext, userId: string): Promise<void> {
  const [user] = await ctx.db
    .select({ emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new ApiCoreError("User not found", 404, "NOT_FOUND");
  if (!user.emailVerified) {
    throw new ApiCoreError("Verify your email to use this feature", 403, "EMAIL_NOT_VERIFIED");
  }
}
