---
name: nomos-reason
description: "Use this skill whenever the user wants to author, parse, or evaluate .nomos files — Nomos being an experimental programming language for legal reasoning with typed rules, defeasible logic, temporal validity, LLM bridges, and proof trees. Trigger for: (1) writing a new .nomos program that encodes rules under a specific jurisdiction, (2) reasoning about enforceability, validity, compliance, or defeasibility where multiple legal rules may conflict, (3) running `nomos run file.nomos` and interpreting the verdict + proof tree, (4) extracting typed facts from a contract or statute using extract<T> via OpenRouter, (5) debugging parse, check, or evaluation errors, or (6) translating statutes or cases into Nomos syntax. Works with both the @nomos/cli (nomos run/parse/check) and the public playground at nomos.dashable.dev/play."
metadata:
  author: Stephane Boghossian
  license: Apache-2.0
  version: 0.0.2
  homepage: https://nomos.dashable.dev
  repository: https://github.com/sboghossian/nomos
---

# nomos-reason

## Overview

Nomos is a programming language for legal reasoning. A `.nomos` file declares
types, rules, facts, and queries; the evaluator returns a verdict plus a
proof tree naming every rule fired, every requirement satisfied or failed,
every authority cited, and every defeasibility contest resolved.

This skill teaches Claude to author, parse, and evaluate Nomos programs.

## CRITICAL DISCLAIMER

**Nomos is an experimental v0 side project. It is not legal advice, not
production software, and not a substitute for qualified counsel.**

- Every verdict depends entirely on the rules and facts the user supplies.
  Garbage in, garbage out.
- The LLM bridge (`extract<T>`) is probabilistic; confidence scores are
  self-rated by the model, not audited.
- Jurisdictional correctness (`@ FR`, `@ US`, etc.) is a label, not a proof.
  The language does not verify that a rule accurately encodes real law.
- Nomos outputs are a starting point for legal reasoning, not a finished
  legal opinion. Always verify with a licensed attorney before relying on
  any verdict for a real matter.

## When to use this skill

Invoke whenever the user:

- Wants to write or edit a `.nomos` file.
- Asks Nomos-style questions: _"does this non-compete enforce?"_,
  _"which rule wins?"_, _"is this clause defeasible?"_.
- Pastes a contract or statute and asks to encode it.
- Hits a parse, check, or evaluation error and wants a fix.
- Wants to run the CLI or demo the playground.

## The language in one screen

### Types

```nomos
type Party {
  name: String
  role: "seller" | "buyer" | "employee" | "employer" | "consumer"
}

type Duration   // built-in: number of months
type Geography  // built-in: { region: String, reasonable: Boolean }
type Float      // built-in: number
type String     // built-in
type Date       // built-in: YYYY-MM-DD
```

### Rules

Rules carry jurisdiction, temporal validity, priority, defeats, and a guard.
Modifiers may appear in any order:

```nomos
rule non_compete_enforceable @ FR from 2016-08-10 {
  requires clause.duration <= 24
  requires clause.scope is reasonable
  requires clause.compensation_pct >= 0.30
  authority: code_du_travail.art("L1121-1")
  authority: cass_soc(2002-07-10, "00-45135")
}

rule consumer_protection_override
  @ FR priority 100
  defeats non_compete_enforceable
  when party.role == "consumer"
{
  authority: code_conso.art("L212-1")
}
```

- `@ FR` — jurisdiction (ISO 3166-1 alpha-2 or any user name).
- `from DATE` — rule valid from this date forward.
- `priority N` — higher wins conflicts; default 0.
- `defeats other_rule` — explicit override.
- `when EXPR` — hard precondition.
- `requires EXPR` — predicate; all must pass for the rule to fire.
- `authority: REF` — citation to a statute, case, decree, or policy.
  Canonical shape: `publisher.art("…")`, `publisher.section("…")`,
  `publisher(DATE, "case-number")`.

### Facts

Facts bind values used by rules. Two kinds:

```nomos
// Plain value — typically bound externally via JSON input:
fact party: Party = party
fact clause: NonCompete = clause

// LLM-extracted from prose:
fact party: Party = extract<Party>(contract_text)
  using llm("claude-sonnet-4-5")
  verified_by human if confidence < 0.95

fact clause: NonCompete = extract<NonCompete>(contract_text, section: "non-compete")
  using llm("claude-opus-4-7")
```

The LLM model names pass through to OpenRouter. Common aliases:
`claude-opus-4-7`, `claude-sonnet-4-5`, `gpt-5`, `gemini-2-5-pro`.

### Queries

```nomos
query non_compete_enforceable as of 2026-04-18
```

The `as of DATE` pin anchors temporal resolution.

### Expressions

- Comparisons: `==`, `<=`, `>=`, `<`, `>`
- Logical: `&&` / `∧`, `||` / `∨`
- Predicate: `subject is predicate` → looks up `subject.predicate` boolean
- Member access: `party.role`
- Literals: `18`, `0.30`, `"text"`, `2026-04-18`, `true`, `false`

