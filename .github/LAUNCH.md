# v0.1 launch materials

Drafts for when you're ready to go public. Tune the voice before sending.

---

## LinkedIn post (Stephane voice)

I spent six evenings building a programming language.

It's called **Nomos** (νόμος — Greek for "law"). It does one thing: you
write legal rules as code, it tells you which one wins and why, with a
proof tree back to statutes.

Three things nobody else has combined:

▸ LLMs at the edges, not the center. `extract<Party>(contract.pdf) using
llm(...) verified_by human if confidence < 0.95` is a language primitive,
not library plumbing.

▸ Defeasibility by design. Priority → specificity → recency → lex
posterior. When a consumer-protection rule defeats a labour-law rule,
Nomos explains the tiebreak in English.

▸ Provenance, always. Every value carries its authorities, facts, and
rule chain. Ask the verdict _why_ — get a tree back to statutes.

First CUAD benchmark numbers: 0.75 contains / 0.97 confidence on 20 real
commercial-contract extractions. Honest — including where it's weak.

Side project. Built in public. Apache-2.0.

→ nomos.dashable.dev
→ github.com/sboghossian/nomos

Not legal advice. Not a company. Just an experiment in what a 2026
rules-as-code language could look like if you put the LLM in the right place.

Credits where due: Catala (Inria), OpenFisca, Blawx, Kowalski's 1981
British Nationality Act encoding. Fifty years of work I'm standing on.

---

## HN title + post

**Title**: Show HN: Nomos — a programming language for legal reasoning

**Body**:

Hi HN. Side project, shipped tonight.

Nomos encodes legal rules with three properties:

1. **Typed LLM bridges.** `extract<T>` is a language primitive. The
   compiler derives a JSON schema from the target type and the model
   returns structured data. Confidence is self-rated; low confidence
   routes to a human queue.

2. **Defeasibility.** Rules conflict. Nomos resolves by priority →
   specificity (lex specialis) → recency (lex posterior) → declaration
   order. Every tiebreak is explained in the proof tree.

3. **Temporal + jurisdiction typing.** Rules declare `@ FR from
2016-08-10`. Queries run `as of <date>`. The compiler refuses to
   apply a post-reform rule to a pre-reform fact.

Written in TypeScript. Parses via Chevrotain. LLM calls via OpenRouter.
Citations via Eyecite (Free Law Project). VS Code extension + Claude
Skill included.

First CUAD run: 20 extractions, 0.45 EM, 0.75 contains, 0.66 F1, 0.97
confidence on Sonnet 4.5. Honest numbers at /research/benchmarks.

Not production-ready. Not legal advice. Experimental v0. Apache-2.0.

Playground: https://nomos.dashable.dev/play  
Source: https://github.com/sboghossian/nomos  
Prior art respected: https://nomos.dashable.dev/research/prior-art

Happy to answer questions about the design tradeoffs.

---

## r/legaltech post

Built an experimental language over the weekend where legal rules are
first-class and LLMs sit at the edge. Think Catala × LangGraph ×
OpenFisca, but TypeScript and with the LLM bridge nobody else has.

Playground runs a French non-compete scenario in-browser:
https://nomos.dashable.dev/play

Toggle "LLM" and it'll extract a typed `Party` + `NonCompete` from real
French contract prose, then tell you if the clause is enforceable with
a proof chain citing Code du travail + Cass. soc. case law.

Flip the party's role to "consumer" and watch the consumer-protection
rule defeat the base rule — with the tiebreaker explained.

Honest CUAD numbers published: 0.75 contains / 0.97 mean confidence on
a small sample. Will run the full 500-extraction sweep next week.

Not legal advice, not a company. Side project. Apache-2.0.

Feedback welcome — especially from folks who've tried Catala or Blawx.

---

## Twitter / X thread (8 posts)

