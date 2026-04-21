# Nomos — a programming language for legal reasoning

> **νόμος** — Greek, _noun_. Law, custom, rule.

**Nomos is an experimental programming language for encoding legal rules as
code.** Write typed rules with jurisdiction and validity dates. Extract facts
from prose via LLM calls that are first-class language primitives. Get
verdicts with proof trees that trace back to statutes and cases.

Built on top of fifty years of rules-as-code research: Catala (Inria),
OpenFisca (France), Blawx, Logical English (Kowalski), LegalRuleML, and the
1981 British Nationality Act encoding.

[![License](https://img.shields.io/badge/license-Apache%202.0-2D5016.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6.svg)](./tsconfig.base.json)
[![Tests](https://img.shields.io/badge/tests-26%20passing-2D5016.svg)](./packages/core/test)
[![Version](https://img.shields.io/badge/version-0.1.0-2D5016.svg)](./CHANGELOG.md)
[![CUAD](https://img.shields.io/badge/CUAD-0.75%20contains%20%2F%200.97%20conf-2D5016.svg)](https://nomos.dashable.dev/research/benchmarks)

**🌐 [nomos.dashable.dev](https://nomos.dashable.dev)** &nbsp;·&nbsp;
**🕹 [Playground](https://nomos.dashable.dev/play)** &nbsp;·&nbsp;
**🏛 [Architecture](https://nomos.dashable.dev/architecture)** &nbsp;·&nbsp;
**📊 [Benchmarks](https://nomos.dashable.dev/research/benchmarks)** &nbsp;·&nbsp;
**🔬 [Thesis](https://nomos.dashable.dev/research/thesis)**

---

## What it does, in 22 seconds

<p align="center">
  <img src="./docs/media/demo.gif" alt="Nomos demo — typed rules, LLM bridges, defeasibility, proof trees" width="720" />
</p>

<p align="center">
  <a href="./docs/media/demo.mp4">▶ 1080p MP4 (2.4 MB)</a>
  &nbsp;·&nbsp;
  <a href="https://nomos.dashable.dev/play">Try it live</a>
</p>

Six frames of the demo:

|                                                                                                   |                                                                                     |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Hero** <br/> <img src="./docs/media/demo-hero.png" width="380" />                               | **Code** <br/> <img src="./docs/media/demo-code.png" width="380" />                 |
| **Enforceable** <br/> <img src="./docs/media/demo-verdict-enforceable.png" width="380" />         | **Defeated** <br/> <img src="./docs/media/demo-verdict-defeated.png" width="380" /> |
| **Operand trace on failure** <br/> <img src="./docs/media/demo-proof-operands.png" width="380" /> | **Live pages** <br/> <img src="./docs/media/home.png" width="380" />                |

---

## Why Nomos exists

Legal reasoning is already a computation. Statutes define predicates. Facts
are inputs. Precedent is a priority ordering. Reforms are temporal updates.
Logic programming knew this in the 1970s and hit a wall: the world keeps
speaking in prose.

LLMs change what's possible — but only if you put them at the _edge_, not
the center. Nomos's thesis: **LLMs as typed primitives at the language's
border; deterministic defeasible logic inside; provenance threaded through
every value.** Four things nothing else has together:

1. **Typed LLM bridges** — `extract<Party>(pdf) using llm(...) verified_by human if confidence < 0.95` is a language primitive, not library plumbing. The compiler derives a JSON schema from the target type and routes low-confidence extractions to a human queue.
2. **Time + jurisdiction, typed** — rules declare `@ FR from 2016-08-10`; queries run `as of <date>`. The compiler refuses to apply a post-reform rule to a pre-reform fact.
3. **Defeasibility by design** — priority → specificity (lex specialis) → recency (lex posterior) → declaration order. Every tiebreak is explained in the proof tree.
4. **Provenance, always** — every value carries the authorities, facts, and rule chain that produced it. Ask the verdict _why_; get a tree back to statutes.

## Hello, Nomos

```nomos
type Party {
  name: String
  role: "seller" | "buyer" | "employee" | "employer" | "consumer"
}

type NonCompete {
  duration: Duration
  scope: Geography
  compensation_pct: Float
}

rule non_compete_enforceable @ FR from 2016-08-10 {
  requires clause.duration <= 24
  requires clause.scope is reasonable
  requires clause.compensation_pct >= 0.30
  authority: code_du_travail.art("L1121-1")
  authority: cass_soc(2002-07-10, "00-45135")
}

rule consumer_protection_override @ FR priority 100 defeats non_compete_enforceable when party.role == "consumer" {
  authority: code_conso.art("L212-1")
}

fact party: Party = extract<Party>(contract_text) using llm("claude-sonnet-4-5")
fact clause: NonCompete = extract<NonCompete>(contract_text, section: "non-compete")
  using llm("claude-sonnet-4-5") verified_by human if confidence < 0.95

query non_compete_enforceable as of 2026-04-18
```

Run it:

```bash
npx nomos run contract.nomos --with-llm --input facts.json
```

Given the same program and different fact sets, Nomos returns:

| Scenario                       | Verdict            | Winning rule                   | Why                                    |
| :----------------------------- | :----------------- | :----------------------------- | :------------------------------------- |
| Employee, 18mo, 35% comp       | ✅ ENFORCEABLE     | `non_compete_enforceable`      | All requires pass, no override fires   |
| Consumer role                  | ❌ NOT ENFORCEABLE | `consumer_protection_override` | Priority-100 defeater wins on priority |
| Employee, 12% comp (underpaid) | ❌ NOT ENFORCEABLE | —                              | `compensation_pct >= 0.30` fails       |

Every verdict ships with a proof tree naming the authorities, the facts
used, and the rules defeated.

**→ Try it live in your browser:** [nomos.dashable.dev/play](https://nomos.dashable.dev/play)

## Benchmarks — honest CUAD numbers

Cross-model run on the [CUAD dataset](https://www.atticusprojectai.org/cuad)
(Atticus Project, 20,910 Q/A pairs across 510 commercial contracts) —
10 samples × 4 categories × 3 models = **120 extractions**.
Reproduce: `node bench/cuad/harness.mjs --samples 10 --models claude-sonnet-4-5,gpt-4o,gemini-2-5-pro`.

| Model                         |   n | Exact match | Contains |       F1 | Conf |
| :---------------------------- | --: | ----------: | -------: | -------: | ---: |
| `anthropic/claude-sonnet-4.5` |  40 |    **0.47** |     0.72 | **0.64** | 0.98 |
| `openai/gpt-4o`               |  40 |        0.45 | **0.75** |     0.61 | 0.96 |
| `google/gemini-2.5-pro`       |  40 |        0.38 |     0.72 |     0.61 | 0.98 |

Frontier models are within 10 points of each other. Confidence is 0.96–0.98
across every cell, even when exact-match is 0.00 — which is why
[`extractEnsemble`](./packages/llm/src/ensemble.ts) (cross-model agreement)
is a much stronger signal than any single model's self-rated confidence.

Full per-category writeup:
[nomos.dashable.dev/research/benchmarks](https://nomos.dashable.dev/research/benchmarks).

## Quickstart

Requires **Node ≥ 20**. Optional: Python 3 + `pip install eyecite` for US citation resolution.

```bash
git clone https://github.com/sboghossian/nomos.git
cd nomos
npm install
npm run build

# Run an example (auto-detects sibling .input.json)
npx nomos run packages/core/test/fixtures/non_compete_fr.nomos

# Or the LLM-powered version (needs OPENROUTER_API_KEY)
echo "OPENROUTER_API_KEY=sk-or-..." > .env
npx nomos run packages/core/test/fixtures/non_compete_llm.nomos --with-llm

# Resolve US citations through Eyecite
npx nomos resolve packages/core/test/fixtures/us_equal_protection.nomos

# Serve the website + playground locally
npm run web    # http://localhost:4325/play
```

## The language

### Types

```nomos
type Party {
  name: String
  role: "seller" | "buyer" | "employee" | "employer" | "consumer"
}
type NonCompete {
  duration: Duration       // integer months
  scope: Geography         // { region: String, reasonable: Boolean }
  compensation_pct: Float
}
```

### Rules — with jurisdiction, validity, priority, defeats, guards

```nomos
rule non_compete_enforceable @ FR from 2016-08-10 {
  requires clause.duration <= 24
  requires clause.scope is reasonable
  authority: code_du_travail.art("L1121-1")
}

rule consumer_protection_override
  @ FR priority 100
  defeats non_compete_enforceable
  when party.role == "consumer"
{
  authority: code_conso.art("L212-1")
}
```

### Facts — plain values or LLM-extracted

```nomos
fact party: Party = extract<Party>(contract_text)
  using llm("claude-sonnet-4-5")
  verified_by human if confidence < 0.95
```

### Queries — pinned to a date

```nomos
query non_compete_enforceable as of 2026-04-18
```

### Defeasibility — the tiebreaker chain

When multiple rules fire, Nomos resolves in this order:

1. **Priority** — explicit `priority N`. Higher wins.
2. **Specificity** (_lex specialis_) — score = `requires + 2·when + defeats`. Higher wins.
3. **Recency** (_lex posterior_) — later `from` date wins.
4. **Declaration order** — last declared wins. Final fallback.

Every tiebreak is recorded in `result.tiebreaker` with a human-readable
summary.

## Install the Claude Skill

There's a Claude Skill at [`skills/nomos-reason/`](./skills/nomos-reason) that
teaches Claude to author and evaluate `.nomos` files. Drop it into your
Claude Code skills directory:

```bash
# option 1 — symlink from a clone
git clone https://github.com/sboghossian/nomos ~/src/nomos
mkdir -p ~/.claude/skills
ln -s ~/src/nomos/skills/nomos-reason ~/.claude/skills/nomos-reason

# option 2 — download the zipped release artifact
curl -L -o /tmp/nomos-reason.zip \
  https://github.com/sboghossian/nomos/releases/latest/download/nomos-reason.zip
mkdir -p ~/.claude/skills
unzip -o /tmp/nomos-reason.zip -d ~/.claude/skills/
```

Restart Claude Code and ask it to write a Nomos program. The trigger
description is broad enough that it picks up naturally on legal-encoding,
rule-conflict, and `.nomos`-editing conversations.

Full skill docs: [skills/nomos-reason/README.md](./skills/nomos-reason/README.md).

## Packages

| Package                                        | Description                                                                                          |
| :--------------------------------------------- | :--------------------------------------------------------------------------------------------------- |
| [`@nomos/core`](./packages/core)               | Lexer, parser, typed AST, evaluator, defeasibility solver                                            |
| [`@nomos/llm`](./packages/llm)                 | OpenRouter bridge for `extract<T>`                                                                   |
| [`@nomos/citations`](./packages/citations)     | Eyecite integration (US case law)                                                                    |
| [`@nomos/cli`](./packages/cli)                 | `nomos` command-line tool — `run`, `parse`, `check`, `resolve`                                       |
| [`nomos-vscode`](./packages/vscode)            | VS Code extension with LSP (syntax, hover, diagnostics, completion)                                  |
| [`@nomos/web`](./apps/web)                     | Website + browser playground at [nomos.dashable.dev](https://nomos.dashable.dev)                     |
| [`@nomos/api`](./apps/api)                     | Proxy server that holds the OpenRouter key for the playground                                        |
| [`skills/nomos-reason`](./skills/nomos-reason) | Claude Skill for [Lawvable's awesome-legal-skills](https://github.com/lawvable/awesome-legal-skills) |

## How it compares

Nomos sits in a specific intersection: a **typed programming language**
(not a library, not a visual editor) for **legal reasoning** (not general
agents) with **first-class LLM bridges** (not post-hoc glue).

### ⭐ Nomos

- **Paradigm**: typed functional with defeasible logic
- **LLM bridge**: first-class primitive (`extract<T> using llm(...) verified_by human`)
- **Defeasibility**: priority → specificity → recency → declaration order
- **Temporal types**: rules carry `from DATE`; queries run `as of DATE`
- **Citations**: typed `AuthorityRef` AST, Eyecite-backed for US
- **License**: Apache-2.0 · **Language**: TypeScript · **Status**: v0.1.1

### Catala — [catala-lang.org](https://catala-lang.org/)

Inria's research project. The cleanest academic account of how
legislative exceptions compose. Strong provenance, OCaml-native
toolchain, lawyer-readable articles.

- ✅ Default logic, exception composition, literate-programming workflow
- ❌ No LLM bridge — facts must be provided as structured data
- ❌ OCaml + Python target; limited browser/agent story

**Takeaway**: if you're a researcher encoding tax law line-by-line,
Catala. If you're building an agent that reads contracts, Nomos.

### OpenFisca — [openfisca.org](https://openfisca.org/)

Python library deployed at national scale (France, UK, NZ, Tunisia,
Senegal). Proof that rules-as-code works in production for tax and
benefit calculations.

- ✅ Government-scale production adoption
- ❌ No defeasibility, no temporal types (everything's `if (date >= …)` boilerplate)
- ❌ No LLM bridge

**Takeaway**: if you're running tax code for a government, OpenFisca.
If you need conflict resolution or LLM extraction, Nomos.

### Blawx — [app.blawx.dev](https://app.blawx.dev/)

Jason Morris' visual rules-as-code over s(CASP). Lawyer-first UX,
explanations for every answer, CodeX-award ecosystem.

- ✅ Explanation-first, beautiful for lawyer adoption
- ❌ Visual/Blockly interface — not where serious code lives
- ❌ No LLM bridge; Prolog runtime dependency

**Takeaway**: Blawx for lawyers who won't write TypeScript. Nomos for
engineers who will.

### Logical English — Kowalski, Imperial College

Controlled natural language over Prolog. Lawyers write near-English
prose that compiles to logic.

- ✅ Foundational CodeX-prize research, linguistic rigor
- ❌ Small tooling ecosystem; research-only
- ❌ Parsing ambiguity is unsolved in general

### LangGraph / LangChain — general-purpose agent orchestration

Not legal-specific. Includes LLM calls and graph flow; no typed
extraction, no defeasibility, no temporal typing, no citation system.

**Takeaway**: LangGraph is the right tool for an arbitrary agent.
Nomos is the right tool when the agent needs a defensible chain back
to statutes.

> Full survey at [/research/prior-art](https://nomos.dashable.dev/research/prior-art).

## Concrete use cases

Three real workflows where Nomos earns its place:

### 1. Auditable legal-AI agents

Your agent reads a contract with an LLM and decides if a clause is
enforceable. The regulator asks why. Without Nomos the answer is "the
model said so." With Nomos the answer is a proof tree with statute
citations, facts the model extracted (and its confidence), and the
specific requirement that passed or failed. If the verdict is wrong,
you can point at the rule that's wrong.

> **Example**: a legal-AI SaaS flags 30 M non-compete clauses per
> quarter across French employment contracts. Compliance officers
> need a why for every flag. Nomos turns the agent's extract → verdict
> into a traceable chain.

### 2. Compliance rule engines with dates and jurisdictions

Tax code, labor regs, and sanctions lists change by jurisdiction and
by date. A rule valid in France from 2016-08-10 must not apply to a
contract dated 2015. Today's version of your engine has that logic
scattered as `if (date >= …)` branches across the codebase; in Nomos
it's a type-system property.

> **Example**: a GDPR-compliance checker that runs an Italian contract
> `as of` the date it was signed and only applies rules valid at that
> time, refusing to retrofit newer obligations.

### 3. Structured extraction with a confidence gate

The weakest link in any legal-AI pipeline is the LLM's self-rated
confidence. Nomos lets you declare the threshold and the fallback in
the source:

```nomos
fact clause: NonCompete = extract<NonCompete>(contract_text)
  using llm("claude-sonnet-4-5")
  verified_by human if confidence < 0.95
```

Anything below 0.95 routes to a human queue instead of silently being
wrong. The `extractEnsemble` primitive goes further: run the same
prompt through 3 models in parallel, accept when they agree, flag when
they don't.

> **Example**: a contract-review platform extracts dates across 500
> contracts. Sonnet 4.5, Opus 4.7, and GPT-5 get the same prompt.
> The 8% of cases where they disagree go to a paralegal.

## When Nomos is not the right fit

- **Production legal advice** — this is experimental v0. Always verify with licensed counsel.
- **Jurisdictions you haven't encoded** — Nomos has no opinion about law it hasn't been told.
- **Open-ended legal reasoning** — summarizing a case, drafting a memo. The LLM sits at the edge of Nomos, not inside it.
- **Sub-second latencies** — each `extract<T>` takes 2–5 seconds. Cache-on-repeat helps, but a first run is LLM-bound.

## Status & roadmap

**v0.1.1 shipped · 2026-04-21.** See [CHANGELOG.md](./CHANGELOG.md).

### What works today

- Parser, typed AST, checker, evaluator, full defeasibility solver
  (priority → specificity → recency → declaration order)
- Grammar: types, rules, facts, queries, predicates, durations,
  negation, `!=`, `is`, member/call/index chains, binary + unary ops
- `extract<T>` via OpenRouter with confidence + human-gate + on-disk
  cache + cross-model ensemble
- Eyecite US citation resolver
- CLI: `run` / `parse` / `check` / `resolve`
- VS Code extension (TextMate + LSP)
- Browser playground at [nomos.dashable.dev/play](https://nomos.dashable.dev/play)
- Claude Skill: `skills/nomos-reason`
- CUAD benchmark harness, cross-model, reproducible
- 42 Vitest specs pinning behavior

### Next up

Ranked by priority.

1. **Semantic specificity scoring** — currently structural (counts `requires`). Real
   *lex specialis* is about the domain of the rule, not its shape.
2. **Akoma Ntoso loader** — read OASIS-format statutes and emit Nomos
   rule skeletons a human can annotate.
3. **Docassemble output adapter** — compile a Nomos program to a
   guided legal interview.
4. **500-extraction CUAD sweep** + MAUD + ACORD coverage.
5. **Rule packs** — `nomos install @nomos/fr-labour`. A marketplace
   aspiration; first release would just be versioned git repos.
6. **LSP upgrades** — go-to-definition, rename, inlay hints.
7. **nomos init / nomos fmt** — project scaffolding and canonical formatter.

Track: [issues](https://github.com/sboghossian/nomos/issues) ·
[live changelog](https://nomos.dashable.dev/changelog) ·
[contributing](./CONTRIBUTING.md)

## Contributing

Issues, discussions, and exploratory PRs welcome. Breaking changes
expected while v0 shapes itself. **Read [CONTRIBUTING.md](./CONTRIBUTING.md)**
for setup, conventions, and a ranked list of what I'd love help with.

Key commands:

```bash
npm install           # set up workspace
npm test              # run 26 Vitest specs
npm run build         # build all packages
npm run web           # serve the site locally
```

## Citations & credit

If you reference Nomos, please credit the prior work it stands on:

- **Catala** — Merigoux, Chataing, Protzenko (2021). _Catala: a programming language for the law._ ICFP.
- **British Nationality Act** — Sergot, Sadri, Kowalski, Kriwaczek, Hammond, Cory (1986). _The British Nationality Act as a logic program._ Communications of the ACM. CodeX Prize 2021.
- **CUAD** — Hendrycks, Burns, Chen, Ball (2021). _CUAD: An Expert-Annotated NLP Dataset for Legal Contract Review._ NeurIPS.
- **Eyecite** — Free Law Project. [github.com/freelawproject/eyecite](https://github.com/freelawproject/eyecite).

Full prior-art survey: [nomos.dashable.dev/research/prior-art](https://nomos.dashable.dev/research/prior-art).

## Disclaimer

Nomos is an experimental side project. It is not legal advice, not
production software, and not a substitute for qualified counsel. Every
verdict depends entirely on the rules and facts the user supplies.
Always consult a licensed attorney for actual legal matters.

## License

[Apache-2.0](./LICENSE) © 2026 Stephane Boghossian.

---

**Keywords**: programming language, legal reasoning, rules-as-code,
defeasible logic, LLM, typed extraction, legal AI, compliance, contract
analysis, Catala alternative, OpenFisca alternative, legal tech, TypeScript,
Apache-2.0, open source, experimental.
