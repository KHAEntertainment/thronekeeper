---
wiki_version: 1
last_updated: 2026-04-09
---

# Wiki Schema

This document defines the structure and conventions for the Thronekeeper LLM wiki.

## Directory Layout

```
.wiki/
  _schema.md          # This file — structural conventions
  _index.md           # Navigation index (all pages listed)
  _log.md             # Change log for wiki edits
  contradictions.md   # Tracked contradictions between docs and code
  guides/             # How-to and workflow guides
    WARP.md           # Codebase exploration and contribution workflow
```

## Page Conventions

- All pages use GitHub-flavored Markdown.
- Front-matter (YAML between `---`) is optional but encouraged for metadata.
- Each page should include a `# Title` h1 heading.
- Links between wiki pages use relative paths: `[text](../other-page.md)`.

## Source Tracking

Each wiki page should note the source documents it synthesizes. Use an `<!-- sources: file1, file2 -->` HTML comment at the top of the page body.

## Schema for `_index.md`

The index must list every non-meta page (`_*.md` files are excluded) under a navigable heading. Format:

```markdown
## Category
- [Page Title](path/to/page.md) — one-line summary
```

## Schema for `_log.md`

Each entry:
```markdown
### YYYY-MM-DD — <short title>
- **Action**: created | updated | deleted
- **Pages**: list of affected pages
- **Reason**: why the change was made
- **Sources**: new or changed source documents incorporated
```
