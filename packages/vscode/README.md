# Nomos for VS Code

Syntax highlighting, diagnostics, hover info, and completion for
[Nomos](https://nomos.dashable.dev) — an experimental programming language
for legal reasoning.

## Features

- **Syntax highlighting** — keywords, types, citations, dates, literals
- **Diagnostics** — live parse errors, checker warnings
- **Hover** — rule metadata (jurisdiction, validity, priority, defeats count)
- **Completion** — keywords + user-declared types/rules/facts

## Install (local dev)

```bash
cd packages/vscode
npm run build
code --install-extension $(npm pack --pack-destination /tmp | tail -1 | xargs -I{} echo /tmp/{})
```

Or open the `packages/vscode` folder in VS Code and press **F5** to launch
an Extension Development Host.

## Status

**v0.0.1 — experimental.** Breaking changes expected. See
[nomos-lang.dev/changelog](https://nomos.dashable.dev/changelog).

## License

Apache-2.0.
