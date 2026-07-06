import { blockUser, listBlocks } from "@vaultchat/api-core";
import { getApiContext, getAuthFromHeader, toApiError } from "@/lib/api";
import { errorResponse, jsonResponse } from "@/lib/response";

export async function GET(request: Request) {
  try {
    const auth = await getAuthFromHeader(request.headers.get("authorization"));
    const result = await listBlocks(getApiContext(), auth.userId);
    return jsonResponse(result);
  } catch (err) {
    if ((err as { status?: number }).status === 401) return errorResponse("Unauthorized", 401);
    const { body, status } = toApiError(err);
    return jsonResponse(body, status);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthFromHeader(request.headers.get("authorization"));
    const body = (await request.json()) as { username: string };
    const result = await blockUser(getApiContext(), auth.userId, body.username);
    return jsonResponse(result, 201);
  } catch (err) {
    if ((err as { status?: number }).status === 401) return errorResponse("Unauthorized", 401);
    const { body, status } = toApiError(err);
    return jsonResponse(body, status);
  }
}
