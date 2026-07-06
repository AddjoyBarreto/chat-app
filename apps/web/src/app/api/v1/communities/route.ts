import { createGroup, listUserGroups } from "@vaultchat/api-core";
import type { CreateGroupRequest } from "@vaultchat/protocol";
import { getApiContext, getAuthFromHeader, toApiError } from "@/lib/api";
import { errorResponse, jsonResponse } from "@/lib/response";

export async function GET(request: Request) {
  try {
    const auth = await getAuthFromHeader(request.headers.get("authorization"));
    const communities = await listUserGroups(getApiContext(), auth.userId);
    return jsonResponse({ communities });
  } catch (err) {
    if ((err as { status?: number }).status === 401) return errorResponse("Unauthorized", 401);
    const { body, status } = toApiError(err);
    return jsonResponse(body, status);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthFromHeader(request.headers.get("authorization"));
    const body = (await request.json()) as CreateGroupRequest;
    const community = await createGroup(getApiContext(), auth.userId, body);
    return jsonResponse(community, 201);
  } catch (err) {
    if ((err as { status?: number }).status === 401) return errorResponse("Unauthorized", 401);
    const { body, status } = toApiError(err);
    return jsonResponse(body, status);
  }
}
