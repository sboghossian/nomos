#!/usr/bin/env bash
# Submit nomos-reason to lawvable/awesome-legal-skills.
#
# Prerequisites:
#   - gh CLI authenticated (gh auth login)
#   - git configured
#
# What this does:
#   1. Forks lawvable/awesome-legal-skills under your GitHub account (if not already forked)
#   2. Clones the fork to /tmp/awesome-legal-skills-submission
#   3. Copies skills/nomos-reason/ into skills/nomos-reason-sboghossian/
#   4. Adds a README entry to the main README.md (manual step flagged)
#   5. Commits, pushes, opens a PR to upstream

set -euo pipefail

UPSTREAM="lawvable/awesome-legal-skills"
SKILL_NAME="nomos-reason-sboghossian"
WORK_DIR="/tmp/awesome-legal-skills-submission"
HERE="$(cd "$(dirname "$0")/.." && pwd)"

echo "→ forking $UPSTREAM..."
gh repo fork "$UPSTREAM" --clone=false --default-branch-only 2>/dev/null || echo "  (already forked)"

ME="$(gh api user --jq .login)"
MY_FORK="$ME/awesome-legal-skills"

echo "→ cloning $MY_FORK → $WORK_DIR"
rm -rf "$WORK_DIR"
gh repo clone "$MY_FORK" "$WORK_DIR"
cd "$WORK_DIR"
git remote add upstream "https://github.com/$UPSTREAM.git" 2>/dev/null || true
git fetch upstream main
git checkout -b "add-nomos-reason"
git merge --ff-only upstream/main

echo "→ copying skill contents"
mkdir -p "skills/$SKILL_NAME"
cp -R "$HERE/"* "skills/$SKILL_NAME/"

echo "→ staging + commit"
git add "skills/$SKILL_NAME"
git commit -m "Add nomos-reason skill

Nomos is an experimental programming language for legal reasoning with
typed rules, defeasible logic, temporal validity, LLM bridges, and proof
trees. This skill teaches Claude to author, parse, and evaluate .nomos
files.

- Website + playground: https://nomos.dashable.dev
- Source: https://github.com/sboghossian/nomos
- Apache-2.0
"

echo "→ pushing to fork"
git push -u origin add-nomos-reason

echo "→ opening PR"
gh pr create --repo "$UPSTREAM" \
  --title "Add nomos-reason skill" \
  --body "This PR adds \`nomos-reason\`, a skill for authoring and evaluating programs in [Nomos](https://nomos.dashable.dev) — an experimental programming language for legal reasoning.

**What's in the skill**
- Full language reference (types, rules, facts, queries, \`extract<T>\`)
- Defeasibility primer (priority → specificity → recency → declaration order)
- Worked example: French non-compete under the 2016 labour reform
- Two reference programs in \`references/\`
- Honest disclaimer: experimental, not legal advice

**Status**
Nomos is a side project built in public. v0.0.2 as of submission. Source
at https://github.com/sboghossian/nomos, Apache-2.0.

**License**
Apache-2.0.
"
echo
echo "✓ PR opened. Check your notifications / GitHub page."
