# Wiki Change Log

---

### 2026-04-09 — Initial wiki creation; repo-drift resolution for guides/WARP.md

- **Action**: created
- **Pages**: `_schema.md`, `_index.md`, `_log.md`, `contradictions.md`, `guides/WARP.md`
- **Reason**: repo-drift job detected 1 stale page (`guides/WARP.md`); wiki directory did not yet exist and was bootstrapped from scratch.
- **Sources incorporated**:
  - `docs/WARP.md` — source document for codebase exploration guidance (file existed in repo; synthesized into wiki page)
  - `.github/PULL_REQUEST_TEMPLATE.md` — new source; PR workflow, Constitution compliance checklist, area labels, smoke test protocol
  - `.archive/docs/Claude-Throne-Prompt.md` — listed as new source in manifest; file not present in worktree at time of wiki creation (directory absent)
- **Contradictions logged**: PR template and `CLAUDE.md` reference stale `extensions/claude-throne/` path post-rename to `extensions/thronekeeper/` (see `contradictions.md`)
