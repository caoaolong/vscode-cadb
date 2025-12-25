import * as vscode from "vscode";
import { DataSourceProvider } from "../database_provider";
import { Datasource } from "../entity/datasource";
import path from "path";
import { FormResult } from "../entity/dataloader";
import { SQLCodeLensProvider } from "../sql_provider";
import { generateNonce } from "../utils";
import { CaEditor } from "./editor";
import { ResultWebviewProvider } from "../result_provider";

function createWebview(
  provider: DataSourceProvider,
  viewType: "datasourceConfig" | "datasourceTable" | "tableEdit" | "userEdit",
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

async function editEntry(provider: DataSourceProvider, item: Datasource) {
  let panel = null;
  if (item.type === "datasource") {
    panel = createWebview(
      provider,
      "datasourceConfig",
      `【${item.label}】编辑`
    );
  } else if (item.type === "user") {
    panel = createWebview(provider, "userEdit", `【${item.label}】编辑`);
  } else if (
    item.type === "document" ||
    item.type === "field" ||
    item.type === "index"
  ) {
    panel = createWebview(provider, "tableEdit", `【${item.label}】编辑`);
  } else {
    return;
  }
  const data: FormResult | undefined = await item.edit();
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
}

async function addEntry(item: any, provider: DataSourceProvider) {
  if (item) {
    await (item as Datasource).create(provider.context, provider.editor);
    provider.refresh();
  } else {
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
}

export function registerDatasourceCommands(
  provider: DataSourceProvider,
  treeView: vscode.TreeView<Datasource>
) {
  vscode.commands.registerCommand("datasource.refreshEntry", provider.refresh);
  vscode.commands.registerCommand("datasource.addEntry", (item) =>
    addEntry(item, provider)
  );
  vscode.commands.registerCommand("datasource.editEntry", (item) =>
    editEntry(provider, item)
  );
  vscode.commands.registerCommand("datasource.expandEntry", async (item) => {
    const children = await (item as Datasource).expand(provider.context);
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

export function registerCodeLensCommands(provider: SQLCodeLensProvider) {
  vscode.commands.registerCommand(
    "sql.explainSql",
    (sql: string, startLine: number, endLine: number) =>
      provider.explainSql(sql, startLine, endLine)
  );
  vscode.commands.registerCommand(
    "sql.runSql",
    (sql: string, startLine: number, endLine: number) =>
      provider.runSql(sql, startLine, endLine)
  );
}

export function registerEditorCommands(editor: CaEditor) {
  // 注册数据库选择命令
  vscode.commands.registerCommand("sql.selectDatabase", () =>
    editor.selectDatabase()
  );

  // 监听活动编辑器变化，更新状态栏显示
  vscode.window.onDidChangeActiveTextEditor(() => {
    editor.onActiveEditorChanged();
  });
}

export function registerResultCommands(resultProvider: ResultWebviewProvider) {
  // 注册显示结果命令
  vscode.commands.registerCommand("sql.showResult", (result: any, sql: string) =>
    resultProvider.showResult(result, sql)
  );

  // 注册显示错误命令
  vscode.commands.registerCommand("sql.showError", (error: string, sql: string) =>
    resultProvider.showError(error, sql)
  );
}
