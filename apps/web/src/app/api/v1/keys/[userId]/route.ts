import { getPreKeyBundle } from "@vaultchat/api-core";
import { getApiContext, toApiError } from "@/lib/api";
import { jsonResponse } from "@/lib/response";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;
    const { searchParams } = new URL(request.url);
    const raw = searchParams.get("deviceId") ?? "1";
    const deviceId = Number(raw);
    if (!Number.isFinite(deviceId) || deviceId < 1) {
      return jsonResponse(
        { error: "Invalid deviceId", code: "INVALID_DEVICE_ID" },
        400
      );
    }
    const result = await getPreKeyBundle(getApiContext(), userId, deviceId);
    return jsonResponse(result);
  } catch (err) {
    const { body, status } = toApiError(err);
    return jsonResponse(body, status);
  }
}
