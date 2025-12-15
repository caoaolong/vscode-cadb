import * as vscode from "vscode";
import { Connection, createConnection } from "mysql2";
import path from "path";

const iconDir: string[] = ["..", "..", "resources", "icons"];

export interface DatasourceInputData {
  type:
    | "datasource"
    | "collection"
    | "document"
    | "field"
    | "index"
    | "fieldType"
    | "indexType";

  name: string;
  tooltip: string;
  extra?: string;

  dbType?: "mysql" | "redis";
  database?: string;
  username?: string;
  password?: string;
  host?: string;
  port?: number;
}

export interface PromiseResult {
  success: boolean;
  message?: string;
}

export class Datasource extends vscode.TreeItem {
  public children: Datasource[] = [];

  private conn?: Connection;
  private root?: Datasource;
  private parent?: Datasource;
  public type: string;

  public connect(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.conn?.authorized) {
        this.listDatabases().then(() => resolve());
      } else {
        this.conn?.connect((err) => {
          if (err) {
            vscode.window.showErrorMessage(`连接失败：${err.message}`);
          }
          this.listDatabases().then(() => resolve());
        });
      }
    });
  }

  public expand = (): Promise<Datasource[]> => {
    switch (this.type) {
      case "datasource":
        return this.listDatabases();
      case "collection":
        return this.listTables();
      case "document":
        return this.listObjects();
      case "fieldType":
        return this.listColumns();
      case "indexType":
        return this.listIndexes();
      default:
        return Promise.resolve([]);
    }
  };

  private listObjects(): Promise<Datasource[]> {
    return new Promise<Datasource[]>((resolve) => {
      resolve([
        new Datasource(
          {
            type: "fieldType",
            name: "字段",
            tooltip: "",
          },
          this.root,
          this
        ),
        new Datasource(
          {
            type: "indexType",
            name: "索引",
            tooltip: "",
          },
          this.root,
          this
        ),
      ]);
    });
  }

  private listIndexes(): Promise<Datasource[]> {
    return new Promise<Datasource[]>((resolve) => {
      if (
        !this.root ||
        !this.root.conn ||
        !this.parent ||
        !this.parent.parent
      ) {
        return resolve([]);
      }
      const conn = this.root.conn;
      conn.query(
        `
SELECT 
	INDEX_NAME AS iname,
	COLUMN_NAME AS cname,
	SEQ_IN_INDEX AS sii,
	NON_UNIQUE AS nu,
	INDEX_TYPE AS it
FROM 
    information_schema.STATISTICS 
WHERE 
    TABLE_SCHEMA = '${this.parent.parent.label}'
    AND TABLE_NAME = '${this.parent.label}'
ORDER BY 
    INDEX_NAME, SEQ_IN_INDEX;
`,
        (err, results) => {
          if (err) {
            vscode.window.showErrorMessage(`查询索引失败：${err.message}`);
            return resolve([]);
          }
          const indexes = new Map<string, string[]>();
          const rows = results as any[];
          for (const row of rows) {
            if (!indexes.has(row["iname"] as string)) {
              indexes.set(row["iname"] as string, [
                `${row["it"]}`,
                `${row["nu"]}`,
              ]);
            }
            indexes.get(row["iname"] as string)?.push(`${row["cname"]}`);
          }
          const result: Datasource[] = [];
          for (const [k, v] of indexes) {
            const indexNames = v.slice(2).join(", ");
            const tooltip = `${v[0]}(${indexNames})`;
            result.push(
              new Datasource({
                name: k,
                tooltip: tooltip,
                extra: parseInt(v[1]) === 0 ? `UNIQUE` : ``,
                type: "index",
              })
            );
          }
          return resolve(result);
        }
      );
    });
  }

  private listColumns(): Promise<Datasource[]> {
    return new Promise<Datasource[]>((resolve) => {
      if (
        !this.root ||
        !this.root.conn ||
        !this.parent ||
        !this.parent.parent
      ) {
        return resolve([]);
      }
      const conn = this.root.conn;
      conn.query(
        `
SELECT 
	COLUMN_NAME AS name,
	COLUMN_TYPE AS ctype,
	COLUMN_COMMENT AS cc
FROM 
    information_schema.COLUMNS 
WHERE 
    TABLE_SCHEMA = '${this.parent.parent.label}'
    AND TABLE_NAME = '${this.parent.label}'
ORDER BY 
    ORDINAL_POSITION;
`,
        (err, results) => {
          if (err) {
            vscode.window.showErrorMessage(`查询数据库失败：${err.message}`);
            return resolve([]);
          }
          return resolve(
            (results as any[]).map(
              (row) =>
                new Datasource(
                  {
                    name: row["name"] as string,
                    tooltip: row["cc"] as string,
                    extra: row["ctype"] as string,
                    type: "field",
                  },
                  this.root
                )
            )
          );
        }
      );
    });
  }

  private listTables(): Promise<Datasource[]> {
    return new Promise<Datasource[]>((resolve) => {
      if (!this.root || !this.root.conn) {
        return resolve([]);
      }
      const conn = this.root.conn;
      conn.query(
        `
SELECT TABLE_NAME as name, TABLE_COMMENT as tc
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = '${this.label}';
`,
        (err, results) => {
          if (err) {
            vscode.window.showErrorMessage(`查询数据库失败：${err.message}`);
            return resolve([]);
          }
          return resolve(
            (results as any[]).map(
              (row) =>
                new Datasource(
                  {
                    name: row["name"] as string,
                    tooltip: row["tc"] as string,
                    extra: "",
                    type: "document",
                  },
                  this.root,
                  this
                )
            )
          );
        }
      );
    });
  }

  private listDatabases(): Promise<Datasource[]> {
    return new Promise<Datasource[]>((resolve) => {
      this.conn?.query(
        `
SELECT 
	SCHEMA_NAME AS name,
	DEFAULT_CHARACTER_SET_NAME AS charset_name
FROM 
	information_schema.SCHEMATA
ORDER BY 
	SCHEMA_NAME;
				`,
        (err, results) => {
          if (err) {
            vscode.window.showErrorMessage(`获取数据库失败：${err.message}`);
            return resolve([]);
          }
          return resolve(
            (results as any[]).map(
              (row) =>
                new Datasource(
                  {
                    name: row["name"] as string,
                    tooltip: "",
                    extra: row["charset_name"] as string,
                    type: "collection",
                  },
                  this
                )
            )
          );
        }
      );
    });
  }

  public constructor(
    input: DatasourceInputData,
    root?: Datasource,
    parent?: Datasource
  ) {
    super(input.name);
    this.root = root;
    this.parent = parent;
    this.type = input.type;
    this.tooltip = input.tooltip;
    this.contextValue = "dsItem";
    // 设置节点的可折叠状态：如果是 datasource（可展开以列出数据库），则设置为 Collapsed
    if (input.type === "field" || input.type === "index") {
      this.collapsibleState = vscode.TreeItemCollapsibleState.None;
    } else {
      this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    }
    switch (input.type) {
      case "datasource":
        this.initDatasource(input);
        break;
      case "collection":
        this.initCollection(input);
        break;
      case "document":
        this.initDocument(input);
        break;
      case "field":
      case "fieldType":
        this.initFieldType(input);
        break;
      case "index":
      case "indexType":
        this.initIndexType(input);
        break;
    }
  }

  private initIndexType(input: DatasourceInputData): void {
    if (input.type === "index") {
      this.description = input.extra;
    }
    this.iconPath = {
      light: vscode.Uri.file(
        path.join(__filename, ...iconDir, "Index_light.svg")
      ),
      dark: vscode.Uri.file(
        path.join(__filename, ...iconDir, "Index_dark.svg")
      ),
    };
  }

  private initFieldType(input: DatasourceInputData): void {
    if (input.type === "field") {
      this.description = input.extra;
    }
    this.iconPath = {
      light: vscode.Uri.file(
        path.join(__filename, ...iconDir, "Column_light.svg")
      ),
      dark: vscode.Uri.file(
        path.join(__filename, ...iconDir, "Column_dark.svg")
      ),
    };
  }

  private initDocument(input: DatasourceInputData): void {
    this.description = `${input.extra}`;
    this.iconPath = {
      light: vscode.Uri.file(
        path.join(__filename, ...iconDir, "Table_light.svg")
      ),
      dark: vscode.Uri.file(
        path.join(__filename, ...iconDir, "Table_dark.svg")
      ),
    };
  }

  private initCollection(input: DatasourceInputData): void {
    this.description = `${input.extra}`;
    this.iconPath = {
      light: vscode.Uri.file(
        path.join(__filename, ...iconDir, "Database_light.svg")
      ),
      dark: vscode.Uri.file(
        path.join(__filename, ...iconDir, "Database_dark.svg")
      ),
    };
  }

  private initDatasource(input: DatasourceInputData): void {
    this.description = `${input.host}:${input.port}`;
    switch (input.dbType) {
      case "mysql":
        this.iconPath = {
          light: vscode.Uri.file(
            path.join(__filename, ...iconDir, "mysql", "MySQL_light.svg")
          ),
          dark: vscode.Uri.file(
            path.join(__filename, ...iconDir, "mysql", "MySQL_dark.svg")
          ),
        };
        this.conn = createConnection({
          host: input.host,
          port: input.port,
          user: input.username,
          password: input.password,
          database: input.database,
          connectTimeout: 5000,
        });
        break;
    }
  }

  public static createInstance(
    model: DatasourceInputData[],
    context: vscode.ExtensionContext,
    input: DatasourceInputData,
    save: boolean = false
  ): Promise<Datasource> {
    return new Promise<Datasource>((resolve) => {
      const instance = new Datasource(input);
      if (save) {
        model.push(input);
        context.globalState
          .update("cadb.connections", model)
          .then(() => resolve(instance));
      }
      return resolve(instance);
    });
  }

  public test(): Promise<PromiseResult> {
    return new Promise<PromiseResult>((resolve) => {
      this.conn?.connect((err) => {
        if (err) {
          resolve({
            success: false,
            message: err.message,
          });
        } else {
          resolve({
            success: true,
          });
        }
      });
    });
  }
}
