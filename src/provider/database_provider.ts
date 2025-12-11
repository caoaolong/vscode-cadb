import * as vscode from "vscode";

class Datasource implements vscode.TreeItem {}

export class DataSourceProvider implements vscode.TreeDataProvider<Datasource> {
  constructor(private workspaceRoot: string | undefined) {}

  private _onDidChangeTreeData: vscode.EventEmitter<
    Datasource | undefined | null | void
  > = new vscode.EventEmitter<Datasource | undefined | null | void>();

  readonly onDidChangeTreeData:
    | vscode.Event<void | Datasource | Datasource[] | null | undefined>
    | undefined = this._onDidChangeTreeData.event;

  getTreeItem(
    element: Datasource
  ): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return element;
  }
  getChildren(
    element?: Datasource | undefined
  ): vscode.ProviderResult<Datasource[]> {
    vscode.window.showInformationMessage("No datasource in empty workspace");
    return Promise.resolve([]);
  }
  getParent?(element: Datasource): vscode.ProviderResult<Datasource> {
    throw new Error("Method not implemented.");
  }
  resolveTreeItem?(
    item: vscode.TreeItem,
    element: Datasource,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.TreeItem> {
    throw new Error("Method not implemented.");
  }

  public refresh(): void {
		console.log("refresh called");
    this._onDidChangeTreeData.fire();
  }
}
