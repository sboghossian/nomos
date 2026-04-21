# Contributing to Nomos

Thanks for looking. This is a side project, not a company, so the bar
for getting involved is low and the bar for shipping to `main` is
"tests pass and the change is explained."

## The short version

1. Open an issue before writing a big patch. If it's a typo or a clear
   bug, just send the PR.
2. Fork, branch, commit with conventional-commit subjects (`feat:`,
   `fix:`, `docs:`, `test:`), push, open a PR.
3. I'll review. If I disagree I'll say why. If we agree, it lands.

## What I'd love help with

Ranked roughly by how useful it'd be to me right now.

### Easy / first PR material
- **Bugs** — syntax edges, parser errors with bad spans, evaluator
  quirks. Reproduce with a failing test and fix.
- **More fixtures** — real statutes from other jurisdictions. Lebanese
  labour code, German civil code, Canadian employment standards, EU
  GDPR articles. Drop a `.nomos` file in `packages/core/test/fixtures`.
- **Typos and prose** — the site has a "Edit this page on GitHub"
  link on every page. Use it.
- **Model aliases** — `packages/llm/src/openrouter.ts`. When new
  models ship on OpenRouter, add short aliases.

### Medium
- **Akoma Ntoso loader** — read an XML statute file and emit Nomos
  rule skeletons a human can then annotate. Currently a stub.
- **Stricter Date/String types** in `extract<T>` — the CUAD parties
  category loses most of its F1 to verbosity; a `canonical_name` field
  or a `Date`-only schema variant would measurably help.
- **Ensemble voting in the CLI** — `extractEnsemble` exists as a
  library function; wire it to a CLI flag so `nomos run --ensemble
  claude,gpt5,gemini` Just Works.
- **VS Code LSP features** — go-to-definition, rename symbol, inlay
  hints. The scaffolding is in `packages/vscode`.

### Harder / invited
- **Specificity scoring that's semantic, not structural** — currently
  we count requires + when-guards. A rule with one tight condition is
  more specific than one with five loose ones. Fixing this is a real
  language-design problem; open an issue first so we can argue about
  what "specific" means.
- **Multi-parameter predicates** — v0 predicates take one parameter.
  `predicate can_hire(party: Party, role: String) = ...` needs work
  in the parser, checker, and evaluator.
- **Docassemble output adapter** — compile a Nomos program into a
  guided legal interview that non-developers can fill out.

## Setup

```bash
git clone https://github.com/sboghossian/nomos
cd nomos
npm install
npm run build
npm test               # 42 specs, should all pass
npx nomos run packages/core/test/fixtures/non_compete_fr.nomos
```

Node 20+ required. Python 3 + `pip install eyecite` is optional but
enables the US citation resolver.

For LLM features:

```bash
echo "OPENROUTER_API_KEY=sk-or-..." > .env
npx nomos run packages/core/test/fixtures/non_compete_llm.nomos --with-llm
```

Get a key at [openrouter.ai](https://openrouter.ai). $5 of credits goes a
long way — the LLM cache means you only pay once per identical extraction.

## Repo layout

```
nomos/
├── packages/
│   ├── core/          @nomos/core     parser, AST, checker, evaluator, defeasibility
│   ├── llm/           @nomos/llm      OpenRouter bridge, cache, ensemble
│   ├── citations/     @nomos/citations Eyecite via Python subprocess
│   ├── cli/           @nomos/cli      nomos run/parse/check/resolve
│   └── vscode/        nomos-vscode    TextMate grammar + LSP
├── apps/
│   ├── web/           @nomos/web      nomos.dashable.dev + /play
│   ├── api/           @nomos/api      proxy at nomos-api.dashable.dev
│   └── demo-video/    @nomos/demo-video Remotion video for the README
├── skills/
│   └── nomos-reason/  Claude Skill
├── bench/
│   └── cuad/          CUAD extraction benchmark harness
└── docs/
    └── media/         screenshots + renders
```

## Commit style

Conventional Commits. The CI doesn't enforce it but I'll nudge in review.

```
feat(core): specificity + recency tiebreakers
fix(llm):   handle OpenRouter 429 with exponential backoff
docs:       updated getting-started for duration literals
test(core): grammar specs for !=
bench:      CUAD run at n=50 across 5 models
```

## Tests

Vitest for the core language. Every new grammar feature should land
with specs in `packages/core/test/`.

```bash
cd packages/core && npm test
cd packages/core && npm run test:watch
```

Rules of thumb:

- Parser specs assert AST shape.
- Evaluator specs assert verdict + key trace facts.
- Don't add specs that depend on LLM output — those belong in `bench/`.

## Docs & the website

The site at [nomos.dashable.dev](https://nomos.dashable.dev) lives in
`apps/web`. It's Astro + Tailwind. To run locally:

```bash
npm run web    # http://localhost:4325
```

Every page has an "Edit this page on GitHub" link in the footer. Use it.

## Releases

`main` is always buildable. I cut tags on milestones:

```bash
git tag v0.1.2 -m "<one-line summary>"
git push origin v0.1.2
gh release create v0.1.2 --generate-notes
```

Release notes should point at what's new and what it breaks. The
[CHANGELOG.md](./CHANGELOG.md) mirrors the git tags.

## Code of conduct

Be decent. If someone in the community is making you uncomfortable,
email me (see `package.json` author) and I'll deal with it.

## Licensing

Apache-2.0. By contributing, you agree your changes ship under the
same license. If your employer has a CLA policy that matters here,
note that in your PR.

## Questions

Open an issue, tag it `question`. If it's too open-ended for an
issue, start a GitHub Discussion.
