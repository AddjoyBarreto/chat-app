import { readLocalMedia } from "@vaultchat/api-core";
import { getAuthFromHeader } from "@/lib/api";
import { errorResponse } from "@/lib/response";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    await getAuthFromHeader(request.headers.get("authorization"));
    const { mediaId } = await params;
    const data = await readLocalMedia(mediaId);
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": "application/octet-stream" },
    });
  } catch (err) {
    if ((err as { status?: number }).status === 401) return errorResponse("Unauthorized", 401);
    return errorResponse("Not found", 404);
  }
}
