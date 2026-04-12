# Claude Code — Plexium Wiki Maintenance

You are working on a **Plexium** project. This repository uses an LLM-maintained
wiki (`.wiki/`) that you are responsible for keeping current.

## Your Responsibilities

1. **Before any code change**: Read `.wiki/_index.md` and relevant wiki pages
2. **After any code change**: Update affected wiki pages
3. **Never modify** pages with `ownership: human-authored`
4. **Treat the starter scaffold as incomplete** until `plexium convert` and a real first-pass population run have happened

## First Population Pass

When the wiki is mostly starter scaffold:

1. Run `plexium convert` first to bootstrap grounded content
2. Prefer **Claude agent teams** for the first wiki build when available
3. Split the first pass into:
   - retriever / context gatherer
   - documenter / wiki writer
   - optional validator / linter
4. Use `.plexium/prompts/assistive/initial-wiki-population.md` as the operating contract
5. Use `.plexium/prompts/assistive/retriever.md` and `.plexium/prompts/assistive/documenter.md` for role-specific guidance

## Plexium Schema

<!-- SCHEMA_INJECT_START -->
---
schema-version: "1.0"
---

# PLEXIUM SCHEMA v1 — MANDATORY AGENT DIRECTIVES

You are the custodian of the .wiki/ vault in this repository. Your memory
does not persist between sessions, but this vault does. It is the compiled,
persistent knowledge of this entire codebase.

## MANDATORY WORKFLOW — EVERY TASK

### 1. READ (before any code change)
- Read .wiki/_index.md to orient yourself.
- Fetch relevant module, architecture, and decision pages for your work area.
- If a retrieval tool is available (PageIndex MCP, plexium retrieve),
  use it instead of scanning files manually.
- Check .wiki/_log.md (last 10 entries) for recent context.
- Check page ownership frontmatter before modifying any wiki page.

### 2. EXECUTE
- Perform the coding task requested by the user.

### 3. DOCUMENT (FORBIDDEN to end your task without this step)
- Update every .wiki/modules/*.md page affected by your changes.
- If you made an architectural decision, create or update a .wiki/decisions/*.md ADR.
- If you discovered a contradiction, add it to .wiki/contradictions.md.
- Add an entry to .wiki/_log.md (see LOG FORMAT below).
- Update .wiki/_index.md if you created or removed pages.
- Update cross-references ([[wiki-links]]) on pages whose relationships changed.
- NEVER modify pages with ownership: human-authored unless explicitly instructed.
- For ownership: co-maintained pages, append only — do not rewrite existing sections
  unless the user specifically requests it.

### 4. VALIDATE
- Confirm wiki updates are consistent with the code you actually wrote.
- Mark uncertain claims with <!-- CONFIDENCE: low — needs human review -->.
- Verify all [[wiki-links]] you created resolve to existing pages.
- Verify source-files frontmatter references existing paths.

## TRIVIAL CHANGE EXCEPTION
For changes affecting only a single file with no architectural impact
(typo fixes, version bumps, formatting): a brief _log.md entry suffices.
Full wiki update not required.

## LOG FORMAT
Each entry in _log.md must use this parseable format:

  ## [YYYY-MM-DD] {task|ingest|lint|query|convert} | Brief description
  - Changed: modules/auth.md, architecture/overview.md
  - Decision: decisions/015-jwt-rotation.md (new)
  - Contradictions: None found
  - Files touched: src/auth/middleware.ts, src/auth/jwt.ts

## PAGE GENERATION RULES

### Slug rules
- Page names must be filesystem-safe (no spaces — use hyphens).
- Duplicate titles must be deduplicated predictably (append qualifier).
- Heading-derived slugs must remain stable across regenerations.

### Navigation rules
- Every generated page must be reachable from _index.md directly or indirectly.
- _Sidebar.md must expose top-level sections and key pages.
- Navigation ordering must be deterministic (alphabetical within sections).

### Content rules
- Preserve factual meaning from source docs and code.
- NEVER invent implementation details not present in sources.
- Summarize when needed but do not silently discard major sections.
- Prefer cross-links ([[wiki-links]]) over duplicated paragraphs.
- Every page must begin with YAML frontmatter (see FRONTMATTER SPEC).

### Cross-reference rules
- When mentioning a concept, module, or decision that has its own page, use [[wiki-links]].
- Never remove existing cross-references without logging the removal in _log.md.
- When creating a new page, add inbound links from at least 2 related existing pages.

## FRONTMATTER SPEC
Every wiki page must begin with:

---
title: <Human-readable title>
ownership: managed              # managed | human-authored | co-maintained
last-updated: YYYY-MM-DD
updated-by: <agent-name>
related-modules: [<list>]
source-files: [<glob patterns>]
confidence: high                # high | medium | low
review-status: unreviewed       # unreviewed | human-verified | stale
tags: [<list>]
---

## LINT PROTOCOL
When asked to lint, check for:
- Pages not updated in >30 days that reference frequently-changed code
- Orphan pages (no inbound [[links]])
- Concepts mentioned in 3+ pages without their own page
- Contradictions between module pages and architecture overview
- source-files in frontmatter referencing paths that no longer exist
- Missing cross-references between related modules
- Pages with confidence: low that need investigation
- Managed pages whose source file hashes differ from the state manifest

## INGEST PROTOCOL
When a new raw source is added (meeting note, ticket export, memento transcript):
1. Read it fully
2. Discuss key takeaways with the user (unless batch mode)
3. Write a summary page or update existing pages
4. Update _index.md, _log.md, _Sidebar.md
5. Cross-reference with existing module/decision pages
6. Flag contradictions with existing wiki content
7. Update the state manifest with new source mappings

## Tech Stack Examples

This project uses JavaScript. Key conventions:
- Files use .js extension
- Run scripts with npm run <script>
- Test with npm test<!-- SCHEMA_INJECT_END -->

## Quick Reference

- Wiki: `.wiki/`
- Manifest: `.plexium/manifest.json`
- Report issues: `plexium lint --ci`

## Detected Stack
[javascript]

## Commands

```bash
plexium convert   # Bootstrap useful content from the current repository
plexium sync      # Update wiki after changes
plexium lint      # Check wiki health
plexium retrieve  # Query the wiki
```
