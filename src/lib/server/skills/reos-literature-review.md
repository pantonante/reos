---
name: reos-literature-review
description: Run a literature review using paper search and primary-source synthesis. Use when the user asks for a lit review, paper survey, state of the art, or academic landscape summary on a research topic.
---

# Literature Review

Produce a structured literature review from primary academic sources.

## Workflow

### Phase 1: Scoping
- Agree on topic boundaries, time range, and key venues with the user
- Define 3-5 search queries covering different facets of the topic

### Phase 2: Collection (use parallel subagents)
For each query:
1. Search via WebSearch targeting arXiv, Semantic Scholar, Google Scholar
2. Collect 5-10 relevant papers per query
3. Read abstracts and key sections via WebFetch
4. Record: title, authors, year, venue, key contribution, URL

### Phase 3: Verification
- Confirm paper details against primary sources
- Check citation counts / influence where possible
- Remove duplicates and marginally relevant papers

### Phase 4: Synthesis
Write the review with these sections:
- **Introduction**: Problem statement and scope
- **Themes**: Group papers by approach/theme, not chronologically
- **Key Findings**: What the field agrees on
- **Open Questions**: Where consensus breaks down
- **References**: Full list with URLs

## Output

Save to `outputs/<topic-slug>-lit-review.md` with `outputs/<topic-slug>.provenance.md` sidecar.

## Guidelines

- Prefer primary sources — read the actual papers, not just abstracts
- Note methodological differences between studies
- Distinguish well-established results from preliminary findings
- Use parallel subagents to search different facets concurrently
