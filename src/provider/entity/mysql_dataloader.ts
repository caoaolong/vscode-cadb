import * as vscode from "vscode";
import { Connection, createConnection } from "mysql2";
import {
  ColDef,
  Dataloader,
  FormResult,
  PromiseResult,
  TableResult,
} from "./dataloader";
import { Datasource, DatasourceInputData } from "./datasource";

export class MySQLDataloader implements Dataloader {
  private conn: Connection;
  private ds: Datasource;

  constructor(ds: Datasource, input: DatasourceInputData) {
    this.ds = ds;
    this.conn = createConnection({
      host: input.host,
      port: input.port,
      user: input.username,
      password: input.password,
      database: input.database,
      connectTimeout: 5000,
    });
  }
  descStructure(): string[] {
    return ["Field", "Type", "Null", "Key", "Default", "Extra"];
  }
  descDatabase(ds: Datasource): Promise<FormResult | undefined> {
    return new Promise<FormResult | undefined>((resolve) => {
      this.conn.query(``, (err, results) => {
        if (err) {
          vscode.window.showErrorMessage(err.message);
          return resolve(undefined);
        }
      });
    });
  }
  descTable(ds: Datasource): Promise<FormResult | undefined> {
    if (!ds.dataloder || !ds.parent || !ds.parent.parent) {
      return Promise.resolve(undefined);
    }
    const table = ds.label || "";
    const database = ds.parent.parent.label || "";
    return new Promise<FormResult | undefined>((resolve) => {
      this.conn.query(`DESC ${database}.${table}`, (err, results) => {
        if (err) {
          vscode.window.showErrorMessage(err.message);
          return resolve(undefined);
        }
        return resolve({
          rowData: results as Record<string, any>[],
        });
      });
    });
  }
  descColumn(ds: Datasource): Promise<FormResult | undefined> {
    return new Promise<FormResult | undefined>((resolve) => {
      this.conn.query(``, (err, results) => {
        if (err) {
          vscode.window.showErrorMessage(err.message);
          return resolve(undefined);
        }
      });
    });
  }
  descIndex(ds: Datasource): Promise<FormResult | undefined> {
    return new Promise<FormResult | undefined>((resolve) => {
      this.conn.query(``, (err, results) => {
        if (err) {
          vscode.window.showErrorMessage(err.message);
          return resolve(undefined);
        }
      });
    });
  }

