import * as vscode from "vscode";
import dayjs from "dayjs";
import { DataSourceProvider } from "../database_provider";
import { Datasource } from "../entity/datasource";

export class CaEditor {
  private currentDatabase: Datasource | null = null;
  private currentConnection: Datasource | null = null;
  public provider: DataSourceProvider;
  private onDatabaseChangedCallback?: () => void;
  private context: vscode.ExtensionContext;

  constructor(provider: DataSourceProvider, context: vscode.ExtensionContext) {
    this.provider = provider;
    this.context = context;
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
    
    // 持久化保存当前选择
    this.saveCurrentSelection();
  }

  /**
   * 持久化保存当前选择的连接和数据库
   */
  private async saveCurrentSelection(): Promise<void> {
    try {
      if (this.currentConnection && this.currentDatabase) {
        await this.context.globalState.update('cadb.selectedDatabase', {
          connectionLabel: this.currentConnection.label?.toString() || '',
          databaseLabel: this.currentDatabase.label?.toString() || '',
          timestamp: Date.now()
        });
        console.log('[CaEditor] 已保存数据库选择:', {
          connection: this.currentConnection.label,
          database: this.currentDatabase.label
        });
      } else {
        // 清除保存的选择
        await this.context.globalState.update('cadb.selectedDatabase', undefined);
        console.log('[CaEditor] 已清除保存的数据库选择');
      }
    } catch (error) {
      console.error('[CaEditor] 保存数据库选择失败:', error);
    }
  }

  /**
   * 恢复上次选择的数据库
   */
  public async restoreLastSelection(): Promise<boolean> {
    try {
      const saved = this.context.globalState.get<{
        connectionLabel: string;
        databaseLabel: string;
        timestamp: number;
      }>('cadb.selectedDatabase');

      if (!saved) {
        console.log('[CaEditor] 没有保存的数据库选择');
        return false;
      }

      console.log('[CaEditor] 尝试恢复上次的数据库选择:', saved);

      // 查找连接
      const connection = this.provider.model.find(
        (conn) => conn.name === saved.connectionLabel
      );

      if (!connection) {
        console.warn('[CaEditor] 未找到保存的连接:', saved.connectionLabel);
        await this.context.globalState.update('cadb.selectedDatabase', undefined);
        return false;
      }

      const connectionNode = new Datasource(connection);
      this.currentConnection = connectionNode;

      // 获取数据库列表
      const objects = await connectionNode.expand(this.provider.context);
      const datasourceTypeNode = objects.find(
        (obj) => obj.type === "datasourceType"
      );

      if (!datasourceTypeNode) {
        console.warn('[CaEditor] 未找到数据库列表节点');
        return false;
      }

      const databases = await datasourceTypeNode.expand(this.provider.context);
      const database = databases.find(
        (db) => db.label?.toString() === saved.databaseLabel
      );

      if (!database) {
        console.warn('[CaEditor] 未找到保存的数据库:', saved.databaseLabel);
        await this.context.globalState.update('cadb.selectedDatabase', undefined);
        return false;
      }

      this.currentDatabase = database;
      this.notifyDatabaseChanged();

      console.log('[CaEditor] 成功恢复数据库选择:', {
        connection: this.currentConnection.label,
        database: this.currentDatabase.label
      });

      vscode.window.showInformationMessage(
        `已恢复上次的数据库: ${this.currentConnection.label} / ${this.currentDatabase.label}`
      );

      return true;
    } catch (error) {
      console.error('[CaEditor] 恢复数据库选择失败:', error);
      await this.context.globalState.update('cadb.selectedDatabase', undefined);
      return false;
    }
  }

