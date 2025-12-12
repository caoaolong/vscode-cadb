import * as vscode from "vscode";
import { Connection, createConnection } from "mysql2";
import path from "path";

const iconDir: string[] = ["..", "..", "resources", "icons"];

export interface DatasourceInputData {
  type: "datasource" | "collection" | "document" | "field" | "index";

  name: string;
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
      default:
        return Promise.resolve([]);
    }
  };

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
                    extra: row["tc"] as string,
                    type: "document",
                  },
                  this.root
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

  public constructor(input: DatasourceInputData, root?: Datasource) {
    super(input.name);
    this.root = root;
    this.type = input.type;
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
    }
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
