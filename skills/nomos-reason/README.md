# nomos-reason — Claude Skill

A skill that teaches Claude to author, parse, and evaluate
[Nomos](https://nomos.dashable.dev) programs — a typed, defeasible
programming language for legal reasoning.

Triggers on: `.nomos` files, questions about enforceability / validity /
defeasibility, contract encoding, running `nomos run`, or debugging parse
and evaluation errors.

## What you get

- Full language reference inline in SKILL.md (types, rules, facts, queries, `extract<T>`, defeasibility)
- Two reference programs:
  - `references/french-non-compete.nomos` — temporal validity + priority defeater
  - `references/tiebreaker-lex-specialis.nomos` — specificity tiebreak
- A `scripts/submit-to-lawvable.sh` automation for the awesome-legal-skills PR

## Install

### Option 1 — Claude Code (local skills)

Drop the folder into your Claude Code skills directory:

```bash
# Clone the Nomos repo anywhere
git clone https://github.com/sboghossian/nomos ~/src/nomos

# Symlink the skill into Claude's skill directory
mkdir -p ~/.claude/skills
ln -s ~/src/nomos/skills/nomos-reason ~/.claude/skills/nomos-reason

# Restart Claude Code. It will pick up the skill automatically.
```

Or, pull a zipped release artifact:

```bash
curl -L -o /tmp/nomos-reason.zip \
  https://github.com/sboghossian/nomos/releases/latest/download/nomos-reason.zip
mkdir -p ~/.claude/skills
unzip -o /tmp/nomos-reason.zip -d ~/.claude/skills/
```

### Option 2 — Anthropic hosted skills

The skill can also be submitted to Anthropic's skill registry. Contact
the Nomos maintainer or open a PR at
[github.com/sboghossian/nomos](https://github.com/sboghossian/nomos).

### Option 3 — awesome-legal-skills (Lawvable)

```bash
bash scripts/submit-to-lawvable.sh
```

Opens a PR at
[lawvable/awesome-legal-skills](https://github.com/lawvable/awesome-legal-skills).

## Try it

Once installed, ask Claude:

> "Encode the California minimum wage rule in Nomos. Use `@ US-CA` as jurisdiction, `from 2023-01-01` as validity."

> "Does this non-compete clause enforce as of today? [paste clause]"

> "Why did `non_compete_enforceable` defeat `consumer_protection_override`?"

The skill's trigger description is broad enough to catch these naturally.

## License

Apache-2.0.