  /**
   * 显示数据库选择器
   */
  public async selectDatabase(): Promise<void> {
    try {
      // 步骤 1: 选择连接
      const selectedConnection = await this.selectConnection();
      if (!selectedConnection) {
        // 用户取消，不改变状态
        return;
      }

      // 保存连接
      this.currentConnection = selectedConnection;
      // 步骤 2: 选择数据库
      const selectedDatabase = await this.selectDatabaseFromConnection(
        selectedConnection
      );
      if (!selectedDatabase) {
        // 用户取消选择数据库，保持连接但清除数据库
        this.currentDatabase = null;
        this.notifyDatabaseChanged();
        return;
      }

      // 保存数据库
      this.currentDatabase = selectedDatabase;
      // 通知更新
      this.notifyDatabaseChanged();

      // 显示成功消息
      vscode.window.showInformationMessage(
        `已选择数据库: ${this.currentConnection.label} / ${this.currentDatabase.label}`
      );
    } catch (error) {
      console.error("[CaEditor] 选择数据库时出错:", error);
      vscode.window.showErrorMessage(
        `选择数据库失败: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      // 出错时也通知更新
      this.notifyDatabaseChanged();
    }
  }

  /**
   * 选择连接
   */
  private async selectConnection(): Promise<Datasource | undefined> {
    const connections = this.provider.model.map((conn) => new Datasource(conn));

    if (connections.length === 0) {
      vscode.window.showWarningMessage("请先添加数据库连接");
      return undefined;
    }

    interface ConnectionQuickPickItem extends vscode.QuickPickItem {
      datasource: Datasource;
    }

    const connectionItems: ConnectionQuickPickItem[] = connections.map(
      (conn) => ({
        label: `$(plug) ${conn.label}`,
        description: typeof conn.tooltip === "string" ? conn.tooltip : "",
        datasource: conn,
      })
    );

    const selected = await vscode.window.showQuickPick(connectionItems, {
      placeHolder: "选择数据库连接",
      matchOnDescription: true,
    });

    return selected?.datasource;
  }

  /**
   * 从指定连接中选择数据库
   */
  private async selectDatabaseFromConnection(
    connection: Datasource
  ): Promise<Datasource | undefined> {
    return await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "正在获取数据库列表...",
        cancellable: false,
      },
      async () => {
        // 获取连接下的对象（包含 datasourceType, userType, fileType）
        const objects = await connection.expand(this.provider.context);

        // 找到 datasourceType 节点
        const datasourceTypeNode = objects.find(
          (obj) => obj.type === "datasourceType"
        );
        if (!datasourceTypeNode) {
          vscode.window.showWarningMessage("无法找到数据库列表节点");
          return undefined;
        }

        // 展开 datasourceType 节点获取所有数据库
        const databases = await datasourceTypeNode.expand(
          this.provider.context
        );

        if (databases.length === 0) {
          vscode.window.showWarningMessage("该连接没有可用的数据库");
          return undefined;
        }

        interface DatabaseQuickPickItem extends vscode.QuickPickItem {
          datasource: Datasource;
        }

        const databaseItems: DatabaseQuickPickItem[] = databases.map(
          (db: Datasource) => ({
            label: `$(database) ${db.label}`,
            description:
              typeof db.description === "string" ? db.description : "",
            datasource: db,
          })
        );

        const selected = await vscode.window.showQuickPick(databaseItems, {
          placeHolder: `选择 ${connection.label} 中的数据库`,
          matchOnDescription: true,
        });

        return selected?.datasource;
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
   * 直接设置当前数据库（从 TreeView 中选择）
   * @param database - 数据库 Datasource 对象（type: collection）
   */
  public setCurrentDatabase(database: Datasource): void {
		console.log(database);
    // 查找数据库的连接节点
    // 结构: datasource -> datasourceType -> collection
    let connectionNode: Datasource | undefined = undefined;
    
    if (database.type === 'collection' && database.parent?.type === 'datasource') {
      connectionNode = database.parent;
    }
    
    if (!connectionNode) {
      vscode.window.showErrorMessage('无法确定数据库所属的连接');
      return;
    }
    
    // 设置连接和数据库
    this.currentConnection = connectionNode;
    this.currentDatabase = database;
    
    // 通知更新
    this.notifyDatabaseChanged();
    
    // 显示成功消息
    vscode.window.showInformationMessage(
      `已切换到数据库: ${this.currentConnection.label} / ${this.currentDatabase.label}`
    );
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
