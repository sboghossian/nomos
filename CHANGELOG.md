# Changelog

All notable changes to Nomos are documented here. This project adheres
loosely to [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
uses [Semantic Versioning](https://semver.org/).

Format: each release lists **Added**, **Changed**, **Fixed**, **Removed**.
Honest wins and losses. Build log is public at
[/changelog](https://nomos.dashable.dev/changelog).

---

## [0.1.0] — 2026-04-18

First public release. The language runs end-to-end: parse → check →
evaluate → verdict with proof tree. LLM bridge, defeasibility solver,
CLI, playground, VS Code extension, Claude Skill, CUAD benchmark.

### Added

**Language core (`@nomos/core`)**

- Chevrotain-based lexer and parser for `.nomos`
- Typed AST (discriminated union) with source spans
- Name resolver with diagnostics (`check`)
- Value type + expression evaluator
- Rule engine with temporal validity (`from <date>` + query `as of`)
- Defeasibility solver: priority → specificity (lex specialis) →
  recency (lex posterior) → declaration order
- Tiebreaker explanation on `EvalResult` with decision criterion +
  candidate scores
- Typed `AuthorityRef` AST node (article, case, section, decree,
  generic) with canonical string form

**LLM bridge (`@nomos/llm`)**

- OpenRouter client with JSON-schema structured output
- `TypeRef` → JSON Schema compiler
- `resolveFacts` — async pre-pass that resolves every `extract<T>`
  fact before the sync evaluator runs
- Model-alias table (claude-opus-4-7, claude-sonnet-4-5, gpt-5,
  gemini-2-5-pro)
- Self-rated confidence + `verified_by human if confidence < N`
  gate for human-in-loop routing

**Citations (`@nomos/citations`)**

- Eyecite (Free Law Project) integration via long-lived Python
  subprocess + JSON-line protocol
- US publisher classifier (scotus, us, usc, cfr, …)
- Graceful fallback when Python or eyecite is unavailable

**CLI (`@nomos/cli`)**

- `nomos run <file> [--input <json>] [--as-of <date>] [--with-llm]
[--model <id>]`
- `nomos parse <file>` (prints AST)
- `nomos check <file>` (diagnostics only)
- `nomos resolve <file>` (resolves authorities via Eyecite)
- Colored sectioned output — VERDICT, AUTHORITIES, TIEBREAKER,
  PROOF, EXTRACTED FACTS, WARNINGS
- Zero-dep `.env` loader

**VS Code (`nomos-vscode`)**

- TextMate grammar: keywords, types, citations, dates, literals
- Language configuration: brackets, auto-close, comments
- LSP server (over `@nomos/core`): incremental sync, live
  diagnostics, hover (rule metadata), completion (keywords +
  primitives + user symbols)

**Web (`@nomos/web`)**

- Landing page with 5 sections + Greek etymology block
- `/play` — browser playground running the full pipeline client-side
  via `@nomos/core`; LLM toggle that calls the proxy for `extract<T>`
- `/architecture` — visual pipeline diagram + surfaces + reuse stack
- `/research/thesis` — four-claim argument for why Nomos exists
- `/research/prior-art` — Catala, OpenFisca, Blawx, Kowalski, etc.
  with take/leave tables + OSS stack
- `/research/benchmarks` — CUAD results with reproducible command
- `/changelog` — build-log page
- Shared `Nav` component, `EXPERIMENTAL` banner, scholarly aesthetic
  (Fraunces serif + Inter sans + JetBrains Mono, cream/ink/forest
  palette)

**Proxy API (`@nomos/api`)**

- `node:http` server, zero framework
- `/resolve` endpoint — holds the OpenRouter key, runs `resolveFacts`
  server-side, returns bound facts + per-fact metadata
- Per-IP sliding-window rate limit (20/hr)
- CORS locked to known origins
- Daemonized via launchd (survives reboots)
- Live at `https://nomos-api.dashable.dev`

**Benchmarks**

- CUAD harness (`bench/cuad/harness.mjs`) — 20 samples, 4 categories,
  Claude Sonnet 4.5: 0.45 EM / 0.75 contains / 0.66 mean F1 / 0.97
  mean confidence
- Per-item results written to `bench/cuad/results/`

**Claude Skill**

- `skills/nomos-reason/` — SKILL.md with full language primer,
  reference programs, submission script for
  `lawvable/awesome-legal-skills`

**Tests**

- Vitest: 18 parser specs + 8 evaluator specs = 26 green
- 4 `.nomos` fixtures covering non-compete scenarios + lex specialis
  tiebreak + US equal-protection citations

### Changed

- AuthorityRef moved from raw-string to typed AST in `0.0.2`
- Playground GitHub link now points to `sboghossian/nomos` (was a
  placeholder org)

### Fixed

- `is` predicate being dropped when no right-hand comparison existed
- Chevrotain `nodeLocationTracking: "full"` so the postfix visitor
  can pair call arguments to their enclosing `(` / `[` by offset

---

## [0.0.1] — 2026-04-18 (initial commit)

Project kickoff. Parser + evaluator scaffold, landing page, Apache-2.0.

---

See the live page at [nomos.dashable.dev/changelog](https://nomos.dashable.dev/changelog).
