import { kickCommunityMember } from "@vaultchat/api-core";
import { getApiContext, getAuthFromHeader, toApiError } from "@/lib/api";
import { errorResponse, jsonResponse } from "@/lib/response";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ communityId: string; userId: string }> }
) {
  try {
    const auth = await getAuthFromHeader(request.headers.get("authorization"));
    const { communityId, userId } = await params;
    const result = await kickCommunityMember(getApiContext(), auth.userId, communityId, userId);
    return jsonResponse(result);
  } catch (err) {
    if ((err as { status?: number }).status === 401) return errorResponse("Unauthorized", 401);
    const { body, status } = toApiError(err);
    return jsonResponse(body, status);
  }
}
