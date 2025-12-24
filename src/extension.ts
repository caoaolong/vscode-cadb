// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { DataSourceProvider } from "./provider/database_provider";
import {
	registerCodeLensCommands,
  registerDatasourceCommands,
  registerDatasourceItemCommands,
} from "./provider/commands";
import { QueryWebview } from "./provider/query_provider";
import { SQLCodeLensProvider } from "./provider/sql_provider";

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
  // 输出面板
  const query = new QueryWebview(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("query", query)
  );
  // CodeLens
  const sqlCodeLens = new SQLCodeLensProvider();
  vscode.languages.registerCodeLensProvider("sql", sqlCodeLens);
	registerCodeLensCommands(sqlCodeLens);
}

// This method is called when your extension is deactivated
export function deactivate() {}
