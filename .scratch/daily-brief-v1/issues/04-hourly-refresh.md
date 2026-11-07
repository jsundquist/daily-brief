# 04: Hourly unattended refresh

**What to build:** The server refreshes all feeds every hour on its own and the page shows new items under today's date without losing check-offs. The server is started and kept alive by macOS `launchd`, and if the Mac was asleep at an hour mark it catches up when it wakes.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Feeds are re-fetched hourly without any user action
- [ ] New items appear on the open page without a manual reload
- [ ] Check-off state is intact after a refresh
- [ ] The server restarts automatically if it stops and starts at login
- [ ] Missed refreshes (Mac asleep) are caught up on wake

**Note from ticket 02:** the Hacker News cap keeps the first 10 items in feed order at fetch time, but items stored from earlier fetches are not removed. On each refresh, a capped source's stored items should be replaced by the newly fetched capped set, so the page never shows more than the cap.
