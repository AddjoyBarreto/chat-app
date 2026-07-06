import { verifyEmail } from "@vaultchat/api-core";
import { getApiContext, toApiError } from "@/lib/api";
import { jsonResponse } from "@/lib/response";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { token?: string };
    const result = await verifyEmail(getApiContext(), body.token ?? "");
    return jsonResponse(result);
  } catch (err) {
    const { body, status } = toApiError(err);
    return jsonResponse(body, status);
  }
}
