---
last_updated: 2026-04-09
---

# Contradictions

Tracked inconsistencies between source documentation and the codebase.

## Active

_No contradictions recorded at this time._

## Resolved

| Date | Location | Description | Resolution |
|------|----------|-------------|------------|
| 2026-04-09 | `.github/PULL_REQUEST_TEMPLATE.md` | Template references `extensions/claude-throne/` but the extension directory was renamed to `thronekeeper` in commit `02fc078` | Template is legacy; extension path in tests and commands should use `extensions/thronekeeper/` |

## Notes

- The PR template extension test command (`cd extensions/claude-throne && npm test`) is stale post-rename.
- `CLAUDE.md` still references the old `extensions/claude-throne` path; it should be updated to `extensions/thronekeeper`.
