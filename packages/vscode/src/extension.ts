/**
 * VS Code extension entry — launches the Nomos language server.
 *
 * The extension and the server live in the same package for simplicity:
 * `src/extension.ts` is loaded by VS Code and spawns `dist/server.js` as
 * a child process via the language-client transport.
 */

import * as path from "node:path";
import { ExtensionContext } from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node.js";

let client: LanguageClient | undefined;

export function activate(context: ExtensionContext): void {
  const serverModule = context.asAbsolutePath(path.join("dist", "server.js"));

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ["--inspect=6009"] },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "nomos" }],
    synchronize: { configurationSection: "nomos" },
  };

  client = new LanguageClient(
    "nomos",
    "Nomos Language Server",
    serverOptions,
    clientOptions,
  );

  context.subscriptions.push({
    dispose: () => void client?.stop(),
  });

  void client.start();
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) return undefined;
  return client.stop();
}
