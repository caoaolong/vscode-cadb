import { readFile, readFileSync } from "fs";
import path from "path";
import * as vscode from "vscode";
import { generateNonce } from "./utils";

export class QueryWebview implements vscode.WebviewViewProvider {
  private context: vscode.ExtensionContext;
  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }
  resolveWebviewView(webviewView: vscode.WebviewView) {
    const nonce = generateNonce();
    readFile(
      path.join(
        this.context.extensionPath,
        "resources",
        "panels",
        "result.html"
      ),
      "utf-8",
      (err, data) => {
        if (err) {
          vscode.window.showErrorMessage(err.message);
          return;
        }
        webviewView.webview.options = {
          enableScripts: true,
        };
        const resourcesUri = webviewView.webview.asWebviewUri(
          vscode.Uri.joinPath(this.context.extensionUri, "resources", "panels")
        );
        const nodeResourcesUri = webviewView.webview.asWebviewUri(
          vscode.Uri.joinPath(this.context.extensionUri, "node_modules")
        );
        webviewView.webview.html = (
          data ||
          `
	<!DOCTYPE html>
	<html>
	<body>
		<h4>加载失败</h4>
	</body>
	</html>`
        )
          .replace(
            /{{csp}}/g,
            `
    default-src 'none';
		font-src ${webviewView.webview.cspSource};
    style-src ${webviewView.webview.cspSource} 'unsafe-inline';
    script-src 'nonce-${nonce}';
    connect-src ${webviewView.webview.cspSource};
  `.trim()
          )
          .replace(/{{node-resources-uri}}/g, nodeResourcesUri.toString())
          .replace(/{{resources-uri}}/g, resourcesUri.toString())
          .replace(/{{resource-nonce}}/g, nonce);
      }
    );
  }
}
