import { test } from "node:test";
import assert from "node:assert/strict";
import { sources } from "../src/sources.ts";

test("the seeded config lists the verified feeds and none of the dropped sources", () => {
  const names = sources.map((source) => source.name);
  for (const expected of [
    "Syntax",
    "The Changelog",
    "Go Time",
    "Practical AI",
    "Ship It!",
    "Latent Space (podcast)",
    "Latent Space (newsletter)",
    "Kubernetes Podcast from Google",
    "CNCF",
    "TLDR Tech",
    "TLDR Dev",
    "TLDR DevOps",
    "TLDR AI",
    "TLDR InfoSec",
    "TLDR IT",
    "TLDR Fintech",
    "Node Weekly",
    "JavaScript Weekly",
    "Console.dev",
    "The Pragmatic Engineer",
    "InfoQ",
  ]) {
    assert.ok(names.includes(expected), `missing ${expected}`);
  }
  for (const dropped of ["Hacker News", "Python Weekly", "DevOps Weekly", "KubeWeekly", "The Batch", "Test & Code"]) {
    assert.ok(!names.includes(dropped), `${dropped} should be absent`);
  }
  assert.equal(new Set(names).size, names.length);
  assert.equal(sources.find((source) => source.name === "CNCF")?.type, "youtube");
});
