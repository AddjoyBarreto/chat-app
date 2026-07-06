import { getUserByUsername } from "@vaultchat/api-core";
import { getApiContext, toApiError } from "@/lib/api";
import { jsonResponse } from "@/lib/response";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const result = await getUserByUsername(getApiContext(), username);
    return jsonResponse(result);
  } catch (err) {
    const { body, status } = toApiError(err);
    return jsonResponse(body, status);
  }
}
