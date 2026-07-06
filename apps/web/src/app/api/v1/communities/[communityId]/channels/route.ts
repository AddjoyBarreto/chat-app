import { createChannel, listChannels } from "@vaultchat/api-core";
import type { CreateChannelRequest } from "@vaultchat/protocol";
import { getApiContext, getAuthFromHeader, toApiError } from "@/lib/api";
import { errorResponse, jsonResponse } from "@/lib/response";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ communityId: string }> }
) {
  try {
    const auth = await getAuthFromHeader(request.headers.get("authorization"));
    const { communityId } = await params;
    const result = await listChannels(getApiContext(), auth.userId, communityId);
    return jsonResponse(result);
  } catch (err) {
    if ((err as { status?: number }).status === 401) return errorResponse("Unauthorized", 401);
    const { body, status } = toApiError(err);
    return jsonResponse(body, status);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ communityId: string }> }
) {
  try {
    const auth = await getAuthFromHeader(request.headers.get("authorization"));
    const { communityId } = await params;
    const body = (await request.json()) as CreateChannelRequest;
    const result = await createChannel(getApiContext(), auth.userId, communityId, body);
    return jsonResponse(result, 201);
  } catch (err) {
    if ((err as { status?: number }).status === 401) return errorResponse("Unauthorized", 401);
    const { body, status } = toApiError(err);
    return jsonResponse(body, status);
  }
}
