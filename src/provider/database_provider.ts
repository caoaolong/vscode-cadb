import path from "path";
import { readFileSync } from "fs";
import * as vscode from "vscode";
import { Datasource, DatasourceInputData } from "./entity/datasource";

export class DataSourceProvider implements vscode.TreeDataProvider<Datasource> {
  private model: DatasourceInputData[];
  private context: vscode.ExtensionContext;
  private configPanelHtml: string;
  constructor(context: vscode.ExtensionContext) {
    this.model = [];
    this.context = context;
    const configPanelPath = path.join(
      this.context.extensionPath,
      "resources",
      "panels",
      "config.html"
    );
    this.configPanelHtml = readFileSync(configPanelPath, "utf-8");
  }

  private _onDidChangeTreeData: vscode.EventEmitter<
    Datasource | undefined | null | void
  > = new vscode.EventEmitter<Datasource | undefined | null | void>();

  readonly onDidChangeTreeData:
    | vscode.Event<void | Datasource | Datasource[] | null | undefined>
    | undefined = this._onDidChangeTreeData.event;

  getTreeItem(
    element: Datasource
  ): vscode.TreeItem | Thenable<vscode.TreeItem> {
    console.log("getTreeItem", element);
    return element;
  }
  getChildren(
    element?: Datasource | undefined
  ): vscode.ProviderResult<Datasource[]> {
    return this.model.map((e) => new Datasource(e));
  }
  getParent?(element: Datasource): vscode.ProviderResult<Datasource> {
    console.log("getParent", element);
    return null;
  }
  resolveTreeItem?(
    item: vscode.TreeItem,
    element: Datasource,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.TreeItem> {
    console.log("resolveTreeItem", item, element, token);
    return null;
  }

  public refresh = (): void => {
    this.model = this.context.globalState.get<DatasourceInputData[]>(
      "cadb.connections",
      []
    );
		console.log(this.model);
    this._onDidChangeTreeData.fire();
  };

  public edit = (): void => {};

  public add = (): void => {
    const panel = vscode.window.createWebviewPanel(
      "databaseConfig",
      "数据库配置",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );
    panel.webview.html = this.configPanelHtml;
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
              this.model,
              this.context,
              message.payload,
              true
            );
            this.refresh();
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
              this.model,
              this.context,
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
  };
}
