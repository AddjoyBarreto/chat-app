"use client";

import { parseDiscordMarkdown, type MarkdownBlock, type MarkdownRun } from "@vaultchat/client";
import { useState, type CSSProperties, type ReactNode } from "react";

function runClassName(run: MarkdownRun): string {
  const parts = ["vc-md"];
  if (run.bold) parts.push("vc-md--bold");
  if (run.italic) parts.push("vc-md--italic");
  if (run.strike) parts.push("vc-md--strike");
  if (run.code) parts.push("vc-md--code");
  if (run.spoiler) parts.push("vc-md--spoiler");
  return parts.join(" ");
}

function SpoilerRun({ run }: { run: MarkdownRun }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <span
      className={`vc-md vc-md--spoiler${revealed ? " vc-md--spoiler-revealed" : ""}`}
      onClick={() => setRevealed(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setRevealed(true);
        }
      }}
      role="button"
      tabIndex={0}
    >
      {revealed ? run.text : "spoiler"}
    </span>
  );
}

function renderRuns(runs: MarkdownRun[]): ReactNode[] {
  return runs.map((run, i) => {
    if (run.spoiler) return <SpoilerRun key={i} run={run} />;
    return (
      <span key={i} className={runClassName(run)}>
        {run.text}
      </span>
    );
  });
}

function renderBlock(block: MarkdownBlock, key: number): ReactNode {
  if (block.type === "codeblock") {
    return (
      <pre key={key} className="vc-md-pre">
        <code>{block.text}</code>
      </pre>
    );
  }
  if (block.type === "quote") {
    return (
      <blockquote key={key} className="vc-md-quote">
        {block.blocks.map((b, i) => renderBlock(b, i))}
      </blockquote>
    );
  }
  return (
    <p key={key} className="vc-md-p">
      {renderRuns(block.runs)}
    </p>
  );
}

export function MarkdownText({
  text,
  className,
  style,
}: {
  text: string;
  className?: string;
  style?: CSSProperties;
}) {
  const blocks = parseDiscordMarkdown(text);
  if (blocks.length === 0) return null;
  return (
    <span className={className} style={style}>
      {blocks.map((block, i) => renderBlock(block, i))}
    </span>
  );
}
