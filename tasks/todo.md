# Nomos — Plan

> **Nomos** (Greek νόμος — "law, custom, rule") **is a programming language for legal reasoning.**
> Rules carry jurisdiction, date, and authority. LLMs bridge prose to typed facts at the edges. A defeasibility engine resolves conflicts the way judges do. Every output is a proof tree back to statutes and cases.
>
> **Built as a thin layer on top of ~85% existing OSS.** Eyecite for citations, Concerto for types, Akoma Ntoso for legislation import, Atticus datasets for evaluation, Catala for inspiration and possible IR reuse.

**Context**: solo OSS side project by Stephane. Not a HAQQ initiative. Apache-2.0 (patent grant matters for a language). Branding inspired by catala-lang.org.
**Target**: v0.1 demo-ready in 6 weeks of evenings/weekends. **Kill gate at week 3.**
**Repo**: `nomos-lang/nomos` (to create). Domain: `nomos-lang.dev`. CLI: `nomos`.

## Decisions locked in before week 1

- **Name**: **Nomos**. Greek for law — transcends common-law/civil-law traditions, short CLI, unused in legaltech, philosophically resonant with the defeasibility thesis.
- **Implementation language**: **TypeScript**. Concerto is TS-native, LSP/playground/Claude Skill all need JS. Rust hot-paths later if traction warrants.
- **Defeasibility engine**: **custom minimal solver** (priority + specificity + recency + lex-posterior, with justification tracking). No SWI-Prolog / s(CASP) dependency — keeps `npm i -g nomos` clean and makes the solver teachable.
- **License**: Apache-2.0 (patent grant).

---

## 1. Evolution of the value proposition — the thinking process

Laying out how the idea sharpened, because the plan only makes sense in that arc.

### v0 — "A new language for AI systems, like Weft but ours"

Too vague. Weft and LangGraph already own general-purpose agent DSLs. "Ours but different" is not a thesis. **Rejected.**

### v1 — "A language for legal AI, because legal AI is what I know"

Better. Vertical focus makes the scope tractable. But still too broad — "legal AI" encompasses drafting, review, extraction, research, litigation prediction. A language can't be all of that. **Needed a sharper cut.**

### v2 — "LegalMD: typed markdown for legal documents"

Sharp and shippable. Typed `@party`, `@cite`, `@clause`, `@deadline` primitives. Two weeks of work. **Kept as a separate track** — it's the _input format_ Nomos will eventually want, but it's markup, not computation. Good warmup, wrong target for the deeper ambition.

### v3 — "Nomos: a programming language for legal reasoning"

Moved from markup to computation. Legal reasoning **is** a computation: rules + facts + priority + authority + time → judgment. Logic programming (Prolog, Datalog) knew this in the 1970s. What changed: **LLMs can now bridge the unstructured→structured gap that killed every previous attempt.**

### v4 — After the landscape search: "Not from scratch. A layer."

Discovered Catala (INRIA, 2.3k stars, active Jan 2026), OpenFisca (production in multiple governments), Blawx, Logical English, LegalRuleML, Accord Project, Atticus datasets, Eyecite, Concerto, Akoma Ntoso. The field has 50 years of history. **Building from scratch would be both arrogant and slow.**

Reframed: **Nomos stands on four shoulders — Eyecite (citations), Concerto (types), Akoma Ntoso (legislation import), Atticus (evaluation) — and adds four specific things none of them have.**

### v5 — "Catala × LangGraph × OpenFisca, with DX a 2026 developer would actually use"

Final thesis. Nomos's four novelties:

1. **LLM bridges as typed primitives** (`extract<T> using llm verified_by human if confidence<X`) — the thing that lets Rules-as-Code finally meet unstructured reality.
2. **Temporal + jurisdictional first-class typing** — rules valid `@ FR from 2016-08-10`, queryable as-of any date.
3. **Defeasibility with provenance** — conflicting rules resolved by priority/specificity/recency, with a proof tree the compiler generates automatically.
4. **Agent-native runtime** — durable execution, human-in-the-loop, messaging. The Rules-as-Code world and the agent-framework world have never met.

