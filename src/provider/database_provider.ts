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
    // Keep getTreeItem synchronous — child loading is handled in getChildren
    return element;
  }
  getChildren(
    element?: Datasource | undefined
  ): vscode.ProviderResult<Datasource[]> {
    if (element) {
      // If children already loaded, return them
      if (element.children && element.children.length) {
        return element.children;
      }

      // Otherwise load children asynchronously. Return a Promise so VS Code shows a loading indicator
      return element.expand().then((children) => {
        element.children = children || [];
        // Set collapsible state depending on whether children exist
        element.collapsibleState = (element.children && element.children.length)
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None;
        // Fire change for the parent so UI updates if needed
        this._onDidChangeTreeData.fire(element);
        return element.children;
      });
    }

    // Root items
    return this.model.map((e) => new Datasource(e));
  }
  getParent?(element: Datasource): vscode.ProviderResult<Datasource> {
    return null;
  }
  resolveTreeItem?(
    item: vscode.TreeItem,
    element: Datasource,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.TreeItem> {
    return null;
  }

  public refresh = (): void => {
    this.model = this.context.globalState.get<DatasourceInputData[]>(
      "cadb.connections",
      []
    );
    this._onDidChangeTreeData.fire();
  };

  public edit = (): void => {};

  public createChildren = (
    parent: Datasource,
    children: Datasource[]
  ): void => {
    parent.children.push(...children);
    this._onDidChangeTreeData.fire(parent);
  };

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
