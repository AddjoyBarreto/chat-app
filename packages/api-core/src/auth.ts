import { SignJWT, jwtVerify } from "jose";

export interface AuthClaims {
  sub: string;
  deviceId: number;
}

export async function createToken(
  secret: string,
  userId: string,
  deviceId: number,
  expiresIn = "30d"
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ deviceId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

export async function verifyToken(secret: string, token: string): Promise<AuthClaims> {
  const key = new TextEncoder().encode(secret);
  const { payload } = await jwtVerify(token, key);
  if (!payload.sub) throw new Error("Invalid token: missing subject");
  const deviceId = payload.deviceId;
  if (typeof deviceId !== "number") throw new Error("Invalid token: missing deviceId");
  return { sub: payload.sub, deviceId };
}
