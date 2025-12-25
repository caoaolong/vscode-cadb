// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { DataSourceProvider } from "./provider/database_provider";
import {
	registerCodeLensCommands,
  registerDatasourceCommands,
  registerDatasourceItemCommands,
  registerEditorCommands,
  registerResultCommands,
} from "./provider/component/commands";
import { SQLCodeLensProvider } from "./provider/sql_provider";
import { CaEditor } from "./provider/component/editor";
import { ResultWebviewProvider } from "./provider/result_provider";
import { CaCompletionItemProvider } from "./provider/completion_item_provider";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // 清除数据
  // context.globalState.update("cadb.connections", undefined);

  const provider = new DataSourceProvider(context);
  // 视图命令
  vscode.window.registerTreeDataProvider("datasource", provider);
  const treeView = vscode.window.createTreeView("datasource", {
    treeDataProvider: provider,
  });
  registerDatasourceCommands(provider, treeView);
  treeView.onDidChangeVisibility((e) => {
    if (e.visible) {
      provider.refresh();
    }
  });
  // 数据项命令
  registerDatasourceItemCommands(provider);
  
  // CodeLens
  const sqlCodeLens = new SQLCodeLensProvider();
  vscode.languages.registerCodeLensProvider("sql", sqlCodeLens);
	registerCodeLensCommands(sqlCodeLens);
  
  // SQL 编辑器（带数据库选择器）
  const editor = new CaEditor(provider);
  provider.setEditor(editor);
  registerEditorCommands(editor);
  context.subscriptions.push(editor);

  // SQL 执行器需要 editor 引用
  sqlCodeLens.setEditor(editor);

  // 查询结果 Webview
  const resultProvider = new ResultWebviewProvider(context);
  registerResultCommands(resultProvider);

  // SQL 自动补全
  const completionProvider = new CaCompletionItemProvider();
  completionProvider.setEditor(editor);
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      'sql',
      completionProvider,
      '.', // 触发字符：点号用于 table.column
      ' '  // 触发字符：空格用于关键字后
    )
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}
