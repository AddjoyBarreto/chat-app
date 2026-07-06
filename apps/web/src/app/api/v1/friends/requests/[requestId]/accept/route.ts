import { acceptFriendRequest } from "@vaultchat/api-core";
import { getApiContext, getAuthFromHeader, toApiError } from "@/lib/api";
import { errorResponse, jsonResponse } from "@/lib/response";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const auth = await getAuthFromHeader(_request.headers.get("authorization"));
    const { requestId } = await params;
    const result = await acceptFriendRequest(getApiContext(), auth.userId, requestId);
    return jsonResponse(result);
  } catch (err) {
    if ((err as { status?: number }).status === 401) return errorResponse("Unauthorized", 401);
    const { body, status } = toApiError(err);
    return jsonResponse(body, status);
  }
}
