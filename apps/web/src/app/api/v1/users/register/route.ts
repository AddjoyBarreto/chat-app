import { registerUser } from "@vaultchat/api-core";
import type { RegisterUserRequest } from "@vaultchat/protocol";
import { getApiContext, toApiError } from "@/lib/api";
import { jsonResponse } from "@/lib/response";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RegisterUserRequest;
    const result = await registerUser(getApiContext(), body);
    return jsonResponse(result, 201);
  } catch (err) {
    const { body, status } = toApiError(err);
    return jsonResponse(body, status);
  }
}
