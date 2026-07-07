import { setDmReadState } from "@vaultchat/api-core";
import { getApiContext, getAuthFromHeader, toApiError } from "@/lib/api";
import { errorResponse, jsonResponse } from "@/lib/response";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ peerId: string }> }
) {
  try {
    const auth = await getAuthFromHeader(request.headers.get("authorization"));
    const { peerId } = await params;
    const body = (await request.json()) as { lastReadAt: string };
    const result = await setDmReadState(getApiContext(), auth.userId, peerId, body);
    return jsonResponse(result);
  } catch (err) {
    if ((err as { status?: number }).status === 401) {
      return errorResponse("Unauthorized", 401);
    }
    const { body, status } = toApiError(err);
    return jsonResponse(body, status);
  }
}
