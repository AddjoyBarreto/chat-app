/** Parsed inline span — Discord-style markdown (stored as plain text, rendered client-side). */
export interface MarkdownRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  spoiler?: boolean;
}

export type MarkdownBlock =
  | { type: "paragraph"; runs: MarkdownRun[] }
  | { type: "codeblock"; text: string }
  | { type: "quote"; blocks: MarkdownBlock[] };

type Delimiter = {
  open: string;
  close: string;
  style: Partial<Pick<MarkdownRun, "bold" | "italic" | "strike" | "code" | "spoiler">>;
};

const INLINE_DELIMS: Delimiter[] = [
  { open: "||", close: "||", style: { spoiler: true } },
  { open: "***", close: "***", style: { bold: true, italic: true } },
  { open: "**", close: "**", style: { bold: true } },
  { open: "__", close: "__", style: { bold: true } },
  { open: "~~", close: "~~", style: { strike: true } },
  { open: "*", close: "*", style: { italic: true } },
  { open: "_", close: "_", style: { italic: true } },
  { open: "`", close: "`", style: { code: true } },
];

function mergeStyle(
  base: Partial<MarkdownRun>,
  extra: Partial<MarkdownRun>
): Partial<MarkdownRun> {
  return {
    bold: base.bold || extra.bold,
    italic: base.italic || extra.italic,
    strike: base.strike || extra.strike,
    code: base.code || extra.code,
    spoiler: base.spoiler || extra.spoiler,
  };
}

function pushRun(runs: MarkdownRun[], text: string, style: Partial<MarkdownRun>) {
  if (!text) return;
  const last = runs[runs.length - 1];
  const same =
    last &&
    !!last.bold === !!style.bold &&
    !!last.italic === !!style.italic &&
    !!last.strike === !!style.strike &&
    !!last.code === !!style.code &&
    !!last.spoiler === !!style.spoiler;
  if (same && last) {
    last.text += text;
    return;
  }
  runs.push({
    text,
    bold: style.bold,
    italic: style.italic,
    strike: style.strike,
    code: style.code,
    spoiler: style.spoiler,
  });
}

export function parseInlineMarkdown(input: string, inherited: Partial<MarkdownRun> = {}): MarkdownRun[] {
  const runs: MarkdownRun[] = [];
  let i = 0;

  while (i < input.length) {
    if (input[i] === "`" && !inherited.code) {
      const end = input.indexOf("`", i + 1);
      if (end !== -1) {
        pushRun(runs, input.slice(i + 1, end), mergeStyle(inherited, { code: true }));
        i = end + 1;
        continue;
      }
    }

    let matched = false;
    for (const delim of INLINE_DELIMS) {
      if (delim.style.code) continue;
      if (!input.startsWith(delim.open, i)) continue;
      const closeAt = input.indexOf(delim.close, i + delim.open.length);
      if (closeAt === -1) continue;
      const inner = input.slice(i + delim.open.length, closeAt);
      const nested = parseInlineMarkdown(inner, mergeStyle(inherited, delim.style));
      for (const run of nested) {
        pushRun(runs, run.text, run);
      }
      i = closeAt + delim.close.length;
      matched = true;
      break;
    }
    if (matched) continue;

    let next = input.length;
    for (const delim of INLINE_DELIMS) {
      const at = input.indexOf(delim.open, i + 1);
      if (at !== -1 && at < next) next = at;
    }
    pushRun(runs, input.slice(i, next), inherited);
    i = next;
  }

  return runs;
}

function parseBlocks(text: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const parts = text.split("```");
  for (let p = 0; p < parts.length; p++) {
    const chunk = parts[p]!;
    if (p % 2 === 1) {
      const nl = chunk.indexOf("\n");
      const body = (nl === -1 ? chunk : chunk.slice(nl + 1)).replace(/\n$/, "");
      blocks.push({ type: "codeblock", text: body });
      continue;
    }
    const lines = chunk.split("\n");
    for (const line of lines) {
      if (!line && blocks.length === 0) continue;
      if (line.startsWith("> ")) {
        const quoteBody = line.slice(2);
        blocks.push({
          type: "quote",
          blocks: [{ type: "paragraph", runs: parseInlineMarkdown(quoteBody) }],
        });
        continue;
      }
      if (!line.trim() && blocks[blocks.length - 1]?.type === "paragraph") {
        blocks.push({ type: "paragraph", runs: [] });
        continue;
      }
      blocks.push({ type: "paragraph", runs: parseInlineMarkdown(line) });
    }
  }
  return blocks.filter(
    (b) => b.type === "codeblock" || b.type === "quote" || b.runs.some((r) => r.text.length > 0)
  );
}

/** True when text contains Discord-style markdown that will render differently. */
export function hasMarkdownSyntax(text: string): boolean {
  if (!text.trim()) return false;
  for (const block of parseDiscordMarkdown(text)) {
    if (block.type === "codeblock" || block.type === "quote") return true;
    if (block.runs.some((r) => r.bold || r.italic || r.strike || r.code || r.spoiler)) {
      return true;
    }
  }
  return false;
}

/** Parse Discord-style markdown into render blocks. */
export function parseDiscordMarkdown(text: string): MarkdownBlock[] {
  if (!text) return [];
  return parseBlocks(text);
}
