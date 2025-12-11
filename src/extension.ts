// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { DataSourceProvider } from "./provider/database_provider";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const provider = new DataSourceProvider(context);
  vscode.window.registerTreeDataProvider("datasource", provider);
  vscode.commands.registerCommand("datasource.refreshEntry", provider.refresh);
  vscode.commands.registerCommand("datasource.addEntry", provider.add);
  vscode.commands.registerCommand("datasource.editEntry", provider.edit);
  vscode.window.createTreeView("datasource", {
    treeDataProvider: provider,
  });
}

// This method is called when your extension is deactivated
export function deactivate() {}
