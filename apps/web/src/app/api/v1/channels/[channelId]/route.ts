import { updateChannel, deleteChannel } from "@vaultchat/api-core";
import type { UpdateChannelRequest } from "@vaultchat/protocol";
import { getApiContext, getAuthFromHeader, toApiError } from "@/lib/api";
import { errorResponse, jsonResponse } from "@/lib/response";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const auth = await getAuthFromHeader(request.headers.get("authorization"));
    const { channelId } = await params;
    const body = (await request.json()) as UpdateChannelRequest;
    const result = await updateChannel(getApiContext(), auth.userId, channelId, body);
    return jsonResponse(result);
  } catch (err) {
    if ((err as { status?: number }).status === 401) return errorResponse("Unauthorized", 401);
    const { body, status } = toApiError(err);
    return jsonResponse(body, status);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const auth = await getAuthFromHeader(request.headers.get("authorization"));
    const { channelId } = await params;
    const result = await deleteChannel(getApiContext(), auth.userId, channelId);
    return jsonResponse(result);
  } catch (err) {
    if ((err as { status?: number }).status === 401) return errorResponse("Unauthorized", 401);
    const { body, status } = toApiError(err);
    return jsonResponse(body, status);
  }
}
