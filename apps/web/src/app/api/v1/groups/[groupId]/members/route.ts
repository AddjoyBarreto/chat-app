import { getGroupMembers } from "@vaultchat/api-core";
import { getApiContext, getAuthFromHeader, toApiError } from "@/lib/api";
import { errorResponse, jsonResponse } from "@/lib/response";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const auth = await getAuthFromHeader(request.headers.get("authorization"));
    const { groupId } = await params;
    const members = await getGroupMembers(getApiContext(), auth.userId, groupId);
    return jsonResponse({ members });
  } catch (err) {
    if ((err as { status?: number }).status === 401) return errorResponse("Unauthorized", 401);
    const { body, status } = toApiError(err);
    return jsonResponse(body, status);
  }
}
