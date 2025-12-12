// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { DataSourceProvider } from "./provider/database_provider";
import { Datasource } from "./provider/entity/datasource";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // 清除数据
  // context.globalState.update("cadb.connections", undefined);

  const provider = new DataSourceProvider(context);
  // 注册命令
  // 视图命令
  vscode.window.registerTreeDataProvider("datasource", provider);
  vscode.commands.registerCommand("datasource.refreshEntry", provider.refresh);
  vscode.commands.registerCommand("datasource.addEntry", provider.add);
  vscode.commands.registerCommand("datasource.editEntry", provider.edit);
  const treeView = vscode.window.createTreeView("datasource", {
    treeDataProvider: provider,
  });
  treeView.onDidChangeVisibility((e) => {
    if (e.visible) {
      provider.refresh();
    }
  });
  vscode.commands.registerCommand("datasource.expandEntry", async (item) => {
    const children = await (item as Datasource).expand();
    provider.createChildren(item as Datasource, children);
    treeView.reveal(item as Datasource, { expand: true });
  });
}

// This method is called when your extension is deactivated
export function deactivate() {}
