import type { HealthResponse } from "@vaultchat/protocol";
import { jsonResponse } from "@/lib/response";

export async function GET() {
  const body: HealthResponse = {
    status: "ok",
    version: "0.0.1",
    service: "vaultchat-api",
  };
  return jsonResponse(body);
}