## How to run Nomos

### CLI

```bash
# Install (within the repo)
npm install
npx tsc -b packages/core packages/cli packages/llm

# Parse (AST preview)
npx nomos parse contract.nomos

# Check (diagnostics only)
npx nomos check contract.nomos

# Run with pre-bound facts (sibling .input.json auto-detected)
npx nomos run contract.nomos

# Run with explicit inputs and date override
npx nomos run contract.nomos --input facts.json --as-of 2015-01-01

# Run with LLM extraction (needs OPENROUTER_API_KEY in env)
npx nomos run contract.nomos --with-llm --model claude-sonnet-4-5
```

### Browser

The user can paste programs into https://nomos.dashable.dev/play. Toggle
the **LLM** switch in the nav to enable `extract<T>` via the hosted
proxy (rate-limited, no key required client-side).

### Programmatic (Node)

```ts
import { parse, check, evaluate, envFromJson } from "@nomos/core";
import { resolveFacts } from "@nomos/llm";

const parsed = parse(source);
if (!parsed.ast) throw new Error("parse failed");

const env0 = envFromJson(facts, "2026-04-18");
const { env } = await resolveFacts(parsed.ast, env0, {
  apiKey: process.env.OPENROUTER_API_KEY!,
});

const query = parsed.ast.declarations.find((d) => d.kind === "QueryDecl")!;
const result = evaluate(parsed.ast, query, env);
// → result.value, result.winningRule, result.defeatedRules,
//   result.authorities, result.traces, result.tiebreaker
```

## How to think about defeasibility

When multiple rules fire for the same query, Nomos resolves them in this
order of precedence:

1. **Priority** — explicit `priority N`. Higher wins.
2. **Specificity** — _lex specialis_. Score = `requires + 2·when + defeats`. Higher wins.
3. **Recency** — _lex posterior_. Later `from` date wins.
4. **Declaration order** — last declared wins. Final fallback.

Every tiebreak is recorded in `result.tiebreaker` with the decision
criterion + human-readable summary, so the proof tree tells the user
_why_ the winner won, not just _that_ it won.

## Worked example — French non-compete

Given the rules above, three scenarios:

| Facts                                               | Verdict         | Winning rule                   | Why                                                   |
| --------------------------------------------------- | --------------- | ------------------------------ | ----------------------------------------------------- |
| Employee, 18mo duration, 35% comp, reasonable scope | ENFORCEABLE     | `non_compete_enforceable`      | All requirements pass; consumer override doesn't fire |
| Consumer role, 18mo, 35%, reasonable                | NOT ENFORCEABLE | `consumer_protection_override` | Priority 100 override defeats base rule               |
| Employee, 18mo, 12% comp (underpaid), reasonable    | NOT ENFORCEABLE | — (no rule fired)              | `compensation_pct >= 0.30` fails                      |

Try it live: https://nomos.dashable.dev/play

## Common authoring tasks

| When the user says…                                 | Do…                                                                                                                               |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| "Encode Article X of [statute] in Nomos"            | Declare the types, then a `rule @ JUR from DATE { requires … authority: statute.art("X") }`. Use the canonical citation shape.    |
| "Add a defeater when Y holds"                       | Write a second rule with `priority > 0` and `defeats first_rule when Y`.                                                          |
| "This rule should only apply after the 2016 reform" | Add `from 2016-08-10` and make sure the query carries `as of DATE`.                                                               |
| "Extract this contract via LLM"                     | Use `extract<TypeName>(text_ref) using llm("claude-sonnet-4-5")`. Add `verified_by human if confidence < 0.95` for regulated use. |
| "Why did this rule win?"                            | Point to `result.tiebreaker.summary` and the specificity / priority scores in `result.tiebreaker.candidates`.                     |

## Limitations worth naming

- No user-defined functions. Yet.
- No unions of predicates (`subject is (reasonable ∨ urgent)`). Use two `requires`.
- Dates and durations are shallow — no duration arithmetic, no timezone handling.
- Authority references are parsed structurally but not yet resolved against
  external sources (Eyecite integration coming).
- LLM confidence is self-reported; there is no external verifier.
- Specificity scoring is a proxy — it doesn't understand semantics, only
  the number of structural constraints.

## Further reading

- **Website & docs**: https://nomos.dashable.dev
- **Playground**: https://nomos.dashable.dev/play
- **Thesis**: https://nomos.dashable.dev/research/thesis
- **Prior art**: https://nomos.dashable.dev/research/prior-art
- **Architecture**: https://nomos.dashable.dev/architecture
- **Source**: https://github.com/sboghossian/nomos

## Attribution

Nomos borrows from fifty years of rules-as-code research — Catala (Inria),
OpenFisca (France), Blawx (Jason Morris), Logical English (Kowalski),
LegalRuleML (OASIS), and the British Nationality Act encoding
(Kowalski et al., 1981). See `/research/prior-art` on the website for the
full credit table.
