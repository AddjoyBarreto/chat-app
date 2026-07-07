import type { ApiError } from "@vaultchat/protocol";

export class ClientApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
    this.name = "ClientApiError";
  }
}

export async function parseApiResponse<T>(res: Response): Promise<T> {
  if (res.ok) return res.json() as Promise<T>;

  let message = res.statusText;
  let code: string | undefined;

  try {
    const body = (await res.json()) as ApiError;
    message = body.error ?? message;
    code = body.code;
  } catch {
    try {
      message = await res.text();
    } catch {
      // keep statusText
    }
  }

  throw new ClientApiError(message, res.status, code);
}

export function friendlyError(err: unknown): string {
  if (
    err instanceof Error &&
    (err.name === "DeviceIdentityMismatchError" || err.message === "DEVICE_IDENTITY_MISMATCH")
  ) {
    return "Encryption keys on this device are out of sync. Log out and sign in again to re-link this device.";
  }
  if (err instanceof ClientApiError) {
    if (err.status === 503 || err.code === "DB_BUSY") {
      return "Server is busy. Wait a few seconds and try again.";
    }
    if (err.status >= 500) {
      return "Server error. If this keeps happening, restart the API (pnpm dev:stack).";
    }
    switch (err.code) {
      case "USERNAME_TAKEN":
        return "That username is already taken.";
      case "EMAIL_TAKEN":
        return "That email is already registered.";
      case "PHONE_TAKEN":
        return "That phone number is already registered.";
      case "INVALID_EMAIL":
        return "Enter a valid email address.";
      case "INVALID_PASSWORD":
        return "Password must be at least 8 characters.";
      case "INVALID_PHONE":
        return "Enter a valid phone number for the selected country.";
      case "INVALID_CREDENTIALS":
        return "Invalid username/email or password.";
      case "EMAIL_NOT_VERIFIED":
        return "Please verify your email before signing in.";
      case "INVALID_USERNAME":
        return "Username must be 3–32 characters (letters, numbers, underscore).";
      case "NOT_FOUND":
        return "User not found.";
      case "INVALID_RECIPIENT":
        return "You can't message yourself.";
      case "NO_PREKEYS":
        return "This user hasn't set up encryption keys yet.";
      case "DEVICE_NOT_FOUND":
        return "Device not registered. Try logging out and back in.";
      case "MESSAGE_TOO_LARGE":
        return "Message is too large to send.";
      case "INVALID_MESSAGE":
        return "Message cannot be empty.";
      case "INVALID_CURSOR":
        return "Could not load older messages. Refresh and try again.";
      case "NOT_MEMBER":
        return "You are not a member of this group.";
      case "INVALID_GROUP_NAME":
        return "Group name must be 2–64 characters (letters, numbers, spaces, - or _).";
      case "MEMBER_NOT_FOUND":
        return "One or more group members were not found.";
      case "DM_FRIENDS_ONLY":
        return "This user only accepts DMs from friends.";
      case "BLOCKED":
        return "You cannot message this user.";
      case "YOU_BLOCKED":
        return "Unblock this user to send messages.";
      case "NOT_ADMIN":
        return "Admin access required.";
      case "ALREADY_MEMBER":
        return "That user is already in this community.";
      case "CHANNEL_ACCESS_DENIED":
        return "You do not have access to this channel.";
      case "INVALID_CHANNEL_NAME":
        return "Channel name must be 2–32 characters (lowercase letters, numbers, - or _).";
      case "INVITE_EXPIRED":
        return "This invite has expired.";
      case "INVITE_EXHAUSTED":
        return "This invite has reached its use limit.";
      case "ALREADY_FRIENDS":
        return "You are already friends.";
      case "REQUEST_PENDING":
        return "A friend request is already pending.";
      default:
        return err.message;
    }
  }
  if (err instanceof TypeError) {
    if (
      err.message === "Load failed" ||
      err.message === "Failed to fetch" ||
      err.message.includes("NetworkError")
    ) {
      return "Cannot reach VaultChat server. Run pnpm dev:stack, then restart the desktop app.";
    }
    return err.message;
  }
  if (err instanceof Error) {
    if (err.message === "Invalid signature") {
      return "Encryption session mismatch. Try sending a new message.";
    }
    return err.message;
  }
  return "Something went wrong.";
}

export function mapRegistrationError(err: unknown): import("./session.js").RegistrationFieldErrors {
  if (err instanceof ClientApiError) {
    switch (err.code) {
      case "USERNAME_TAKEN":
        return { username: "That username is already taken." };
      case "EMAIL_TAKEN":
        return { email: "That email is already registered." };
      case "PHONE_TAKEN":
        return { phoneNumber: "That phone number is already registered." };
      case "INVALID_USERNAME":
        return { username: err.message };
      case "INVALID_EMAIL":
        return { email: err.message };
      case "INVALID_PASSWORD":
        return { password: err.message };
      case "INVALID_PHONE":
        return { phoneNumber: err.message };
      default:
        return { form: friendlyError(err) };
    }
  }
  return { form: friendlyError(err) };
}

export function mapLoginError(err: unknown): import("./session.js").LoginFieldErrors {
  if (err instanceof ClientApiError) {
    switch (err.code) {
      case "INVALID_CREDENTIALS":
        return { form: "Invalid username/email or password." };
      case "EMAIL_NOT_VERIFIED":
        return { form: "Please verify your email before signing in." };
      default:
        return { form: friendlyError(err) };
    }
  }
  return { form: friendlyError(err) };
}
