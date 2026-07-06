import { redeemInvite } from "@vaultchat/api-core";
import { getApiContext, getAuthFromHeader, toApiError } from "@/lib/api";
import { errorResponse, jsonResponse } from "@/lib/response";

export async function POST(request: Request) {
  try {
    const auth = await getAuthFromHeader(request.headers.get("authorization"));
    const body = (await request.json()) as { code: string };
    const result = await redeemInvite(getApiContext(), auth.userId, body.code);
    return jsonResponse(result);
  } catch (err) {
    if ((err as { status?: number }).status === 401) return errorResponse("Unauthorized", 401);
    const { body, status } = toApiError(err);
    return jsonResponse(body, status);
  }
}
