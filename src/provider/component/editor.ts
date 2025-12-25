import * as vscode from "vscode";
import dayjs from "dayjs";
import { DataSourceProvider } from "../database_provider";
import { Datasource } from "../entity/datasource";

export class CaEditor {
  private currentDatabase: Datasource | null = null;
  private currentConnection: Datasource | null = null;
  public provider: DataSourceProvider;
  private onDatabaseChangedCallback?: () => void;

  constructor(provider: DataSourceProvider) {
    this.provider = provider;
  }

  /**
   * 设置数据库变化回调
   */
  public setOnDatabaseChangedCallback(callback: () => void): void {
    this.onDatabaseChangedCallback = callback;
  }

  /**
   * 通知数据库选择已变化
   */
  private notifyDatabaseChanged(): void {
    if (this.onDatabaseChangedCallback) {
      this.onDatabaseChangedCallback();
    }
  }

  /**
   * 显示数据库选择器
   */
  public async selectDatabase(): Promise<void> {
    // 步骤 1: 选择连接
    const connections = this.provider.model.map(conn => new Datasource(conn));
    
    if (connections.length === 0) {
      vscode.window.showWarningMessage("请先添加数据库连接");
      return;
    }

    interface ConnectionQuickPickItem extends vscode.QuickPickItem {
      datasource: Datasource;
    }

    const connectionItems: ConnectionQuickPickItem[] = connections.map(conn => ({
      label: `$(plug) ${conn.label}`,
      description: typeof conn.tooltip === 'string' ? conn.tooltip : '',
      datasource: conn
    }));

    const selectedConnection = await vscode.window.showQuickPick(connectionItems, {
      placeHolder: "选择数据库连接",
      matchOnDescription: true
    });

    if (!selectedConnection) {
      return;
    }

    this.currentConnection = selectedConnection.datasource;
    // 不在这里通知，等选择完数据库后再通知

    // 步骤 2: 获取并选择数据库
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "正在获取数据库列表...",
        cancellable: false
      },
      async () => {
        try {
          if (!this.currentConnection) {
            return;
          }

          // 获取连接下的对象（包含 datasourceType, userType, fileType）
          const objects = await this.currentConnection.expand(
            this.provider.context
          );

          // 找到 datasourceType 节点
          const datasourceTypeNode = objects.find(obj => obj.type === 'datasourceType');
          if (!datasourceTypeNode) {
            vscode.window.showWarningMessage("无法找到数据库列表节点");
            return;
          }

          // 展开 datasourceType 节点获取所有数据库
          const databases = await datasourceTypeNode.expand(this.provider.context);

          if (databases.length === 0) {
            vscode.window.showWarningMessage("该连接没有可用的数据库");
            return;
          }

          interface DatabaseQuickPickItem extends vscode.QuickPickItem {
            datasource: Datasource;
          }

          const databaseItems: DatabaseQuickPickItem[] = databases.map((db: Datasource) => ({
            label: `$(database) ${db.label}`,
            description: typeof db.description === 'string' ? db.description : '',
            datasource: db
          }));

          const selectedDatabase = await vscode.window.showQuickPick(databaseItems, {
            placeHolder: this.currentConnection 
              ? `选择 ${this.currentConnection.label} 中的数据库`
              : '选择数据库',
            matchOnDescription: true
          });

          if (selectedDatabase) {
            this.currentDatabase = selectedDatabase.datasource;
            // 选择完数据库后通知更新
            this.notifyDatabaseChanged();
            if (this.currentConnection && this.currentDatabase) {
              vscode.window.showInformationMessage(
                `已选择数据库: ${this.currentConnection.label} / ${this.currentDatabase.label}`
              );
            }
          } else {
            // 用户取消选择数据库，也需要通知更新（显示警告状态）
            this.notifyDatabaseChanged();
          }
        } catch (error) {
          vscode.window.showErrorMessage(
            `获取数据库列表失败: ${error instanceof Error ? error.message : String(error)}`
          );
          // 发生错误时也通知更新
          this.notifyDatabaseChanged();
        }
      }
    );
  }

  /**
   * 获取当前选中的连接
   */
  public getCurrentConnection(): Datasource | null {
    return this.currentConnection;
  }

  /**
   * 获取当前选中的数据库
   */
  public getCurrentDatabase(): Datasource | null {
    return this.currentDatabase;
  }

  /**
   * 打开新的 SQL 编辑器
   */
  public async open(dir: vscode.Uri) {
    const filename = dayjs().format("YYYYMMDDHHmmss") + ".sql";
    const fileUri = vscode.Uri.joinPath(dir, filename);
    await vscode.workspace.fs.writeFile(
      fileUri,
      Buffer.from(`-- ${filename}\n`)
    );
    const doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc, {
      preview: false,
      viewColumn: vscode.ViewColumn.Active,
    });
  }

  /**
   * 清理资源
   */
  public dispose() {
    // 保留用于后续扩展
  }

  public close() {
    // 保留用于后续扩展
  }
}
