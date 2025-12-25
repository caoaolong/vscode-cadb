import * as vscode from "vscode";
import dayjs from "dayjs";

export class CaEditor {
  constructor() {}

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

  public close() {}
}
