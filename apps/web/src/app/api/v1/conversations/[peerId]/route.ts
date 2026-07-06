import { getConversation } from "@vaultchat/api-core";
import { getApiContext, getAuthFromHeader, toApiError } from "@/lib/api";
import { errorResponse, jsonResponse } from "@/lib/response";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ peerId: string }> }
) {
  try {
    const auth = await getAuthFromHeader(request.headers.get("authorization"));
    const { peerId } = await params;
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor") ?? undefined;
    const limit = Number(searchParams.get("limit") ?? "50");
    const result = await getConversation(
      getApiContext(),
      auth.userId,
      peerId,
      cursor,
      limit
    );
    return jsonResponse(result);
  } catch (err) {
    if ((err as { status?: number }).status === 401) {
      return errorResponse("Unauthorized", 401);
    }
    const { body, status } = toApiError(err);
    return jsonResponse(body, status);
  }
}
