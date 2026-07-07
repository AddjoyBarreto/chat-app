import { parseDiscordMarkdown } from "@vaultchat/client";

/** Whether composer should show a live markdown preview for this draft. */
export function messageHasMarkdownPreview(text: string): boolean {
  if (!text.trim()) return false;
  for (const block of parseDiscordMarkdown(text)) {
    if (block.type === "codeblock" || block.type === "quote") return true;
    if (block.runs.some((r) => r.bold || r.italic || r.strike || r.code || r.spoiler)) {
      return true;
    }
  }
  return false;
}
