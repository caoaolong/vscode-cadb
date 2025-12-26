import * as vscode from "vscode";
import { DataSourceProvider } from "../database_provider";
import { Datasource } from "../entity/datasource";
import path from "path";
import { FormResult } from "../entity/dataloader";
import { SQLCodeLensProvider } from "../sql_provider";
import { generateNonce } from "../utils";
import { CaEditor } from "./editor";
import { ResultWebviewProvider } from "../result_provider";
import { DatabaseSelector } from "./database_selector";

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
  vscode.commands.registerCommand("cadb.datasource.refresh", provider.refresh);
  vscode.commands.registerCommand("cadb.datasource.add", (item) =>
    addEntry(item, provider)
  );
  vscode.commands.registerCommand("cadb.datasource.edit", (item) =>
    editEntry(provider, item)
  );
  vscode.commands.registerCommand("cadb.datasource.expand", async (item) => {
    const children = await (item as Datasource).expand(provider.context);
    provider.createChildren(item as Datasource, children);
    treeView.reveal(item as Datasource, { expand: true });
  });
  
  // 注册选择数据库命令
  vscode.commands.registerCommand("cadb.datasource.selectDatabases", async (item: Datasource) => {
    try {
      console.log('[SelectDatabases] 开始选择数据库:', item.label);
      
      // 确保 item 是 datasourceType 节点
      if (item.type !== 'datasourceType') {
        vscode.window.showWarningMessage('请在数据库列表节点上执行此操作');
        return;
      }
      
      // 获取父节点（连接节点）
      const connectionNode = item.parent;
      if (!connectionNode || !connectionNode.label) {
        vscode.window.showWarningMessage('无法找到连接信息');
        return;
      }
      
      const connectionName = connectionNode.label.toString();
      console.log('[SelectDatabases] 连接名称:', connectionName);
      
      // 显示加载提示
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "正在加载数据库列表...",
          cancellable: false
        },
        async () => {
          // 获取所有数据库
          const allDatabases = await item.expand(provider.context);
          
          if (allDatabases.length === 0) {
            vscode.window.showWarningMessage('该连接没有可用的数据库');
            return;
          }
          
          console.log('[SelectDatabases] 数据库总数:', allDatabases.length);
          
          // 获取当前已选择的数据库
          const currentSelected = provider.getSelectedDatabases(connectionName);
          console.log('[SelectDatabases] 当前已选择:', currentSelected);
          
          // 创建 QuickPick 项
          interface DatabaseQuickPickItem extends vscode.QuickPickItem {
            database: string;
          }
          
          const quickPickItems: DatabaseQuickPickItem[] = allDatabases.map(db => ({
            label: db.label?.toString() || '',
            description: db.description || '',
            database: db.label?.toString() || '',
            picked: currentSelected.includes(db.label?.toString() || '')
          }));
          
          // 显示多选 QuickPick
          const selected = await vscode.window.showQuickPick(quickPickItems, {
            placeHolder: `选择要显示的数据库（当前连接: ${connectionName}）`,
            canPickMany: true,
            matchOnDescription: true
          });
          
          if (selected) {
            const selectedDbs = selected.map(item => item.database);
            console.log('[SelectDatabases] 用户选择:', selectedDbs);
            
            // 保存选择
            provider.setSelectedDatabases(connectionName, selectedDbs);
            
            // 清空 datasourceType 节点的子节点缓存，强制重新加载
            item.children = [];
            
            // 刷新 TreeView
            provider.refresh();
            
            vscode.window.showInformationMessage(
              `已选择 ${selectedDbs.length} 个数据库${selectedDbs.length === 0 ? '（将显示全部）' : ''}`
            );
          }
        }
      );
    } catch (error) {
      console.error('[SelectDatabases] 错误:', error);
      vscode.window.showErrorMessage(
        `选择数据库失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
}

export function registerDatasourceItemCommands(provider: DataSourceProvider) {
  vscode.commands.registerCommand("cadb.item.showData", async (args) => {
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

  // 注册打开 SQL 文件命令
  vscode.commands.registerCommand("cadb.file.open", async (args) => {
    const fileItem = args as Datasource;
    if (!fileItem || !fileItem.parent || !fileItem.parent.label) {
      vscode.window.showErrorMessage("无法打开文件：缺少必要信息");
      return;
    }

    // 构建文件路径
    const dsPath = vscode.Uri.joinPath(
      provider.context.globalStorageUri,
      fileItem.parent.label.toString(),
      fileItem.label?.toString() || ""
    );

    try {
      // 打开文件
      const doc = await vscode.workspace.openTextDocument(dsPath);
      await vscode.window.showTextDocument(doc, {
        preview: false,
        viewColumn: vscode.ViewColumn.Active,
      });
    } catch (error) {
      vscode.window.showErrorMessage(`打开文件失败: ${error}`);
    }
  });
}

export function registerCodeLensCommands(provider: SQLCodeLensProvider) {
  vscode.commands.registerCommand(
    "cadb.sql.explain",
    (sql: string, startLine: number, endLine: number) =>
      provider.explainSql(sql, startLine, endLine)
  );
  vscode.commands.registerCommand(
    "cadb.sql.run",
    (sql: string, startLine: number, endLine: number) =>
      provider.runSql(sql, startLine, endLine)
  );
}

export function registerEditorCommands(editor: CaEditor) {
  // 创建数据库选择器
  const databaseSelector = new DatabaseSelector(editor);

  // 设置数据库变化回调
  editor.setOnDatabaseChangedCallback(() => {
    databaseSelector.updateStatusBar();
  });

  // 注册数据库选择命令
  vscode.commands.registerCommand("cadb.sql.selectDatabase", () =>
    editor.selectDatabase()
  );

  // 返回 selector 以便在 extension.ts 中注册到 subscriptions
  return databaseSelector;
}

export function registerResultCommands(resultProvider: ResultWebviewProvider) {
  // 注册显示结果命令
  vscode.commands.registerCommand(
    "cadb.result.show",
    (result: any, sql: string) => resultProvider.showResult(result, sql)
  );

  // 注册显示错误命令
  vscode.commands.registerCommand(
    "cadb.result.showError",
    (error: string, sql: string) => resultProvider.showError(error, sql)
  );
}
