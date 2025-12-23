import * as vscode from "vscode";

export class QueryWebview implements vscode.WebviewViewProvider {
  resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.html = `
      <!DOCTYPE html>
      <html>
      <body>
        <h3>执行结果</h3>
        <div id="content"></div>
      </body>
      </html>
    `;
  }
}
