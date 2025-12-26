import * as vscode from "vscode";
import type { CaEditor } from "./component/editor";

export class SQLCodeLensProvider implements vscode.CodeLensProvider {
  private codeLenses: vscode.CodeLens[] = [];
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> =
    new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> =
    this._onDidChangeCodeLenses.event;
  private editor?: CaEditor;

  constructor() {
    vscode.workspace.onDidChangeConfiguration((_) => {
      this._onDidChangeCodeLenses.fire();
    });
  }

  public setEditor(editor: CaEditor): void {
    this.editor = editor;
  }

  public provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
    this.codeLenses = [];
    const text = document.getText();

    // 匹配以分号结尾的 SQL 语句（支持多行）
    // 匹配从行首开始到分号结束的内容
    const sqlStatements = this.extractSQLStatements(text);

    sqlStatements.forEach(({ sql, startLine, endLine }) => {
      // 获取 SQL 语句的类型
      const sqlType = this.getSQLType(sql);

      if (sqlType) {
        // 创建 Range（从语句开始到结束）
        const range = new vscode.Range(
          new vscode.Position(startLine, 0),
          new vscode.Position(endLine, document.lineAt(endLine).text.length)
        );

        // 根据 SQL 类型添加 CodeLens
        if (sqlType === "SELECT") {
          // SELECT 语句显示 Run 和 Explain
          this.codeLenses.push(
            new vscode.CodeLens(range, {
              title: "▷ Run",
              tooltip: "运行 SQL 查询",
              command: "cadb.sql.run",
              arguments: [sql, startLine, endLine],
            })
          );
          this.codeLenses.push(
            new vscode.CodeLens(range, {
              title: "▷ Explain",
              tooltip: "解释 SQL 执行计划",
              command: "cadb.sql.explain",
              arguments: [sql, startLine, endLine],
            })
          );
        } else {
          // 其他语句只显示 Run
          this.codeLenses.push(
            new vscode.CodeLens(range, {
              title: "▷ Run",
              tooltip: `运行 ${sqlType} 语句`,
              command: "cadb.sql.run",
              arguments: [sql, startLine, endLine],
            })
          );
        }
      }
    });

    return this.codeLenses;
  }

  /**
   * 提取文档中所有以分号结尾的 SQL 语句
   */
  private extractSQLStatements(text: string): Array<{
    sql: string;
    startLine: number;
    endLine: number;
  }> {
    const statements: Array<{
      sql: string;
      startLine: number;
      endLine: number;
    }> = [];
    const lines = text.split("\n");

    let currentStatement = "";
    let startLine = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // 跳过空行和注释
      if (!line || line.startsWith("--") || line.startsWith("#")) {
        continue;
      }

      // 如果是新语句的开始
      if (currentStatement === "") {
        startLine = i;
      }

      // 累积当前行到语句中
      currentStatement += (currentStatement ? " " : "") + line;

      // 如果行以分号结尾，说明语句完整
      if (line.endsWith(";")) {
        statements.push({
          sql: currentStatement,
          startLine: startLine,
          endLine: i,
        });
        currentStatement = "";
        startLine = -1;
      }
    }

    return statements;
  }

  /**
   * 获取 SQL 语句类型（不区分大小写）
   * 返回: SELECT | CREATE | UPDATE | DELETE | INSERT | ALTER | DROP | EXPLAIN | null
   */
  private getSQLType(sql: string): string | null {
    // 移除开头的空白字符
    const trimmedSql = sql.trim().toUpperCase();

    // 定义支持的 SQL 语句类型
    const sqlTypes = [
      "SELECT",
      "CREATE",
      "UPDATE",
      "DELETE",
      "INSERT",
      "ALTER",
      "DROP",
      "EXPLAIN",
    ];

    // 检查语句是否以支持的类型开头
    for (const type of sqlTypes) {
      if (trimmedSql.startsWith(type)) {
        return type;
      }
    }

    return null;
  }

  public async runSql(
    sql: string,
    startLine: number,
    endLine: number
  ): Promise<void> {
    if (!this.editor) {
      vscode.window.showErrorMessage("SQL 编辑器未初始化");
      return;
    }

    const currentConnection = this.editor.getCurrentConnection();
    const currentDatabase = this.editor.getCurrentDatabase();

    if (!currentConnection) {
      vscode.window.showWarningMessage("请先选择数据库连接");
      // 打开数据库选择器
      await this.editor.selectDatabase();
      return;
    }

    if (!currentDatabase) {
      vscode.window.showWarningMessage("请先选择数据库");
      await this.editor.selectDatabase();
      return;
    }

    // 执行 SQL
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "正在执行 SQL...",
        cancellable: false,
      },
      async () => {
        try {
          // 获取数据库连接
          const dataloader = currentConnection.dataloder;
          if (!dataloader) {
            throw new Error("无法获取数据库连接");
          }

          await dataloader.connect();
          const connection = dataloader.getConnection();

          // 执行查询
          const result = await this.executeSql(
            connection,
            sql,
            currentDatabase.label?.toString() || ""
          );

          // 发送结果到 result webview
          this.sendResultToWebview(result, sql);
        } catch (error) {
          vscode.window.showErrorMessage(
            `SQL 执行失败: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    );
  }

  private executeSql(
    connection: any,
    sql: string,
    database: string
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      // 切换到指定数据库
      connection.changeUser({ database }, (err: any) => {
        if (err) {
          return reject(err);
        }

        // 执行 SQL
        connection.query(sql, (error: any, results: any, fields: any) => {
          if (error) {
            return reject(error);
          }

          resolve({
            results,
            fields,
            sql,
          });
        });
      });
    });
  }

  private sendResultToWebview(result: any, sql: string): void {
    // 通过事件发送结果
    vscode.commands.executeCommand("cadb.result.show", result, sql);
  }

  public async explainSql(
    sql: string,
    startLine: number,
    endLine: number
  ): Promise<void> {
    // EXPLAIN 就是在 SQL 前加 EXPLAIN
    const explainSql = `EXPLAIN ${sql}`;
    await this.runSql(explainSql, startLine, endLine);
  }
}
