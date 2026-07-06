import { getInbox, sendMessage } from "@vaultchat/api-core";
import type { SendMessageRequest } from "@vaultchat/protocol";
import { getApiContext, getAuthFromHeader, toApiError } from "@/lib/api";
import { errorResponse, jsonResponse } from "@/lib/response";

export async function POST(request: Request) {
  try {
    const auth = await getAuthFromHeader(request.headers.get("authorization"));
    const body = (await request.json()) as SendMessageRequest;
    const result = await sendMessage(getApiContext(), auth.userId, auth.deviceId, body);
    return jsonResponse(result, 201);
  } catch (err) {
    if ((err as { status?: number }).status === 401) {
      return errorResponse("Unauthorized", 401);
    }
    const { body, status } = toApiError(err);
    return jsonResponse(body, status);
  }
}

export async function GET(request: Request) {
  try {
    const auth = await getAuthFromHeader(request.headers.get("authorization"));
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor") ?? undefined;
    const limit = Number(searchParams.get("limit") ?? "50");
    const result = await getInbox(getApiContext(), auth.userId, cursor, limit);
    return jsonResponse(result);
  } catch (err) {
    if ((err as { status?: number }).status === 401) {
      return errorResponse("Unauthorized", 401);
    }
    const { body, status } = toApiError(err);
    return jsonResponse(body, status);
  }
}