**None of these four exist together anywhere.** That's the wedge.

---

## 2. Research summary — what we're reusing, what we're not

### Academic prior art (read, cite, learn from — don't rebuild)

| System                                                                                                | What to take                                                                               | What to leave                                               |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| **[Catala](https://catala-lang.org/)** — INRIA, v1.1 Jan 2026, Apache-2.0                             | Default-logic design (Lawsky paper); lawyer-readable article syntax; possibly reuse the IR | OCaml-heavy toolchain; academic DX; no LLM story            |
| **[OpenFisca](https://openfisca.org/)** — France, adopted by FR/UK/NZ/Tunisia/Senegal                 | Proof that government-scale Rules-as-Code works in Python; tax-rule patterns               | Python-only; imperative; no temporal types                  |
| **[Blawx](https://app.blawx.dev/)** — Jason Morris, s(CASP)-based                                     | Explanation generation UX; lawyer-as-user framing                                          | Visual/Blockly interface isn't where serious adoption lives |
| **Logical English** — Kowalski / Imperial                                                             | Controlled-natural-language frontend idea                                                  | Still academic; weak tooling                                |
| **s(CASP)** — goal-directed ASP                                                                       | Possible candidate for Nomos's resolution engine                                           | Niche; small community                                      |
| **LegalRuleML** — OASIS XML                                                                           | Interop format we can import/export                                                        | Not a programming language; verbose                         |
| **Accord Project / Ergo** — Linux Foundation                                                          | Concerto (data modelling), GSoC 2026 org still active                                      | Ergo itself looks stalled since ~2022                       |
| **L4** — Singapore Management University                                                              | Haskell-based legal DSL patterns                                                           | Small, research-only                                        |
| **Symboleo** — U. Toronto                                                                             | Contract specification semantics                                                           | Research prototype                                          |
| **Historical**: TAXMAN, British Nationality Act (Kowalski 1981 → CodeX Prize 2021), SHYSTER, Split-Up | Cite in the paper to show we know the field                                                | N/A                                                         |

### Building blocks to reuse (OSS, permissive licenses)

| Asset                                                                       | Role in Nomos                                                                                                                                 | License                       |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **[Eyecite](https://github.com/freelawproject/eyecite)** — Free Law Project | Citation extractor for US law, tested on millions of citations. Nomos wraps it as the US citation resolver                                    | BSD                           |
| **[Juriscraper](https://github.com/freelawproject/juriscraper)** — FLP      | Scrapes 400+ US courts — feeds Nomos's case-law resolver                                                                                      | BSD                           |
| **[CourtListener API](https://www.courtlistener.com/)** — FLP               | Authoritative US case-law data                                                                                                                | Open                          |
| **[Doctor](https://github.com/freelawproject/doctor)** — FLP                | DOCX/PDF extraction microservice for `extract<T>` input                                                                                       | BSD                           |
| **[Blackstone](https://github.com/ICLRandD/Blackstone)** — ICLR&D           | spaCy NER for UK legal text                                                                                                                   | Apache-2.0                    |
| **[Concerto](https://github.com/accordproject/concerto)** — Accord Project  | Mature contract-data modelling DSL. **Nomos extends Concerto** with temporal + defeasible annotations instead of inventing a new object model | Apache-2.0                    |
| **[Akoma Ntoso / LegalDocML](http://www.akomantoso.org/)** — OASIS          | XML standard for legislation. Nomos reads Akoma Ntoso → emits typed rule skeletons                                                            | Standard                      |
| **CUAD** — Atticus Project                                                  | 13k+ clause annotations across 41 types — **evaluates `extract<Clause>`**                                                                     | CC                            |
| **MAUD** — Atticus Project                                                  | 47k M&A labels — **evaluates `extract<DealTerm>`**                                                                                            | CC                            |
| **ACORD** — Atticus Project                                                 | 126k query-clause pairs — **evaluates retrieval nodes**                                                                                       | CC                            |
| **Pile of Law / MultiLegalPile / LeXFiles**                                 | Pretraining corpora if we ever fine-tune                                                                                                      | Various                       |
| **CommonAccord**                                                            | Prior art on legal-docs-as-linked-data (credit in paper)                                                                                      | MIT                           |
| **CAML** — opensource.legal                                                 | Prior art on markdown-for-legal (credit in paper; possible LegalMD merge target)                                                              | MIT                           |
| **[Docassemble](https://docassemble.org/)**                                 | **Output adapter**: Nomos program → guided legal interview                                                                                    | MIT                           |
| **[Restate](https://restate.dev)**                                          | Durable execution (same choice as Weft)                                                                                                       | BSL / Apache-2.0              |
| **HAQQ Legal Data Hunter** — Stephane                                       | Citation/legislation for LB, FR, EU, 110+ countries (via MCP)                                                                                 | Proprietary (personal access) |

### What we are NOT reusing (and why)

- **Catala's OCaml toolchain** — TypeScript/Rust is where 2026 developers live. We can possibly cross-compile _from_ Catala IR later.
- **Weft itself** — Different thesis. Weft is general-purpose agents; Nomos is legal reasoning. Nomos programs could _run inside_ Weft as specialized nodes, but Nomos is not a Weft fork.
- **LangGraph / LangChain** — Heavyweight, Python-first, and type system is too loose for our claims about provenance.
- **A bespoke citation parser** — Eyecite exists and is better than anything we'd write.

---

## 3. Architecture — Nomos as a layer

```
┌──────────────────────────────────────────────────────────────────┐
│  Nomos Programs (.nomos files)                                       │
│  — rules, facts, queries, with temporal + jurisdiction + LLM     │
└───────────────────────────┬──────────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────────┐
│  Nomos Compiler (TS / Rust — TBD week 1)                           │
│  — parser, type-checker, defeasibility planner                   │
│  — emits: typed AST + execution plan + proof-tree scaffolding    │
└───────────────────────────┬──────────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────────┐
│  Nomos Runtime                                                     │
│  ├─ Rule engine (s(CASP) or custom defeasible solver)            │
│  ├─ LLM bridge      → Anthropic / OpenRouter (typed extract<T>)  │
│  ├─ Citation resolver → Eyecite + LDH + CourtListener            │
│  ├─ Type system     → Concerto + Nomos temporal/defeasible exts    │
│  ├─ Legislation loader → Akoma Ntoso parser                      │
│  ├─ Human-in-loop   → Restate durable execution                  │
│  └─ Provenance threading → every value carries proof chain       │
└───────────────────────────┬──────────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────────┐
│  Adapters (output targets)                                       │
│  ├─ CLI (`lex run`)                                              │
│  ├─ VS Code LSP (syntax, types, proof-tree hover)                │
│  ├─ Claude Skill (`nomos-reason`) — distribution via Lawvable      │
│  ├─ Web playground (lex-lang.dev or lex.dashable.dev)            │
│  └─ Docassemble export (Nomos program → guided interview)          │
└──────────────────────────────────────────────────────────────────┘
```

**Reuse ratio**: ~85% of the stack is existing OSS. Nomos's new code is the parser, the type-checker (with temporal + defeasible extensions over Concerto), the LLM bridge primitives, and the provenance threading. Everything else is integration.

---

## 4. Language sketch (subject to change in phase 1)

```lex
// ─── Types (Concerto-compatible, with Nomos extensions) ──────────
type Party {
  name: String
  role: "seller" | "buyer" | "employee" | "employer" | "consumer"
}

type NonCompete {
  duration: Duration
  scope: Geography
  compensation_pct: Float
}

// ─── Rules ─────────────────────────────────────────────────────
rule non_compete_enforceable @ FR from 2016-08-10 {
  requires clause.duration <= 24.months
  requires clause.scope is reasonable
  requires clause.compensation_pct >= 0.30
  authority: code_du_travail.art(L1121-1)
           ∧ cass_soc(2002-07-10, "00-45135")
}

rule consumer_protection_override @ FR priority 100
  defeats non_compete_enforceable
  when party.role == "consumer" {
  authority: code_conso.art(L212-1)
}

// ─── LLM bridge (typed extraction) ─────────────────────────────
fact parties: List<Party> = extract<Party>(contract.pdf)
  using llm(claude-opus-4-7)
  verified_by human if confidence < 0.95

fact clause: NonCompete = extract<NonCompete>(contract.pdf, section="non-compete")
  using llm(claude-opus-4-7)

// ─── Query ─────────────────────────────────────────────────────
query {
  non_compete_enforceable(clause, parties[0]) as of 2026-04-18
}

// ─── Output (runtime produces) ─────────────────────────────────
// value:   false
// defeated_by: consumer_protection_override
// authorities:
//   - Code de la consommation, art. L212-1
//   - (underlying rule) Code du travail, art. L1121-1
//   - (underlying rule) Cass. soc. 2002-07-10, no. 00-45135
// facts_used: [parties[0].role="consumer", clause.duration=18mo, ...]
// proof_tree: <link to interactive tree>
```

---

## 5. Phased plan — 6 weeks, with a kill gate

### Week 0 — Foundations (½ week, before evenings start)

- [ ] Reach out to Denis Merigoux (Catala maintainer) — introduce Nomos, ask about IR reuse feasibility. Collaboration > duplication.
- [ ] Reach out to Lawvable maintainer — flag intent to publish a `nomos-reason` Claude Skill into `awesome-legal-skills`.
- [ ] Check relationship between our local `awesome-legal-skills` dir and Lawvable's repo — is it a fork, contribution, or independent?
- [ ] Register `lex-lang.dev` domain; reserve GitHub org `lex-lang`.

### Week 1 — Spike + kill gate prep

- [ ] Read the Catala paper (Merigoux et al., ICFP 2021) end-to-end.
- [ ] Read Lawsky, "A Logic for Statutes."
- [ ] Stand up minimal parser for 3 constructs: `rule`, `fact`, `query`. Chevrotain (TS) or pest (Rust) — decide after spike.
- [ ] Integrate Eyecite as citation resolver (Python subprocess or port to TS).
- [ ] Integrate Concerto type parser; add a `temporal` annotation experiment.
- [ ] Implement one toy rule end-to-end: "can this non-compete be enforced under French law?" with hard-coded facts.
- [ ] **Kill gate check** (end of week 3): does this feel like 15% new code over 85% OSS, or is every library fighting us? If the latter → stop, write up lessons, move on.

### Week 2 — Type system with temporal + jurisdiction

- [ ] Extend Concerto with `@ jurisdiction` and `from date` annotations.
- [ ] Type-checker rejects: wrong-jurisdiction rule application, as-of queries outside rule validity.
- [ ] Tests: 20 fixtures covering temporal edge cases.

### Week 3 — Defeasibility engine _(KILL GATE)_

- [ ] Decide: embed s(CASP) via CLI, or implement a minimal defeasible solver (priority + specificity + recency + lex-posterior).
- [ ] Prove it on three conflicting-rules scenarios from French labour law.
- [ ] Proof-tree data structure defined.
- [ ] **Honest self-review**: is the thesis surviving contact with reality? Am I solving a real problem or building a toy?

### Week 4 — LLM bridges (`extract<T>`)

- [ ] Implement `extract<T> using llm(...) verified_by human if confidence < X` as a runtime primitive.
- [ ] Anthropic / OpenRouter adapter with prompt caching (use `claude-api` skill).
- [ ] Structured output via JSON schema derived from Concerto types.
- [ ] Confidence estimation (log-probs or self-rated).
- [ ] **Benchmark** `extract<Clause>` against CUAD. Publish numbers in README, even if bad. Credibility depends on this.

### Week 5 — Provenance + Akoma Ntoso import

- [ ] Provenance threading: every computed value carries `{authorities, facts_used, as_of, rule_chain}`.
- [ ] Proof-tree renderer: JSON → interactive HTML (D3 or simple nested details).
- [ ] Akoma Ntoso loader: read one French statute, emit Nomos rule skeletons for a human to annotate (Catala-style).

### Week 6 — Surfaces + launch

- [ ] **VS Code LSP**: syntax highlighting, hover for authority, diagnostics.
- [ ] **CLI**: `lex run program.nomos --input data.json --as-of 2025-01-01`.
- [ ] **Web playground** at `lex-lang.dev` or `lex.dashable.dev` — textarea ↔ output ↔ proof tree.
- [ ] **Claude Skill** (`nomos-reason`) — reasons over a Nomos program from Claude Code. Submit to Lawvable's `awesome-legal-skills`.
- [ ] **Docassemble export** (basic — MVP).
- [ ] Branding pass: serif fonts, green accent, Catala-style article layout for docs.
- [ ] Launch post (LinkedIn + HN + r/legaltech): "I spent 6 weekends building a programming language for legal reasoning. Here's what I learned."

---

## 6. Distribution plan (OSS side-project style)

- **Primary channels**:
  - **Show HN** — "Nomos: a programming language for legal reasoning"
  - **Lawvable's `awesome-legal-skills`** — submit `nomos-reason` Claude Skill (this is the killer channel — 266 stars, concentrated legal-AI audience, community curation)
  - **r/legaltech, r/ProgrammingLanguages**
  - **LinkedIn post** in Stephane's voice (15.9K followers) — framed as "side project, not HAQQ"
- **Secondary / slower**:
  - Paper at **JURIX** or **ICAIL** 2027 with Catala / OpenFisca authors cited respectfully
  - Blog post comparison: Nomos vs Catala vs Blawx, honest about tradeoffs
  - Conference talk at **Legalweek** or **ILTACON** if traction warrants
- **Community seeding**:
  - Discord for early adopters
  - "Port a law to Nomos" starter issues (e.g., FR non-compete, LB labour code, EU GDPR Art. 6)

---

## 7. Risks and kill gates

| Risk                                                 | Mitigation                                                                                                                                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope balloons from "layer" to "greenfield language" | Hard kill gate end of week 3. If reuse ratio < 70%, stop.                                                                                                                    |
| Side project eats HAQQ Series A focus                | Evenings + weekends only. No weekday daytime work. If it starts leaking into work hours, pause.                                                                              |
| Catala maintainers ship LLM bridge before v0.1       | Engage Denis Merigoux in week 0; if they're doing this, consider contributing upstream instead.                                                                              |
| Lawvable doesn't accept the Skill submission         | Still publish standalone; community curation is a bonus, not a requirement.                                                                                                  |
| Novelty claims don't survive review                  | Credit Catala, Blawx, OpenFisca, Kowalski explicitly in README and paper. Position as "a layer that combines their strengths with LLM bridges," not "invented from scratch." |
| CUAD benchmark numbers are embarrassing              | Publish them anyway. Honesty is the OSS moat.                                                                                                                                |
| Personal energy fades after week 3                   | That's what kill gates are for. No shame in stopping.                                                                                                                        |

---

## 8. Open questions

- [ ] Is Nomos + LegalMD one repo or two? (Probably two, composable — LegalMD is the input format, Nomos the execution layer.)
- [ ] Do we ship a single `nomos` CLI or split into `nomos` (run) + `nomosc` (compile) + `nomos-lsp`? Unix-style split likely cleaner.
- [ ] Does the `@jurisdiction from date` go on `rule` only, or also on `type` definitions? (Precedent: types that exist only under certain statutes.)

---

## 9. What done looks like at week 6

A v0.1 that:

1. Parses and type-checks a 50-line Nomos program with 5 rules, 3 temporal ranges, 2 jurisdictions.
2. Resolves a query as-of any date, returns a value + proof tree.
3. Extracts a typed `Clause` from a real contract PDF via LLM, with a CUAD benchmark number in the README.
4. Runs as a Claude Skill, as a CLI, and in a web playground.
5. Has honest docs that cite Catala, OpenFisca, Blawx, Kowalski, Atticus.
6. Has 1 full worked example (French non-compete) that reviewers can play with.

If all six are true at week 6 → publish and see what the world says. If not → post-mortem in `lessons.md`, keep LegalMD alive as the smaller win.

---

## 10. Learnings log

_Populate as we go. Update `lessons.md` on every correction._
