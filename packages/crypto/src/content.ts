import type { MessageContent } from "@vaultchat/protocol";

const VALID_TYPES = new Set<MessageContent["type"]>([
  "text",
  "image",
  "video",
  "media",
  "group_key",
]);

export function serializeMessageContent(content: MessageContent): string {
  return JSON.stringify(content);
}

function isMessageContent(value: unknown): value is MessageContent {
  if (!value || typeof value !== "object") return false;
  const type = (value as MessageContent).type;
  return typeof type === "string" && VALID_TYPES.has(type as MessageContent["type"]);
}

export function parseMessageContent(plaintext: string): MessageContent {
  try {
    const parsed: unknown = JSON.parse(plaintext);
    if (isMessageContent(parsed)) return parsed;
  } catch {
    // fall through — legacy plain text messages
  }
  return { type: "text", text: plaintext };
}
