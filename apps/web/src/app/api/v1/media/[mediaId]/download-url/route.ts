import { createMediaDownloadUrl } from "@vaultchat/api-core";
import { getApiContext, getAuthFromHeader, toApiError } from "@/lib/api";
import { errorResponse, jsonResponse } from "@/lib/response";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const auth = await getAuthFromHeader(_request.headers.get("authorization"));
    const { mediaId } = await params;
    const result = await createMediaDownloadUrl(getApiContext(), auth.userId, mediaId);
    return jsonResponse(result);
  } catch (err) {
    if ((err as { status?: number }).status === 401) return errorResponse("Unauthorized", 401);
    const { body, status } = toApiError(err);
    return jsonResponse(body, status);
  }
}
