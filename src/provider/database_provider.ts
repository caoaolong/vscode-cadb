import path from "path";
import { readFileSync } from "fs";
import * as vscode from "vscode";
import { Datasource, DatasourceInputData } from "./entity/datasource";

export class DataSourceProvider implements vscode.TreeDataProvider<Datasource> {
  public model: DatasourceInputData[];
  public context: vscode.ExtensionContext;
  public panels: Record<string, string>;
  constructor(context: vscode.ExtensionContext) {
    this.model = [];
    this.context = context;
    this.panels = {
      datasourceConfig: readFileSync(
        path.join(
          this.context.extensionPath,
          "resources",
          "panels",
          "config.html"
        ),
        "utf-8"
      ),
      datasourceTable: readFileSync(
        path.join(
          this.context.extensionPath,
          "resources",
          "panels",
          "grid.html"
        ),
        "utf-8"
      ),
    };
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
        element.collapsibleState =
          element.children && element.children.length
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
    return element.parent;
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

  public createChildren = (
    parent: Datasource,
    children: Datasource[]
  ): void => {
    parent.children.push(...children);
    this._onDidChangeTreeData.fire(parent);
  };
}
