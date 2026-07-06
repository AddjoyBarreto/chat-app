import { storeLocalMedia } from "@vaultchat/api-core";
import { getAuthFromHeader, toApiError } from "@/lib/api";
import { errorResponse, jsonResponse } from "@/lib/response";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    await getAuthFromHeader(request.headers.get("authorization"));
    const { mediaId } = await params;
    const data = Buffer.from(await request.arrayBuffer());
    await storeLocalMedia(mediaId, data);
    return jsonResponse({ ok: true });
  } catch (err) {
    if ((err as { status?: number }).status === 401) return errorResponse("Unauthorized", 401);
    const { body, status } = toApiError(err);
    return jsonResponse(body, status);
  }
}