  test(): Promise<PromiseResult> {
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

  connect(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.conn.authorized) {
        this.conn.ping((err) => {
          if (err) {
            vscode.window.showErrorMessage(err.message);
          }
          resolve();
        });
      } else {
        this.conn.connect((err) => {
          if (err) {
            vscode.window.showErrorMessage(`连接失败：${err.message}`);
          }
          this.conn.ping((err) => {
            if (err) {
              vscode.window.showErrorMessage(err.message);
            }
            resolve();
          });
        });
      }
    });
  }
  listAllUsers(ds: Datasource): Promise<Datasource[]> {
    return new Promise<Datasource[]>((resolve) => {
      this.conn.query(
        `SELECT * FROM mysql.user;`,
        (err, results) => {
          if (err) {
            vscode.window.showErrorMessage(`查询数据库失败：${err.message}`);
            return resolve([]);
          }
          ds.children = (results as any[]).map(
            (row) =>
              new Datasource(
                {
                  name: `${row["User"]}@${row["Host"]}`,
                  tooltip: "",
                  extra: "",
                  type: "user",
                },
                this,
                this.ds
              )
          );
          return resolve(ds.children);
        }
      );
    });
  }
  listUsers(ds: Datasource): Promise<Datasource[]> {
		if (ds.parent && ds.parent.type === "datasource") {
			return this.listAllUsers(ds);
		}
    return new Promise<Datasource[]>((resolve) => {
      if (!this.ds.root || !this.ds.parent) {
        return resolve([]);
      }
      this.conn.query(
        `
SELECT DISTINCT USER as name, HOST as host
FROM mysql.DB
WHERE db = '${this.ds.parent.label}';
`,
        (err, results) => {
          if (err) {
            vscode.window.showErrorMessage(`查询数据库失败：${err.message}`);
            return resolve([]);
          }
          ds.children = (results as any[]).map(
            (row) =>
              new Datasource(
                {
                  name: `${row["name"]}@${row["host"]}`,
                  tooltip: "",
                  extra: "",
                  type: "user",
                },
                this,
                this.ds
              )
          );
          return resolve(ds.children);
        }
      );
    });
  }

  listObjects(ds: Datasource, type: string): Promise<Datasource[]> {
    return new Promise<Datasource[]>((resolve) => {
      if (type === "document") {
        ds.children = [
          new Datasource(
            {
              type: "fieldType",
              name: "字段",
              tooltip: "",
            },
            this,
            ds
          ),
          new Datasource(
            {
              type: "indexType",
              name: "索引",
              tooltip: "",
            },
            this,
            ds
          ),
        ];
      } else if (type === "collection") {
        ds.children = [
          new Datasource(
            {
              type: "collectionType",
              name: "表",
              tooltip: "",
            },
            this,
            ds
          ),
          new Datasource(
            {
              type: "userType",
              name: "用户",
              tooltip: "",
            },
            this,
            ds
          ),
        ];
      } else if (type === "datasource") {
        ds.children = [
          new Datasource(
            {
              type: "datasourceType",
              name: "数据库",
              tooltip: "",
            },
            this,
            ds
          ),
          new Datasource(
            {
              type: "userType",
              name: "用户",
              tooltip: "",
            },
            this,
            ds
          ),
        ];
      }
      resolve(ds.children);
    });
  }

  listIndexes(ds: Datasource): Promise<Datasource[]> {
    return new Promise<Datasource[]>((resolve) => {
      if (!ds.parent || !ds.parent.parent || !ds.parent.parent.parent) {
        return resolve([]);
      }
      this.conn.query(
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
    TABLE_SCHEMA = '${ds.parent.parent.parent.label}'
    AND TABLE_NAME = '${ds.parent.label}'
ORDER BY 
    NON_UNIQUE, INDEX_NAME, SEQ_IN_INDEX;
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
              new Datasource(
                {
                  name: k,
                  tooltip: tooltip,
                  extra: parseInt(v[1]) === 0 ? `UNIQUE` : ``,
                  type: "index",
                },
                this,
                ds
              )
            );
          }
          ds.children = result;
          return resolve(ds.children);
        }
      );
    });
  }

  listColumns(ds: Datasource): Promise<Datasource[]> {
    return new Promise<Datasource[]>((resolve) => {
      if (!ds.parent || !ds.parent.parent || !ds.parent.parent.parent) {
        return resolve([]);
      }
      this.conn.query(
        `
SELECT 
	COLUMN_NAME AS name,
	COLUMN_TYPE AS ctype,
	COLUMN_COMMENT AS cc
FROM 
    information_schema.COLUMNS 
WHERE 
    TABLE_SCHEMA = '${ds.parent.parent.parent.label}'
    AND TABLE_NAME = '${ds.parent.label}'
ORDER BY 
    ORDINAL_POSITION;
`,
        (err, results) => {
          if (err) {
            vscode.window.showErrorMessage(`查询数据库失败：${err.message}`);
            return resolve([]);
          }
          ds.children = (results as any[]).map(
            (row) =>
              new Datasource(
                {
                  name: row["name"] as string,
                  tooltip: row["cc"] as string,
                  extra: row["ctype"] as string,
                  type: "field",
                },
                this,
                ds
              )
          );
          return resolve(ds.children);
        }
      );
    });
  }

  listTables(ds: Datasource): Promise<Datasource[]> {
    return new Promise<Datasource[]>((resolve) => {
      if (!ds.parent) {
        return resolve([]);
      }
      this.conn.query(
        `
SELECT TABLE_NAME as name, TABLE_COMMENT as tc
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = '${ds.parent.label}';
`,
        (err, results) => {
          if (err) {
            vscode.window.showErrorMessage(`查询数据库失败：${err.message}`);
            return resolve([]);
          }
          ds.children = (results as any[]).map(
            (row) =>
              new Datasource(
                {
                  name: row["name"] as string,
                  tooltip: row["tc"] as string,
                  extra: "",
                  type: "document",
                },
                this,
                ds
              )
          );
          return resolve(ds.children);
        }
      );
    });
  }

  listDatabases(ds: Datasource): Promise<Datasource[]> {
    return new Promise<Datasource[]>((resolve) => {
      this.conn.query(
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
          ds.children = (results as any[]).map(
            (row) =>
              new Datasource(
                {
                  name: row["name"] as string,
                  tooltip: "",
                  extra: row["charset_name"] as string,
                  type: "collection",
                },
                this,
                this.ds
              )
          );
          return resolve(ds.children);
        }
      );
    });
  }

  async listData(
    ds: Datasource,
    page?: number,
    pageSize?: number
  ): Promise<TableResult> {
    page = page ? page : 1;
    pageSize = pageSize ? pageSize : 50;
    const descTable = await new Promise<ColDef[]>((resolve) => {
      const table = ds.label;
      const database = ds.parent?.parent?.label;
      if (!table || !database) {
        return resolve([]);
      }
      this.conn.query(`DESC ${database}.${table}`, (err, results) => {
        if (err) {
          vscode.window.showErrorMessage(err.message);
          return resolve([]);
        }
        resolve(
          (results as any[]).map((e) => {
            return {
              field: e["Field"],
              type: e["Type"],
              canNull: e["Null"],
              key: e["Key"],
              defaultValue: e["Default"],
            } as ColDef;
          })
        );
      });
    });
    const dataTable = await new Promise<Record<string, any>[]>((resolve) => {
      const table = ds.label;
      const database = ds.parent?.parent?.label;
      if (!table || !database) {
        return resolve([]);
      }
      this.conn.query(
        `
		SELECT * FROM ${database}.${table} LIMIT ${(page - 1) * pageSize}, ${pageSize}
		`,
        (err, results) => {
          if (err) {
            vscode.window.showErrorMessage(err.message);
            return resolve([]);
          }
          return resolve(
            (results as any[]).map((e) => e as Record<string, any>)
          );
        }
      );
    });
    return Promise.resolve({
      title: ds.label,
      columnDefs: descTable,
      rowData: dataTable,
    } as TableResult);
  }
}
