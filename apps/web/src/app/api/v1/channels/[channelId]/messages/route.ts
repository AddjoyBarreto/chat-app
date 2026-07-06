import { getChannelMessages, sendChannelMessage } from "@vaultchat/api-core";
import type { SendChannelMessageRequest } from "@vaultchat/protocol";
import { getApiContext, getAuthFromHeader, toApiError } from "@/lib/api";
import { errorResponse, jsonResponse } from "@/lib/response";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const auth = await getAuthFromHeader(request.headers.get("authorization"));
    const { channelId } = await params;
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor") ?? undefined;
    const limit = Number(searchParams.get("limit") ?? "50");
    const result = await getChannelMessages(
      getApiContext(),
      auth.userId,
      channelId,
      cursor,
      limit
    );
    return jsonResponse(result);
  } catch (err) {
    if ((err as { status?: number }).status === 401) return errorResponse("Unauthorized", 401);
    const { body, status } = toApiError(err);
    return jsonResponse(body, status);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const auth = await getAuthFromHeader(request.headers.get("authorization"));
    const { channelId } = await params;
    const body = (await request.json()) as SendChannelMessageRequest;
    const result = await sendChannelMessage(
      getApiContext(),
      auth.userId,
      auth.deviceId,
      channelId,
      body
    );
    return jsonResponse(result, 201);
  } catch (err) {
    if ((err as { status?: number }).status === 401) return errorResponse("Unauthorized", 401);
    const { body, status } = toApiError(err);
    return jsonResponse(body, status);
  }
}
