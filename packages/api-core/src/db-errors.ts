import { ApiCoreError } from "./errors.js";

interface PostgresErrorLike {
  code?: string;
  constraint_name?: string;
  constraint?: string;
}

function asPostgresError(err: unknown): PostgresErrorLike | null {
  if (!err || typeof err !== "object") return null;
  const direct = err as PostgresErrorLike;
  if (direct.code === "23505") return direct;
  const cause = (err as { cause?: PostgresErrorLike }).cause;
  if (cause?.code === "23505") return cause;
  return null;
}

export function throwIfUniqueViolation(err: unknown): never {
  const pg = asPostgresError(err);
  if (!pg) throw err;

  const constraint = pg.constraint_name ?? pg.constraint ?? "";
  if (constraint.includes("username")) {
    throw new ApiCoreError("Username already taken", 409, "USERNAME_TAKEN");
  }
  if (constraint.includes("email")) {
    throw new ApiCoreError("Email already registered", 409, "EMAIL_TAKEN");
  }
  if (constraint.includes("phone")) {
    throw new ApiCoreError("Phone number already registered", 409, "PHONE_TAKEN");
  }
  throw new ApiCoreError("Account already exists", 409, "DUPLICATE_ACCOUNT");
}
