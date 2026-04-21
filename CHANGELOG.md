# Changelog

All notable changes to Nomos are documented here. This project adheres
loosely to [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
uses [Semantic Versioning](https://semver.org/).

Format: each release lists **Added**, **Changed**, **Fixed**, **Removed**.
Honest wins and losses. Build log is public at
[/changelog](https://nomos.dashable.dev/changelog).

---

## [0.1.1] — 2026-04-21

Drop-in patch. No breaking changes.

### Added

- **Negation** — `not x` keyword and `!x` operator as unary prefix.
- **`!=`** — strict inequality.
- **Duration literals** — `18.months`, `2.years`, `30.days`, `6.weeks`. Stored as float months.
- **User-defined predicates** — `predicate foo(x) = …`, usable via `is foo` and `foo(x)` call form.
- **Operand surfacing on failing requirements** — the proof tree now shows `clause.compensation_pct = 0.12` inline under a failing `>= 0.30` check.
- **LLM extraction cache** — content-addressed by `(model, source, schema, typeName, kwargs)`; repeat runs are free. `.nomos-cache/` (gitignored). Override via `NOMOS_CACHE_DIR`, disable via `NOMOS_CACHE_DISABLED=1`.
- **`extractEnsemble`** — parallel calls to N models with plurality vote on deep equality. Graceful degradation when one model fails.
- **Scaled CUAD benchmark** — `--models comma,separated` flag. First cross-model run at n=10×4×3=120 extractions (Sonnet 4.5 / GPT-4o / Gemini 2.5 Pro).
- **`/docs/getting-started`** — 7-section tutorial.
- **404 page** with on-brand "defeated by a higher-priority rule" message.
- **`Footer` component** with "Edit this page on GitHub" on every page.
- **Remotion demo video** (22 s, 1080p MP4 + 960px GIF) + six still frames in `docs/media/`.
- **Claude Skill packaged as zip** attached to the v0.1.1 release; drop-in for `~/.claude/skills/`.
- **Screenshots** of every page via Playwright in `docs/media/`.
- **Grammar tests** — 16 Vitest specs for negation, `!=`, durations, predicates, operand surfacing.
- **MODEL_ALIASES refreshed** against live OpenRouter (Sonnet 4.6, Opus 4.1–4.7, Haiku 4.5, GPT-5 variants, Gemini 3 previews).
- **CONTRIBUTING.md** — setup, repo layout, release flow, help wanted.

### Changed

- **Home page copy humanized** — removed AI-style parallelism, em-dash overuse, rule-of-three patterns, "shoulders of giants" cliché. First-person where it fits.
- **Architecture page** — stopped marking shipped surfaces (VS Code, Claude Skill, Eyecite) as "coming."
- **Thesis, Prior Art, Benchmarks pages** — h2 headings no longer cramped into 220 px left columns; labels now 140 px sticky-on-scroll with headings in the wide column.
- **Home page demo** — wired to the real `@nomos/core` evaluator instead of hardcoded verdict JSON.
- **Scroll-reveal** converted to progressive enhancement (JS-enhanced, not JS-required) with a 2-second safety net.

### Fixed

- Unresolved-reference checker now knows about user-defined predicates.
- `!=` and `!` lex unambiguously (negative-lookahead on `!`).

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
