import type { BriefItem } from "./brief.ts";

/** Titles shorter than this are too generic to match on. */
const MIN_TITLE_CHARS = 15;

/** A title contained in a longer one only matches if it is at least this share of the longer one. */
const MIN_CONTAINED_SHARE = 0.5;

export function normalizeUrl(link: string): string {
  try {
    const url = new URL(link);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_")) {
        url.searchParams.delete(key);
      }
    }
    return `${url.hostname.toLowerCase().replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}${url.search}`;
  } catch {
    return link;
  }
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\(\d+ minute read\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Equal, or one is a whole-word part of the other and makes up at least half of it ("Introducing X" vs "X"). */
function titlesMatch(a: string, b: string): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < MIN_TITLE_CHARS) {
    return false;
  }
  return short === long || (` ${long} `.includes(` ${short} `) && short.length / long.length >= MIN_CONTAINED_SHARE);
}

/** The same story as it appeared in one or more sources. `item` is the first (newest) of `members`. */
export interface Group {
  item: BriefItem;
  members: BriefItem[];
}

/**
 * Merge items that are the same story: the same link once tracking is stripped, or matching titles.
 * Matches chain, so A=B and B=C puts all three together. Groups and members keep the input order.
 */
export function groupDuplicates(items: BriefItem[]): Group[] {
  const urls = items.map((item) => normalizeUrl(item.link));
  const titles = items.map((item) => normalizeTitle(item.title));
  const parent = items.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) {
      root = parent[root];
    }
    return root;
  };

  for (let i = 0; i < items.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      if (urls[i] === urls[j] || titlesMatch(titles[i], titles[j])) {
        parent[find(i)] = find(j);
      }
    }
  }

  const groups = new Map<number, Group>();
  items.forEach((item, index) => {
    const root = find(index);
    const group = groups.get(root);
    if (group === undefined) {
      groups.set(root, { item, members: [item] });
    } else {
      group.members.push(item);
    }
  });
  return [...groups.values()];
}
