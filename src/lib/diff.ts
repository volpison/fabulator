/**
 * Text diff for comparing a snapshot with the current scene.
 *
 * Two passes so it stays fast on long scenes: first paragraphs are matched
 * (exact LCS), then only the paragraphs that changed are compared word by
 * word. If a changed block is huge the word pass is skipped and it is shown
 * as one removal plus one addition (still correct, just coarser).
 */

import { countWordsInText } from "./wordcount";

export type DiffSegment = { type: "equal" | "add" | "del"; text: string };

export type DiffResult = {
  segments: DiffSegment[];
  /** Words that appear only in the new text / only in the old text. */
  added: number;
  removed: number;
  changed: boolean;
};

/** Max DP table size (cells) before falling back to a coarse diff. */
const MAX_CELLS = 4_000_000;

type Op<T> = { type: "equal" | "del" | "add"; value: T };

/** Generic sequence diff (LCS). Trims common ends first. */
function diffSeq<T>(a: T[], b: T[], maxCells = MAX_CELLS): Op<T>[] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const ops: Op<T>[] = [];
  for (let i = 0; i < start; i++) ops.push({ type: "equal", value: a[i] });

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const la = midA.length;
  const lb = midB.length;

  if (la === 0) {
    for (const v of midB) ops.push({ type: "add", value: v });
  } else if (lb === 0) {
    for (const v of midA) ops.push({ type: "del", value: v });
  } else if ((la + 1) * (lb + 1) > maxCells) {
    for (const v of midA) ops.push({ type: "del", value: v });
    for (const v of midB) ops.push({ type: "add", value: v });
  } else {
    const w = lb + 1;
    const t = new Uint32Array((la + 1) * w);
    for (let i = la - 1; i >= 0; i--) {
      for (let j = lb - 1; j >= 0; j--) {
        t[i * w + j] =
          midA[i] === midB[j]
            ? t[(i + 1) * w + j + 1] + 1
            : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < la && j < lb) {
      if (midA[i] === midB[j]) {
        ops.push({ type: "equal", value: midA[i] });
        i++;
        j++;
      } else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) {
        ops.push({ type: "del", value: midA[i++] });
      } else {
        ops.push({ type: "add", value: midB[j++] });
      }
    }
    while (i < la) ops.push({ type: "del", value: midA[i++] });
    while (j < lb) ops.push({ type: "add", value: midB[j++] });
  }

  for (let i = endA; i < a.length; i++) ops.push({ type: "equal", value: a[i] });
  return ops;
}

const TOKEN = /\n|[^\S\n]+|[\p{L}\p{N}_'’]+|[^\s\p{L}\p{N}_'’]/gu;
const tokenize = (s: string): string[] => s.match(TOKEN) ?? [];
const WORD = /[\p{L}\p{N}]+/gu;

export function countWords(text: string): number {
  return countWordsInText(text);
}

function push(out: DiffSegment[], type: DiffSegment["type"], text: string) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.type === type) last.text += text;
  else out.push({ type, text });
}

function wordDiff(a: string, b: string, out: DiffSegment[], maxCells: number) {
  for (const op of diffSeq(tokenize(a), tokenize(b), maxCells)) {
    push(out, op.type, op.value);
  }
}

/** Diff of two plain texts (paragraphs separated by "\n"). */
export function diffText(
  oldText: string,
  newText: string,
  maxCells: number = MAX_CELLS
): DiffResult {
  const segments: DiffSegment[] = [];
  const paraOps = diffSeq(oldText.split("\n"), newText.split("\n"), maxCells);

  let dels: string[] = [];
  let adds: string[] = [];
  const flush = () => {
    if (dels.length && adds.length) {
      wordDiff(dels.join("\n"), adds.join("\n"), segments, maxCells);
      push(segments, "equal", "\n");
    } else if (dels.length) {
      push(segments, "del", dels.map((p) => p + "\n").join(""));
    } else if (adds.length) {
      push(segments, "add", adds.map((p) => p + "\n").join(""));
    }
    dels = [];
    adds = [];
  };

  for (const op of paraOps) {
    if (op.type === "equal") {
      flush();
      push(segments, "equal", op.value + "\n");
    } else if (op.type === "del") {
      dels.push(op.value);
    } else {
      adds.push(op.value);
    }
  }
  flush();

  let added = 0;
  let removed = 0;
  for (const s of segments) {
    if (s.type === "add") added += countWords(s.text);
    else if (s.type === "del") removed += countWords(s.text);
  }
  return { segments, added, removed, changed: segments.some((s) => s.type !== "equal") };
}
