import * as vscode from "vscode";
import { DataSourceProvider } from "./database_provider";
import { Datasource } from "./entity/datasource";
import path from "path";

function createWebview(
  provider: DataSourceProvider,
  viewType: "datasourceConfig" | "datasourceTable",
  title: string
): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    viewType,
    title,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.file(
          path.join(provider.context.extensionPath, "resources", "panels")
        ),
        vscode.Uri.file(
          path.join(provider.context.extensionPath, "node_modules")
        ),
      ],
    }
  );

  const resourcesUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(provider.context.extensionUri, "resources", "panels")
  );
  const nodeResourcesUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(provider.context.extensionUri, "node_modules")
  );
  const nonce = generateNonce();
  panel.webview.html = provider.panels[viewType]
    .replace(
      /{{csp}}/g,
      `
    default-src 'none';
		font-src ${panel.webview.cspSource};
    style-src ${panel.webview.cspSource} 'unsafe-inline';
    script-src 'nonce-${nonce}';
    connect-src ${panel.webview.cspSource};
  `.trim()
    )
    .replace(/{{node-resources-uri}}/g, nodeResourcesUri.toString())
    .replace(/{{resources-uri}}/g, resourcesUri.toString())
    .replace(/{{resource-nonce}}/g, nonce);
  panel.iconPath = vscode.Uri.file(
    path.join(
      provider.context.extensionPath,
      "resources",
      "panels",
      "favicon.ico"
    )
  );
  return panel;
}

function generateNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export function registerDatasourceCommands(
  provider: DataSourceProvider,
  treeView: vscode.TreeView<Datasource>
) {
  vscode.commands.registerCommand("datasource.refreshEntry", provider.refresh);
  vscode.commands.registerCommand("datasource.addEntry", () =>
    addEntry(provider)
  );
  vscode.commands.registerCommand("datasource.editEntry", () =>
    editEntry(provider)
  );
  vscode.commands.registerCommand("datasource.expandEntry", async (item) => {
    const children = await (item as Datasource).expand();
    provider.createChildren(item as Datasource, children);
    treeView.reveal(item as Datasource, { expand: true });
  });
}

export function registerDatasourceItemCommands(provider: DataSourceProvider) {
  vscode.commands.registerCommand("dsItem.showData", async (args) => {
    const datasource = args as Datasource;
    const data = await datasource.listData();
    const panel = createWebview(
      provider,
      "datasourceTable",
      data?.title || "未命名页"
    );
    panel.webview.postMessage({
      command: "load",
      data: data,
    });
    panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case "save":
          console.log(message.data);
          break;
      }
    });
  });
}

function editEntry(provider: DataSourceProvider) {
  console.log(provider);
}

function addEntry(provider: DataSourceProvider) {
  const panel = createWebview(provider, "datasourceConfig", "数据库连接配置");
  panel.webview.onDidReceiveMessage(async (message) => {
    switch (message.command) {
      case "save":
        {
          await Datasource.createInstance(
            provider.model,
            provider.context,
            message.payload,
            true
          );
          provider.refresh();
          panel.webview.postMessage({
            command: "status",
            success: true,
            message: "✔️保存成功",
          });
        }
        return;
      case "test":
        {
          const db = await Datasource.createInstance(
            provider.model,
            provider.context,
            message.payload
          );
          const res = await db.test();
          if (res.success) {
            panel.webview.postMessage({
              command: "status",
              success: res.success,
              message: "✔️连接成功",
            });
          } else {
            panel.webview.postMessage({
              command: "status",
              success: res.success,
              message: `❗${res.message}`,
            });
          }
        }
        break;
    }
  });
}
