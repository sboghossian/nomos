/**
 * Nomos language server.
 *
 * A minimal LSP wrapping @nomos/core. Features in v0:
 *  - Incremental text sync
 *  - Diagnostics on every change (lex errors, parse errors, checker warnings)
 *  - Hover: show kind + basic metadata for identifiers under the cursor
 *  - Completion: keyword + known-type proposals inside declarations
 *
 * Later: go-to-definition, rename, semantic tokens, inlay hints.
 */

import {
  createConnection,
  Diagnostic,
  DiagnosticSeverity,
  DidChangeConfigurationNotification,
  InitializeParams,
  InitializeResult,
  Position,
  ProposedFeatures,
  Range,
  TextDocuments,
  TextDocumentSyncKind,
  CompletionItem,
  CompletionItemKind,
  Hover,
  MarkupKind,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { parse, check } from "@nomos/core";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      hoverProvider: true,
      completionProvider: { triggerCharacters: [" ", "@", ".", "<"] },
    },
  };
});

connection.onInitialized(() => {
  connection.client.register(
    DidChangeConfigurationNotification.type,
    undefined,
  );
});

// ─── Diagnostics ───────────────────────────────────────────────────────────

async function validate(doc: TextDocument): Promise<void> {
  const src = doc.getText();
  const result = parse(src);
  const diagnostics: Diagnostic[] = [];

  for (const e of result.lexErrors) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: rangeAt(e.line, e.column),
      source: "nomos",
      message: e.message,
    });
  }
  for (const e of result.parseErrors) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: rangeAt(e.line, e.column),
      source: "nomos",
      message: e.message,
    });
  }

  if (result.ast) {
    const checked = check(result.ast);
    for (const d of checked.diagnostics) {
      diagnostics.push({
        severity:
          d.severity === "error"
            ? DiagnosticSeverity.Error
            : DiagnosticSeverity.Warning,
        range: rangeAt(d.line, d.column),
        source: "nomos",
        message: d.message,
      });
    }
  }

  connection.sendDiagnostics({ uri: doc.uri, diagnostics });
}

function rangeAt(line: number, column: number): Range {
  // LSP positions are 0-based; our diagnostics are 1-based.
  const l = Math.max(0, line - 1);
  const c = Math.max(0, column - 1);
  return {
    start: { line: l, character: c },
    end: { line: l, character: c + 1 },
  };
}

documents.onDidChangeContent((e) => {
  void validate(e.document);
});

// ─── Hover ─────────────────────────────────────────────────────────────────

connection.onHover(({ textDocument, position }): Hover | null => {
  const doc = documents.get(textDocument.uri);
  if (!doc) return null;
  const word = wordAt(doc, position);
  if (!word) return null;
  const src = doc.getText();
  const parsed = parse(src);
  if (!parsed.ast) return null;

  const symbols = collectSymbols(parsed.ast);
  const kind = symbols.types.has(word)
    ? "type"
    : symbols.rules.has(word)
      ? "rule"
      : symbols.facts.has(word)
        ? "fact"
        : null;
  if (!kind) return null;

  const lines = [`**${word}** — ${kind}`];
  if (kind === "rule") {
    const r = symbols.rules.get(word)!;
    if (r.jurisdiction) lines.push(`@${r.jurisdiction}`);
    if (r.from) lines.push(`valid from \`${r.from}\``);
    if (r.priority !== 0) lines.push(`priority **${r.priority}**`);
    if (r.defeats.length) lines.push(`defeats: ${r.defeats.join(", ")}`);
    lines.push(
      `${r.requires.length} requires · ${r.authorities.length} authorities`,
    );
  }
  return {
    contents: { kind: MarkupKind.Markdown, value: lines.join("\n\n") },
  };
});

function wordAt(doc: TextDocument, pos: Position): string | null {
  const src = doc.getText();
  const offset = doc.offsetAt(pos);
  let start = offset;
  let end = offset;
  const isWord = (c: string) => /[A-Za-z0-9_]/.test(c);
  while (start > 0 && isWord(src[start - 1]!)) start--;
  while (end < src.length && isWord(src[end]!)) end++;
  if (start === end) return null;
  return src.slice(start, end);
}

function collectSymbols(program: import("@nomos/core").Program) {
  const types = new Map<string, import("@nomos/core").TypeDecl>();
  const rules = new Map<string, import("@nomos/core").RuleDecl>();
  const facts = new Map<string, import("@nomos/core").FactDecl>();
  for (const d of program.declarations) {
    if (d.kind === "TypeDecl") types.set(d.name, d);
    else if (d.kind === "RuleDecl") rules.set(d.name, d);
    else if (d.kind === "FactDecl") facts.set(d.name, d);
  }
  return { types, rules, facts };
}

// ─── Completion ────────────────────────────────────────────────────────────

const KEYWORDS = [
  "rule",
  "fact",
  "query",
  "type",
  "when",
  "requires",
  "authority",
  "from",
  "as of",
  "priority",
  "defeats",
  "using",
  "verified_by",
  "if",
  "extract",
  "llm",
  "human",
  "is",
];

const PRIMITIVES = [
  "String",
  "Float",
  "Int",
  "Integer",
  "Bool",
  "Boolean",
  "Date",
  "Duration",
  "Geography",
  "List",
];

connection.onCompletion(({ textDocument }): CompletionItem[] => {
  const items: CompletionItem[] = [];
  for (const k of KEYWORDS) {
    items.push({ label: k, kind: CompletionItemKind.Keyword });
  }
  for (const p of PRIMITIVES) {
    items.push({ label: p, kind: CompletionItemKind.Class });
  }
  // User-declared types/rules/facts from the current document.
  const doc = documents.get(textDocument.uri);
  if (doc) {
    const parsed = parse(doc.getText());
    if (parsed.ast) {
      const sym = collectSymbols(parsed.ast);
      for (const [name] of sym.types) {
        items.push({ label: name, kind: CompletionItemKind.Class });
      }
      for (const [name] of sym.rules) {
        items.push({ label: name, kind: CompletionItemKind.Function });
      }
      for (const [name] of sym.facts) {
        items.push({ label: name, kind: CompletionItemKind.Variable });
      }
    }
  }
  return items;
});

documents.listen(connection);
connection.listen();
