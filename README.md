# Nomos

> **νόμος** — _noun, Greek_. Law, custom, rule.

**Nomos is an experimental programming language for legal reasoning.** Rules
carry jurisdiction, date, and authority. LLMs bridge prose to typed facts at
the edges. A defeasibility engine resolves conflicts the way judges do. Every
output is a proof tree back to statutes and cases.

This is a **side project, built in public**. Not affiliated with any law firm,
vendor, or bar association. Apache-2.0 licensed.

🌐 **[nomos-lang.dev](https://nomos.dashable.dev)** · 🕹 **[Playground](https://nomos.dashable.dev/play)**

---

## Why another language?

The rules-as-code field has fifty years of history — Kowalski's British
Nationality Act encoding (1981), Catala (Inria, 2021), OpenFisca (France,
2011), Blawx, Logical English, LegalRuleML. Every attempt hit the same
wall: the world keeps speaking in prose, and getting prose into rules at
scale was impossible.

LLMs changed that. Nomos's thesis: **put the LLM at the edge as a typed
bridge, keep the interior deterministic and defeasible, and thread
provenance through everything.** The four novelties:

1. **Typed LLM bridges** — `extract<Party>(pdf) using llm(…) verified_by human if confidence < 0.95` is a language primitive.
2. **Time + jurisdiction, typed** — rules declare `@ FR from 2016-08-10`; queries run `as of` any date.
3. **Defeasibility by design** — priority, specificity, recency. Conflicting rules resolved the way judges do.
4. **Provenance, always** — every value carries authorities, facts used, and the rule chain that produced it.

Built as a thin layer on top of existing OSS: [Eyecite](https://github.com/freelawproject/eyecite) for citations, [Concerto](https://github.com/accordproject/concerto) for types, [Akoma Ntoso](http://www.akomantoso.org/) for legislation, [Atticus Project](https://www.atticusprojectai.org/) datasets for evaluation, and the [Catala](https://catala-lang.org/) research program for inspiration.

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

query non_compete_enforceable as of 2026-04-18
```

Given the same program and three different fact sets, Nomos returns:

| Scenario             | Verdict             | Why                                                 |
| -------------------- | ------------------- | --------------------------------------------------- |
| Employee, fair terms | **ENFORCEABLE**     | Base rule satisfied; consumer override doesn't fire |
| Consumer role        | **NOT ENFORCEABLE** | Priority-100 override defeats base rule             |
| Employee, 12% comp   | **NOT ENFORCEABLE** | Base rule's `compensation_pct >= 0.30` fails        |

Every verdict comes with a proof tree naming the authorities, the facts used,
and the rules defeated.

## Status

**v0.0.2 · In active development.** The compiler runs. The LLM bridge runs
end-to-end. Defeasibility resolves priority, specificity, and recency.
A CLI, a web playground, a VS Code extension, and a Claude Skill ship.

## Benchmarks

First honest run on the [CUAD](https://www.atticusprojectai.org/cuad)
dataset — 20 extractions, 4 categories, Claude Sonnet 4.5. Reproducible
via `bench/cuad/harness.mjs`.

| Category       |  n  | Exact match | Contains |    F1    | Confidence |
| :------------- | :-: | :---------: | :------: | :------: | :--------: |
| Document Name  |  5  |    1.00     |   1.00   |   1.00   |    0.97    |
| Parties        |  5  |    0.00     |   1.00   |   0.20   |    0.96    |
| Effective Date |  5  |    0.20     |   0.40   |   0.45   |    0.99    |
| Governing Law  |  5  |    0.60     |   0.60   |   1.00   |    0.99    |
| **Overall**    | 20  |  **0.45**   | **0.75** | **0.66** |  **0.97**  |

Parties and dates are the gap — the model extracts semantically correct
but verbose spans (containment 100% on Parties; F1 only 0.20). Schema
discipline + category-specific types close most of that. Full writeup:
[/research/benchmarks](https://nomos.dashable.dev/research/benchmarks).

See [`tasks/todo.md`](./tasks/todo.md) for the full plan.

## Quickstart

Requires **Node ≥ 20**.

```bash
git clone https://github.com/sboghossian/nomos.git
cd nomos
npm install
npx tsc -b packages/core packages/cli

# Run the flagship example
npx nomos run packages/core/test/fixtures/non_compete_fr.nomos

# Or try the browser playground
npm run web   # http://localhost:4325/play
```

## Packages

| Package                          | Description                                                         |
| -------------------------------- | ------------------------------------------------------------------- |
| [`@nomos/core`](./packages/core) | Parser, type checker, evaluator, defeasibility engine               |
| [`@nomos/cli`](./packages/cli)   | The `nomos` command-line tool                                       |
| [`@nomos/web`](./apps/web)       | Website + playground ([nomos-lang.dev](https://nomos.dashable.dev)) |

## Prior art worth studying

- **[Catala](https://catala-lang.org/)** — the closest modern academic ancestor. Default logic first-class. Inria, Apache-2.0.
- **[OpenFisca](https://openfisca.org/)** — tax/benefit law as Python, adopted by multiple governments.
- **[Blawx](https://app.blawx.dev/)** — visual rules-as-code over s(CASP), by Jason Morris / Lexpedite.
- **Kowalski et al.** — the 1981 British Nationality Act encoding. Won the CodeX Prize in 2021.

See [`/research/prior-art`](./docs/research/prior-art.md) _(coming soon)_ for the full survey.

## Contributing

This is an early-stage side project. Issues, discussions, and exploratory PRs
welcome. Breaking changes expected while v0 shapes itself.

## License

Apache-2.0 © 2026 Stephane Boghossian.
