import { loginUser } from "@vaultchat/api-core";
import type { LoginUserRequest } from "@vaultchat/protocol";
import { getApiContext, toApiError } from "@/lib/api";
import { jsonResponse } from "@/lib/response";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LoginUserRequest;
    const result = await loginUser(getApiContext(), body);
    return jsonResponse(result);
  } catch (err) {
    const { body, status } = toApiError(err);
    return jsonResponse(body, status);
  }
}
