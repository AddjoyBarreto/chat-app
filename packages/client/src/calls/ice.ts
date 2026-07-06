import type { IceServersResponse } from "@vaultchat/protocol";
import { getClientConfig } from "../config.js";
import { parseApiResponse } from "../errors.js";

export async function fetchIceServers(token: string): Promise<RTCIceServer[]> {
  const res = await fetch(`${getClientConfig().apiBaseUrl}/api/v1/calls/ice-servers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await parseApiResponse<IceServersResponse>(res);
  return data.iceServers as RTCIceServer[];
}
