import { readFile, readFileSync } from "fs";
import path from "path";
import * as vscode from "vscode";

export class QueryWebview implements vscode.WebviewViewProvider {
  private context: vscode.ExtensionContext;
  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }
  resolveWebviewView(webviewView: vscode.WebviewView) {
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

        webviewView.webview.html =
          data ||
          `
	<!DOCTYPE html>
	<html>
	<body>
		<h4>加载失败</h4>
	</body>
	</html>`;
      }
    );
  }
}
