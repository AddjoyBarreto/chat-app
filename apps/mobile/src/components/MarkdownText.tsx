import { parseDiscordMarkdown, type MarkdownBlock, type MarkdownRun } from "@vaultchat/client";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "@/theme";

function SpoilerRun({ run }: { run: MarkdownRun }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <Pressable onPress={() => setRevealed(true)}>
      <Text style={[styles.spoiler, revealed && styles.spoilerRevealed]}>
        {revealed ? run.text : "spoiler"}
      </Text>
    </Pressable>
  );
}

function runStyle(run: MarkdownRun) {
  return [
    styles.run,
    run.bold && styles.bold,
    run.italic && styles.italic,
    run.strike && styles.strike,
    run.code && styles.code,
  ];
}

function renderRuns(runs: MarkdownRun[]) {
  return runs.map((run, i) => {
    if (run.spoiler) return <SpoilerRun key={i} run={run} />;
    return (
      <Text key={i} style={runStyle(run)}>
        {run.text}
      </Text>
    );
  });
}

function renderBlock(block: MarkdownBlock, key: number) {
  if (block.type === "codeblock") {
    return (
      <View key={key} style={styles.codeblock}>
        <Text style={styles.codeblockText}>{block.text}</Text>
      </View>
    );
  }
  if (block.type === "quote") {
    return (
      <View key={key} style={styles.quote}>
        {block.blocks.map((b, i) => renderBlock(b, i))}
      </View>
    );
  }
  return (
    <Text key={key} style={styles.paragraph}>
      {renderRuns(block.runs)}
    </Text>
  );
}

export function MarkdownText({ text, style }: { text: string; style?: object }) {
  const blocks = parseDiscordMarkdown(text);
  if (blocks.length === 0) return null;
  return <View style={style}>{blocks.map((block, i) => renderBlock(block, i))}</View>;
}

const styles = StyleSheet.create({
  paragraph: { color: theme.textPrimary, fontSize: 15, lineHeight: 22 },
  run: { color: theme.textPrimary },
  bold: { fontWeight: "700" },
  italic: { fontStyle: "italic" },
  strike: { textDecorationLine: "line-through" },
  code: {
    fontFamily: "Menlo",
    backgroundColor: theme.bgInput,
    borderRadius: 4,
  },
  spoiler: {
    backgroundColor: theme.bgInput,
    color: theme.bgInput,
    borderRadius: 4,
    overflow: "hidden",
  },
  spoilerRevealed: { color: theme.textPrimary },
  codeblock: {
    backgroundColor: theme.bgInput,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.sm,
    marginVertical: theme.spacing.xs,
  },
  codeblockText: {
    fontFamily: "Menlo",
    fontSize: 13,
    color: theme.textPrimary,
    lineHeight: 18,
  },
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: theme.textMuted,
    paddingLeft: theme.spacing.sm,
    marginVertical: 2,
  },
});