**1/** I built a programming language this week.

It's called Nomos. It lets you write legal rules as code and tells you
which one wins — with a proof tree back to statutes.

Side project, shipped in public.

https://nomos.dashable.dev

**2/** The thesis: legal reasoning is already a computation. Statutes
are predicates. Facts are inputs. Precedent is priority ordering.

Logic programming knew this in the 1970s. The bottleneck was always
getting prose into rules at scale.

LLMs changed that. But not the way you think.

**3/** In Nomos, LLMs are at the EDGE, not the center.

`extract<Party>(contract.pdf) using llm(claude-sonnet-4-5)
verified_by human if confidence < 0.95`

That's a language primitive. The compiler derives a JSON schema from
the target type. Low confidence → human queue. Not vibes, not soup.

**4/** Inside the language, everything is deterministic and defeasible.

Rules declare `@ FR from 2016-08-10 priority 100 defeats X when Y`.

Priority → specificity → recency → lex posterior. When a
consumer-protection rule defeats a labour-law rule, Nomos explains the
tiebreak in English.

**5/** Every value carries its proof.

Authorities. Facts used. Rules defeated. As-of date.

Ask the verdict "why" and you get a tree back to statute articles and
case numbers. This is what regulated industries have always needed.

**6/** It runs in your browser.

https://nomos.dashable.dev/play

Flip the party role to "consumer" and watch the verdict flip from
ENFORCEABLE to NOT ENFORCEABLE — with `consumer_protection_override`
winning on priority 100 vs 0.

**7/** First CUAD benchmark: 0.75 contains / 0.97 confidence on 20
real contract extractions. Honest numbers — including where it fails
(Parties = too verbose).

Published verbatim at /research/benchmarks. Wins and losses both.

**8/** Not a company. Not legal advice. Apache-2.0 side project
built on 50 years of rules-as-code research (Catala, OpenFisca,
Blawx, Kowalski).

Credits in /research/prior-art.

https://github.com/sboghossian/nomos

---

## Outreach shortlist

- **Denis Merigoux** (Catala) — "would value your feedback on the
  defeasibility approach; credited in our prior-art page."
- **Jason Morris** (Blawx / Lexpedite) — "CodeX community; happy to
  contribute to awesome-legal-skills."
- **Free Law Project** — "eyecite integration shipped; happy to
  attribute upstream properly."
- **Atticus Project** — "first CUAD numbers here; would welcome any
  critique of the harness."
- **Lawvable (Sandro Polizzotto)** — submit `nomos-reason` to
  awesome-legal-skills via `scripts/submit-to-lawvable.sh`.

---

## LinkedIn post — humanized, v0.1.1 (Stephane's draft, extended)

I built a programming language for legal reasoning.

It's called Nomos — νόμος, /ˈnomos/, Greek for law, custom, rule. Yes, you heard that right. A programming language. For legal rules.

It's basic. It works at scale. Here it is: https://lnkd.in/egi9_fWR

Why I built it: I work at Hock, deep in legal tech every day. I kept running into the same wall — LLMs are great at reading contracts, terrible at reasoning with rules. Rule engines are great at reasoning, terrible at reading contracts. Nobody was putting them together the right way.

So I spent a few evenings trying. You write typed rules. The LLM pulls facts out of a contract. When two rules contradict — a consumer law vs a labour law — Nomos picks a winner and shows its work, with citations back to statutes.

This is a side project. Apache-2.0. Not a company. Not legal advice. An experiment.

I'd love help:

- Try the playground in your browser: nomos.dashable.dev/play
- Install the Claude Skill: github.com/sboghossian/nomos/tree/main/skills/nomos-reason
- Break things, file issues, send PRs: github.com/sboghossian/nomos
- Build on top — the core is a TypeScript package you can import today

Built in public, mostly with Claude Code as a pair. If you work in legal tech, rules-as-code, or just like weird little languages, come poke at it. The open-source legal community has carried this idea for fifty years (Catala, OpenFisca, Blawx, Kowalski's 1981 British Nationality Act paper) — I'm just adding one more experiment on top.

Feedback, critiques, PRs — all very welcome.

→ nomos.dashable.dev
→ github.com/sboghossian/nomos

---

## Pre-flight checklist

- [ ] All tests green (`npm test` — 26 passing)
- [ ] `nomos run` works on all fixtures
- [ ] Playground loads + LLM toggle works end-to-end
- [ ] `nomos-api.dashable.dev/health` returns 200
- [ ] README has CUAD table + links
- [ ] CHANGELOG.md reflects v0.1.0
- [ ] Git tag `v0.1.0` pushed
- [ ] OpenRouter key rotated (was pasted in a session transcript)
- [ ] Banner/screenshot for the LinkedIn post (verdict card flipping between scenarios)
