import { updateCommunity } from "@vaultchat/api-core";
import type { UpdateCommunityRequest } from "@vaultchat/protocol";
import { getApiContext, getAuthFromHeader, toApiError } from "@/lib/api";
import { errorResponse, jsonResponse } from "@/lib/response";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ communityId: string }> }
) {
  try {
    const auth = await getAuthFromHeader(request.headers.get("authorization"));
    const { communityId } = await params;
    const body = (await request.json()) as UpdateCommunityRequest;
    const result = await updateCommunity(getApiContext(), auth.userId, communityId, body);
    return jsonResponse(result);
  } catch (err) {
    if ((err as { status?: number }).status === 401) return errorResponse("Unauthorized", 401);
    const { body, status } = toApiError(err);
    return jsonResponse(body, status);
  }
}
