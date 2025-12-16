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
      ],
    }
  );

  const faviconUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(
      provider.context.extensionUri,
      "resources",
      "panels",
      "favicon.ico"
    )
  );

  const agGridJsUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(
      provider.context.extensionUri,
      "resources",
      "panels",
      "ag-grid-community.min.js"
    )
  );

  const globalCssUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(
      provider.context.extensionUri,
      "resources",
      "panels",
      "global.css"
    )
  );

  const globalJsUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(
      provider.context.extensionUri,
      "resources",
      "panels",
      "global.js"
    )
  );

  panel.webview.html = provider.panels[viewType]
    .replace(
      /{{csp}}/g,
      `
    default-src 'none';
    style-src ${panel.webview.cspSource} 'unsafe-inline';
    script-src ${panel.webview.cspSource};
		img-src ${panel.webview.cspSource} data:;
  `.trim()
    )
    .replace(/{{favicon-ico}}/g, faviconUri.toString())
    .replace(/{{ag-grid-js}}/g, agGridJsUri.toString())
    .replace(/{{global-css}}/g, globalCssUri.toString())
    .replace(/{{global-js}}/g, globalJsUri.toString());
  return panel;
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
      command: "data",
      data: data,
    });
  });
}

function editEntry(provider: DataSourceProvider) {
  console.log(provider);
}

function addEntry(provider: DataSourceProvider) {
  const panel = createWebview(provider, "datasourceConfig", "数据库连接配置");
  // send current theme to webview and keep it updated
  const sendThemeToWebview = (kind: vscode.ColorThemeKind) => {
    const themeName =
      kind === vscode.ColorThemeKind.Dark
        ? "dark"
        : kind === vscode.ColorThemeKind.Light
        ? "light"
        : "hc";
    panel.webview.postMessage({ command: "theme", theme: themeName });
  };

  // initial theme
  try {
    sendThemeToWebview(vscode.window.activeColorTheme.kind);
  } catch (e) {
    // ignore if not available
  }

  // listen for theme changes and forward to webview; dispose when panel closed
  const themeListener = vscode.window.onDidChangeActiveColorTheme((event) => {
    sendThemeToWebview(event.kind);
  });
  panel.onDidDispose(() => {
    themeListener.dispose();
  });

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
