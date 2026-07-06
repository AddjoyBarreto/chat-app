import { getMe } from "@vaultchat/api-core";
import { getApiContext, getAuthFromHeader, toApiError } from "@/lib/api";
import { jsonResponse } from "@/lib/response";

export async function GET(request: Request) {
  try {
    const auth = await getAuthFromHeader(request.headers.get("authorization"));
    const result = await getMe(getApiContext(), auth.userId);
    return jsonResponse(result);
  } catch (err) {
    const { body, status } = toApiError(err);
    return jsonResponse(body, status);
  }
}
