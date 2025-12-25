import * as vscode from "vscode";
import path from "path";
import { readFileSync } from "fs";
import { generateNonce } from "./utils";

export class ResultWebviewProvider {
  private panel?: vscode.WebviewPanel;
  private context: vscode.ExtensionContext;
  private htmlTemplate: string;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.htmlTemplate = readFileSync(
      path.join(
        this.context.extensionPath,
        "resources",
        "panels",
        "result.html"
      ),
      "utf-8"
    );
  }

  /**
   * 显示查询结果
   */
  public showResult(result: any, sql: string): void {
    // 如果面板不存在，创建它
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        "sqlResult",
        "查询结果",
        vscode.ViewColumn.Two,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [
            vscode.Uri.file(
              path.join(this.context.extensionPath, "resources", "panels")
            ),
            vscode.Uri.file(
              path.join(this.context.extensionPath, "node_modules")
            ),
          ],
        }
      );

      this.panel.iconPath = vscode.Uri.file(
        path.join(
          this.context.extensionPath,
          "resources",
          "panels",
          "favicon.ico"
        )
      );

      // 设置 HTML 内容
      this.panel.webview.html = this.getHtmlContent(this.panel.webview);

      // 监听面板关闭事件
      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });
    } else {
      // 如果面板已存在，显示它
      this.panel.reveal(vscode.ViewColumn.Two);
    }

    // 发送结果到 webview
    this.sendResult(result, sql);
  }

  /**
   * 发送结果到 webview
   */
  private sendResult(result: any, sql: string): void {
    if (!this.panel) {
      return;
    }

    // 提取列定义
    const columns = result.fields?.map((field: any) => ({
      field: field.name,
      type: field.type
    })) || [];

    // 提取数据
    const data = Array.isArray(result.results) ? result.results : [];

    // 生成标签标题
    const sqlPreview = sql.length > 50 ? sql.substring(0, 50) + "..." : sql;
    const title = `查询结果 (${data.length}行)`;

    // 发送消息到 webview
    this.panel.webview.postMessage({
      command: "showResult",
      title: title,
      columns: columns,
      data: data,
      id: `result-${Date.now()}`,
      pinned: false
    });
  }

  /**
   * 显示错误消息
   */
  public showError(error: string, sql: string): void {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        "sqlResult",
        "查询结果",
        vscode.ViewColumn.Two,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [
            vscode.Uri.file(
              path.join(this.context.extensionPath, "resources", "panels")
            ),
            vscode.Uri.file(
              path.join(this.context.extensionPath, "node_modules")
            ),
          ],
        }
      );

      this.panel.webview.html = this.getHtmlContent(this.panel.webview);

      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });
    } else {
      this.panel.reveal(vscode.ViewColumn.Two);
    }

    // 发送错误消息
    this.panel.webview.postMessage({
      command: "showMessage",
      title: "执行失败",
      text: error,
      type: "error",
      id: `error-${Date.now()}`,
      pinned: false
    });
  }

  /**
   * 获取 HTML 内容
   */
  private getHtmlContent(webview: vscode.Webview): string {
    const resourcesUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "resources", "panels")
    );
    const nodeResourcesUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "node_modules")
    );
    const nonce = generateNonce();

    return this.htmlTemplate
      .replace(
        /{{csp}}/g,
        `
    default-src 'none';
		font-src ${webview.cspSource};
    style-src ${webview.cspSource} 'unsafe-inline';
    script-src 'nonce-${nonce}';
    connect-src ${webview.cspSource};
  `.trim()
      )
      .replace(/{{node-resources-uri}}/g, nodeResourcesUri.toString())
      .replace(/{{resources-uri}}/g, resourcesUri.toString())
      .replace(/{{resource-nonce}}/g, nonce);
  }
}

