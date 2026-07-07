/** Discord-style message body limit (plaintext before encryption). */
export const MAX_MESSAGE_TEXT_LENGTH = 2000;

export const MESSAGE_MARKDOWN_HINT =
  "**bold** · *italic* · ~~strike~~ · `code` · ||spoiler|| · ```block``` · > quote";

export function validateMessageText(text: string): string | null {
  if (!text.trim()) return "Message cannot be empty";
  if (text.length > MAX_MESSAGE_TEXT_LENGTH) {
    return `Message is too long (max ${MAX_MESSAGE_TEXT_LENGTH.toLocaleString()} characters)`;
  }
  return null;
}

export function remainingMessageChars(text: string): number {
  return MAX_MESSAGE_TEXT_LENGTH - text.length;
}

export function clampMessageText(text: string): string {
  return text.length > MAX_MESSAGE_TEXT_LENGTH ? text.slice(0, MAX_MESSAGE_TEXT_LENGTH) : text;
}
