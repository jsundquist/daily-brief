import assert from "node:assert/strict";
import { test } from "node:test";
import type { BriefItem } from "../src/brief.ts";
import { groupDuplicates, normalizeTitle, normalizeUrl } from "../src/dedupe.ts";

function item(source: string, title: string, link: string): BriefItem {
  return { type: "newsletter", source, title, link, published: "2026-11-15T05:00:00.000Z", summary: "", done: false };
}

test("tracking parameters, fragments, www and trailing slashes do not make links differ", () => {
  assert.equal(normalizeUrl("https://www.Example.com/post/?utm_source=tldr&ref=x#top"), normalizeUrl("https://example.com/post?ref=x"));
  assert.notEqual(normalizeUrl("https://example.com/a"), normalizeUrl("https://example.com/b"));
});

test("reading-time suffixes and punctuation do not make titles differ", () => {
  assert.equal(normalizeTitle("Gemini 4 Hydrogen (6 minute read)"), normalizeTitle("Gemini 4: Hydrogen"));
});

test("items with the same link are one group, in first-seen order", () => {
  const a = item("TLDR Dev", "Story A", "https://example.com/a?utm_source=tldr");
  const b = item("TLDR AI", "A different headline", "https://example.com/a");
  const c = item("InfoQ", "Other", "https://example.com/c");
  const groups = groupDuplicates([a, b, c]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].members, [a, b]);
  assert.equal(groups[0].item, a);
});

test("items with the same title are one group even when the links differ", () => {
  const a = item("TLDR Dev", "Introducing Gemini 4 Hydrogen", "https://blog.google/x");
  const b = item("TLDR AI", "Introducing Gemini 4 Hydrogen (6 minute read)", "https://deepmind.google/y");
  assert.equal(groupDuplicates([a, b]).length, 1);
});

test("a title that is the main part of a longer one matches it", () => {
  const a = item("TLDR Dev", "Introducing Gemini 4 Hydrogen", "https://blog.google/x");
  const b = item("TLDR AI", "Gemini 4 Hydrogen", "https://deepmind.google/y");
  assert.equal(groupDuplicates([a, b]).length, 1);
});

test("a title that is only a small part of a longer one does not match", () => {
  const a = item("A", "Rust 1.100.0 released with a never type, allocator APIs and many more changes", "https://example.com/1");
  const b = item("B", "Rust 1.100.0 released", "https://example.com/2");
  assert.equal(groupDuplicates([a, b]).length, 2);
});

test("a chain of matches joins into one group", () => {
  const a = item("A", "Same title here today", "https://example.com/1");
  const b = item("B", "Same title here today", "https://example.com/2");
  const c = item("C", "Totally different words", "https://example.com/2");
  assert.equal(groupDuplicates([a, b, c]).length, 1);
});

test("very short titles are not used to merge", () => {
  const a = item("A", "Relax", "https://example.com/1");
  const b = item("B", "Relax", "https://example.com/2");
  assert.equal(groupDuplicates([a, b]).length, 2);
});

test("distinct items stay separate", () => {
  assert.equal(groupDuplicates([item("A", "One thing entirely", "https://example.com/1"), item("B", "Another thing entirely", "https://example.com/2")]).length, 2);
});
