import { uploadPreKeys } from "@vaultchat/api-core";
import type { UploadPreKeysRequest } from "@vaultchat/protocol";
import { getApiContext, getAuthFromHeader, toApiError } from "@/lib/api";
import { errorResponse, jsonResponse } from "@/lib/response";

export async function POST(request: Request) {
  try {
    const auth = await getAuthFromHeader(request.headers.get("authorization"));
    const body = (await request.json()) as UploadPreKeysRequest;
    const result = await uploadPreKeys(getApiContext(), auth.userId, auth.deviceId, body);
    return jsonResponse(result);
  } catch (err) {
    if ((err as { status?: number }).status === 401) {
      return errorResponse("Unauthorized", 401);
    }
    const { body, status } = toApiError(err);
    return jsonResponse(body, status);
  }
}
