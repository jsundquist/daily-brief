---
name: daily-brief
description: Give the user their daily brief of the most interesting things to read, watch or hear, picked from their feeds (podcasts, YouTube, newsletters, news) and grouped by their topic areas. Use when the user says "good morning", asks for their daily brief, or asks what they should look at today.
---

# Daily brief

The user runs a local aggregator (the `daily-brief` project) that fetches their feeds hourly. Your job is to read what it holds and tell them what is worth their time, by topic.

## Steps

1. Fetch the items: `curl -s http://localhost:3000/brief.json`. If it fails, say the server is not running and that `npm start` in the daily-brief project starts it. Stop there; do not make up a brief.
2. Read `profile.md` in this skill's directory. It lists the user's topics, what they care about and what to skip.
3. Consider only items with `done: false`. Struck-through items are already read or skipped.
4. Place each item under at most one topic from the profile. Drop items that fit no topic, unless they are a major story.
5. Within a topic, pick the few that best match what the profile says to care about. Fewer, better picks beat a long list: normally 2 to 5 per topic, none if nothing earns a place.
6. When several items cover the same story, merge them into one entry that names every source. A story covered by three or more sources is a trend: list those first, under "Across your sources", before the topic sections.
7. Skip sponsored content, event and conference promotion, and pure product marketing.

## Output

- Start with a one-line greeting and how many items you considered (and how many were already struck through).
- Each entry is one line: the title as a link, the source in parentheses, then a short reason it matters to this user. Say why, using their profile; do not paraphrase the summary.
- Judge only from the title and summary in the data. If a pick rests on a title alone, say so. Do not claim to know an article's contents.
- Finish by offering to open any entry for a deeper read. Fetch an article only when asked.

## Do not

- Do not change state: never call `/toggle` or `/refresh`.
- Do not invent items or links; every link comes from the data.
- Do not pad with sections that have nothing in them.
