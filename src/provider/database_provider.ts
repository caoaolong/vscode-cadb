import path from "path";
import { readFileSync } from "fs";
import * as vscode from "vscode";
import { Datasource, DatasourceInputData } from "./entity/datasource";
import type { CaEditor } from "./component/editor";

/**
 * 树展开状态接口
 */
interface TreeState {
  expandedNodes: string[]; // 存储已展开节点的路径
  selectedDatabases?: Record<string, string[]>; // 存储每个连接选择显示的数据库
}

export class DataSourceProvider implements vscode.TreeDataProvider<Datasource> {
  public model: DatasourceInputData[];
  public context: vscode.ExtensionContext;
  public panels: Record<string, string>;
  public editor?: CaEditor;
  private treeState: TreeState;

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
      tableEdit: readFileSync(
        path.join(
          this.context.extensionPath,
          "resources",
          "panels",
          "edit.html"
        ),
        "utf-8"
      ),
      userEdit: readFileSync(
        path.join(
          this.context.extensionPath,
          "resources",
          "panels",
          "user.html"
        ),
        "utf-8"
      ),
    };

    // 加载树状态
    this.treeState = this.loadTreeState();
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
      return element.expand(this.context).then((children) => {
        element.children = children || [];
        
        // 如果是 datasourceType 节点，根据选择过滤数据库
        if (element.type === 'datasourceType' && element.parent) {
          const connectionName = element.parent.label?.toString();
          if (connectionName && this.treeState.selectedDatabases?.[connectionName]) {
            const selectedDbs = this.treeState.selectedDatabases[connectionName];
            if (selectedDbs.length > 0) {
              // 过滤只显示选中的数据库
              element.children = element.children.filter(child => 
                selectedDbs.includes(child.label?.toString() || '')
              );
            }
          }
        }
        
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
    // 刷新后保存树状态
    this.saveTreeState();
  };

  public createChildren = (
    parent: Datasource,
    children: Datasource[]
  ): void => {
    parent.children.push(...children);
    this._onDidChangeTreeData.fire(parent);
    // 创建子节点后保存树状态
    this.saveTreeState();
  };

  public setEditor(editor: CaEditor): void {
    this.editor = editor;
  }

  /**
   * 加载树状态
   */
  private loadTreeState(): TreeState {
    return this.context.globalState.get<TreeState>('cadb.treeState', {
      expandedNodes: [],
      selectedDatabases: {}
    });
  }

  /**
   * 保存树状态
   */
  private saveTreeState(): void {
    this.context.globalState.update('cadb.treeState', this.treeState);
    console.log('[TreeState] 已保存树状态:', this.treeState);
  }

  /**
   * 设置连接的选中数据库
   */
  public setSelectedDatabases(connectionName: string, databases: string[]): void {
    if (!this.treeState.selectedDatabases) {
      this.treeState.selectedDatabases = {};
    }
    this.treeState.selectedDatabases[connectionName] = databases;
    this.saveTreeState();
    console.log(`[TreeState] 已设置 ${connectionName} 的选中数据库:`, databases);
  }

  /**
   * 获取连接的选中数据库
   */
  public getSelectedDatabases(connectionName: string): string[] {
    return this.treeState.selectedDatabases?.[connectionName] || [];
  }
}
