import * as vscode from "vscode";
import type { CaEditor } from "./component/editor";
import type { Datasource } from "./entity/datasource";

/**
 * SQL 自动补全提供者
 * 提供数据库、表、字段、索引、视图等名称的智能补全
 */
export class CaCompletionItemProvider implements vscode.CompletionItemProvider {
  private editor?: CaEditor;
  private cachedCompletions: Map<string, CachedCompletion> = new Map();
  private cacheTimeout = 60000; // 缓存 1 分钟

  constructor() {}

  public setEditor(editor: CaEditor): void {
    this.editor = editor;
  }

  /**
   * 提供补全项
   */
  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): Promise<
    vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>
  > {
    if (!this.editor) {
      return [];
    }

    const currentConnection = this.editor.getCurrentConnection();
    const currentDatabase = this.editor.getCurrentDatabase();

    if (!currentConnection) {
      return [];
    }

    // 获取当前输入的文本
    const lineText = document.lineAt(position.line).text;
    const textBeforeCursor = lineText.substring(0, position.character);

    // 分析上下文，确定补全类型
    const completionType = this.getCompletionType(textBeforeCursor);

    const completions: vscode.CompletionItem[] = [];

    try {
      switch (completionType) {
        case "database":
          // 补全数据库名
          completions.push(
            ...(await this.getDatabaseCompletions(currentConnection))
          );
          break;

        case "table":
          // 补全表名
          if (currentDatabase) {
            completions.push(
              ...(await this.getTableCompletions(currentDatabase))
            );
          }
          break;

        case "column":
          // 补全字段名
          if (currentDatabase) {
            const tableName = this.extractTableName(textBeforeCursor);
            if (tableName) {
              completions.push(
                ...(await this.getColumnCompletions(currentDatabase, tableName))
              );
            } else {
              // 如果无法确定表名，显示所有表的字段
              completions.push(
                ...(await this.getAllColumnsCompletions(currentDatabase))
              );
            }
          }
          break;

        default:
          // 默认：显示 SQL 关键字、数据库和表名
          completions.push(...this.getSQLKeywords());
          if (currentDatabase) {
            completions.push(
              ...(await this.getTableCompletions(currentDatabase))
            );
          }
          break;
      }
    } catch (error) {
      console.error("补全提供失败:", error);
    }

    return completions;
  }

  /**
   * 解析补全项（可选）
   */
  resolveCompletionItem(
    item: vscode.CompletionItem,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.CompletionItem> {
    return item;
  }

  /**
   * 确定补全类型
   */
  private getCompletionType(
    text: string
  ): "database" | "table" | "column" | "default" {
    const upperText = text.toUpperCase().trim();

    // 检查是否在 USE 语句后（补全数据库）
    if (/USE\s+$/i.test(text)) {
      return "database";
    }

    // 检查是否在 FROM、JOIN、INTO、UPDATE 后（补全表名）
    if (/(FROM|JOIN|INTO|UPDATE)\s+[a-zA-Z0-9_]*$/i.test(text)) {
      return "table";
    }

    // 检查是否在表名后的点号后（补全字段）
    if (/[a-zA-Z0-9_]+\.[a-zA-Z0-9_]*$/i.test(text)) {
      return "column";
    }

    // 检查是否在 SELECT、WHERE、SET、ON 后（可能是字段）
    if (
      /(SELECT|WHERE|SET|ON|ORDER BY|GROUP BY)\s+[a-zA-Z0-9_,\s]*$/i.test(text)
    ) {
      return "column";
    }

    return "default";
  }

  /**
   * 提取表名
   */
  private extractTableName(text: string): string | null {
    // 尝试从 table.column 格式中提取表名
    const match = text.match(/([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]*)$/);
    if (match) {
      return match[1];
    }

    // 尝试从 FROM table 中提取
    const fromMatch = text.match(/FROM\s+([a-zA-Z0-9_]+)/i);
    if (fromMatch) {
      return fromMatch[1];
    }

    return null;
  }

  /**
   * 获取数据库名补全
   */
  private async getDatabaseCompletions(
    connection: Datasource
  ): Promise<vscode.CompletionItem[]> {
    const cacheKey = `databases:${connection.label}`;
    const cached = this.getCached(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // 获取连接下的对象（包含 datasourceType, userType, fileType）
      const objects = await connection.expand(this.editor!.provider.context);

      // 找到 datasourceType 节点
      const datasourceTypeNode = objects.find(
        (obj) => obj.type === "datasourceType"
      );
      if (!datasourceTypeNode) {
        return [];
      }

      // 展开获取所有数据库
      const databases = await datasourceTypeNode.expand(
        this.editor!.provider.context
      );
      const completions = databases.map((db) => {
        const item = new vscode.CompletionItem(
          db.label?.toString() || "",
          vscode.CompletionItemKind.Module
        );
        // 右侧显示类型标签
        const charset = db.description || '';
        item.detail = charset ? `[数据库] ${charset}` : '[数据库]';
        
        // 悬停文档
        const docs = [];
        docs.push(`**${db.label}**`);
        docs.push('');
        docs.push('📦 类型: 数据库');
        if (charset) {
          docs.push(`🔤 字符集: ${charset}`);
        }
        if (db.tooltip) {
          docs.push('');
          docs.push(db.tooltip.toString());
        }
        item.documentation = new vscode.MarkdownString(docs.join('\n'));
        
        return item;
      });

      this.setCached(cacheKey, completions);
      return completions;
    } catch (error) {
      return [];
    }
  }

  /**
   * 获取表名补全
   */
  private async getTableCompletions(
    database: Datasource
  ): Promise<vscode.CompletionItem[]> {
    const cacheKey = `tables:${database.label}`;
    const cached = this.getCached(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // 获取数据库节点下的对象（collectionType, userType 等）
      const objects = await database.expand(this.editor!.provider.context);
      const tableTypeNode = objects.find(
        (obj) => obj.type === "collectionType"
      );

      if (!tableTypeNode) {
        return [];
      }

      // 获取所有表
      const tables = await tableTypeNode.expand(this.editor!.provider.context);
      const completions = tables.map((table) => {
        const item = new vscode.CompletionItem(
          table.label?.toString() || "",
          vscode.CompletionItemKind.Class
        );
        // 右侧显示类型标签
        const tableInfo = table.description?.toString() || '';
        item.detail = tableInfo ? `[表] ${tableInfo}` : '[表]';
        
        // 悬停文档
        const docs = [];
        docs.push(`**${table.label}**`);
        docs.push('');
        docs.push('📋 类型: 数据表');
        docs.push(`🗄️ 数据库: ${database.label}`);
        if (tableInfo) {
          docs.push(`ℹ️ 信息: ${tableInfo}`);
        }
        item.documentation = new vscode.MarkdownString(docs.join('\n'));
        
        return item;
      });

      this.setCached(cacheKey, completions);
      return completions;
    } catch (error) {
      return [];
    }
  }

  /**
   * 获取指定表的字段补全
   */
  private async getColumnCompletions(
    database: Datasource,
    tableName: string
  ): Promise<vscode.CompletionItem[]> {
    const cacheKey = `columns:${database.label}:${tableName}`;
    const cached = this.getCached(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // 查找表节点
      const table = await this.findTable(database, tableName);
      if (!table) {
        return [];
      }

      // 获取表的对象（字段、索引等）
      const objects = await table.expand(this.editor!.provider.context);
      const fieldTypeNode = objects.find((obj) => obj.type === "fieldType");

      if (!fieldTypeNode) {
        return [];
      }

      // 获取所有字段
      const fields = await fieldTypeNode.expand(this.editor!.provider.context);
      const completions = fields.map((field) => {
        const item = new vscode.CompletionItem(
          field.label?.toString() || "",
          vscode.CompletionItemKind.Field
        );
        // 右侧显示类型标签
        const fieldType =
          typeof field.description === "string" ? field.description : "";
        item.detail = fieldType ? `[字段] ${fieldType}` : '[字段]';
        
        // 悬停文档
        const docs = [];
        docs.push(`**${field.label}**`);
        docs.push('');
        docs.push('🔹 类型: 字段');
        docs.push(`📋 所属表: ${tableName}`);
        docs.push(`🗄️ 数据库: ${database.label}`);
        if (fieldType) {
          docs.push(`📊 数据类型: ${fieldType}`);
        }
        item.documentation = new vscode.MarkdownString(docs.join('\n'));
        
        return item;
      });

      this.setCached(cacheKey, completions);
      return completions;
    } catch (error) {
      return [];
    }
  }

  /**
   * 获取所有表的字段补全
   */
  private async getAllColumnsCompletions(
    database: Datasource
  ): Promise<vscode.CompletionItem[]> {
    try {
      // 获取所有表
      const objects = await database.expand(this.editor!.provider.context);
      const tableTypeNode = objects.find(
        (obj) => obj.type === "collectionType"
      );

      if (!tableTypeNode) {
        return [];
      }

      const tables = await tableTypeNode.expand(this.editor!.provider.context);
      const allCompletions: vscode.CompletionItem[] = [];

      // 获取每个表的字段（限制数量避免太慢）
      const tablesToFetch = tables.slice(0, 10);
      for (const table of tablesToFetch) {
        const columns = await this.getColumnCompletions(
          database,
          table.label?.toString() || ""
        );
        allCompletions.push(...columns);
      }

      return allCompletions;
    } catch (error) {
      return [];
    }
  }

  /**
   * 查找表
   */
  private async findTable(
    database: Datasource,
    tableName: string
  ): Promise<Datasource | null> {
    try {
      const objects = await database.expand(this.editor!.provider.context);
      const tableTypeNode = objects.find(
        (obj) => obj.type === "collectionType"
      );

      if (!tableTypeNode) {
        return null;
      }

      const tables = await tableTypeNode.expand(this.editor!.provider.context);
      return (
        tables.find(
          (table) =>
            table.label?.toString().toLowerCase() === tableName.toLowerCase()
        ) || null
      );
    } catch (error) {
      return null;
    }
  }

  /**
   * 获取 SQL 关键字补全
   */
  private getSQLKeywords(): vscode.CompletionItem[] {
    const keywords = [
      // DML
      "SELECT",
      "INSERT",
      "UPDATE",
      "DELETE",
      "FROM",
      "WHERE",
      "JOIN",
      "LEFT JOIN",
      "RIGHT JOIN",
      "INNER JOIN",
      "ON",
      "AND",
      "OR",
      "NOT",
      "IN",
      "LIKE",
      "BETWEEN",
      "ORDER BY",
      "GROUP BY",
      "HAVING",
      "LIMIT",
      "OFFSET",
      "AS",
      "DISTINCT",
      "ALL",
      // DDL
      "CREATE",
      "ALTER",
      "DROP",
      "TRUNCATE",
      "TABLE",
      "DATABASE",
      "INDEX",
      "VIEW",
      // 数据类型
      "INT",
      "VARCHAR",
      "TEXT",
      "DATE",
      "DATETIME",
      "TIMESTAMP",
      "FLOAT",
      "DOUBLE",
      "DECIMAL",
      "BOOLEAN",
      // 约束
      "PRIMARY KEY",
      "FOREIGN KEY",
      "UNIQUE",
      "NOT NULL",
      "DEFAULT",
      "AUTO_INCREMENT",
      "CHECK",
      // 其他
      "USE",
      "SHOW",
      "DESCRIBE",
      "EXPLAIN",
      "COUNT",
      "SUM",
      "AVG",
      "MAX",
      "MIN",
      "UNION",
      "EXISTS",
      "CASE",
      "WHEN",
      "THEN",
      "ELSE",
      "END",
    ];

    return keywords.map((keyword) => {
      const item = new vscode.CompletionItem(
        keyword,
        vscode.CompletionItemKind.Keyword
      );
      // 右侧显示类型标签
      item.detail = "[关键字]";
      
      // 悬停文档
      const category = this.getKeywordCategory(keyword);
      const docs = [];
      docs.push(`**${keyword}**`);
      docs.push('');
      docs.push(`⌨️ 类型: SQL 关键字 (${category})`);
      item.documentation = new vscode.MarkdownString(docs.join('\n'));
      
      return item;
    });
  }

  /**
   * 获取关键字分类
   */
  private getKeywordCategory(keyword: string): string {
    const dml = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'FROM', 'WHERE', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'ON', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT', 'OFFSET', 'AS', 'DISTINCT', 'ALL'];
    const ddl = ['CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'TABLE', 'DATABASE', 'INDEX', 'VIEW'];
    const dataTypes = ['INT', 'VARCHAR', 'TEXT', 'DATE', 'DATETIME', 'TIMESTAMP', 'FLOAT', 'DOUBLE', 'DECIMAL', 'BOOLEAN'];
    const constraints = ['PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE', 'NOT NULL', 'DEFAULT', 'AUTO_INCREMENT', 'CHECK'];
    const functions = ['COUNT', 'SUM', 'AVG', 'MAX', 'MIN'];
    
    if (dml.includes(keyword)) {
      return 'DML';
    }
    if (ddl.includes(keyword)) {
      return 'DDL';
    }
    if (dataTypes.includes(keyword)) {
      return '数据类型';
    }
    if (constraints.includes(keyword)) {
      return '约束';
    }
    if (functions.includes(keyword)) {
      return '函数';
    }
    return '其他';
  }

  /**
   * 获取缓存
   */
  private getCached(key: string): vscode.CompletionItem[] | null {
    const cached = this.cachedCompletions.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.items;
    }
    return null;
  }

  /**
   * 设置缓存
   */
  private setCached(key: string, items: vscode.CompletionItem[]): void {
    this.cachedCompletions.set(key, {
      items,
      timestamp: Date.now(),
    });
	}

  /**
   * 清除缓存
   */
  public clearCache(): void {
    this.cachedCompletions.clear();
  }
}

interface CachedCompletion {
  items: vscode.CompletionItem[];
  timestamp: number;
}
