import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { createRequire } from "module";
import type { Database } from "sqlite3";
import {
  ColDef,
  Dataloader,
  FormResult,
  ListDataOptions,
  PromiseResult,
  SaveDataParams,
  SaveResult,
  TableResult,
} from "./dataloader";
import { Datasource, DatasourceInputData } from "./datasource";

function resolveExtensionRoot(): string {
  try {
    const ext = vscode.extensions.getExtension("codingsoul.vscode-cadb");
    if (ext?.extensionPath) {
      return ext.extensionPath;
    }
  } catch {
    /* 忽略：极少数环境下 extensions API 不可用 */
  }
  // 开发与常规 CommonJS 加载：extension.js 位于 dist/，上一级为扩展根目录。
  return path.join(__dirname, "..");
}

function getSqlite3() {
  // createRequire 锚定扩展根目录的 package.json；extensionPath 可避免 Extension Host 中非真实 __dirname（如 dummy.js）导致找不到 node_modules。
  const _req = createRequire(path.join(resolveExtensionRoot(), "package.json"));
  return _req("sqlite3") as typeof import("sqlite3");
}

export class SQLiteDataloader implements Dataloader {
  private ds: Datasource;
  private data: DatasourceInputData;
  private db?: Database;

  constructor(ds: Datasource, input: DatasourceInputData) {
    this.ds = ds;
    this.data = input;
  }

  rootNode(): Datasource {
    return this.ds;
  }

  dbType(): string {
    return this.ds.data.dbType || "sqlite";
  }

  private getDbPath(): string {
    return this.data.sqlitePath || this.data.database || "";
  }

  private ensureDb(): Database {
    if (!this.db) {
      const dbPath = this.getDbPath();
      if (!dbPath) {
        throw new Error("SQLite 数据库路径未配置");
      }
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const sqlite3 = getSqlite3();
      this.db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);
    }
    return this.db;
  }

  private async run<T = any>(sql: string, params?: any[]): Promise<T[]> {
    const db = this.ensureDb();
    return new Promise<T[]>((resolve, reject) => {
      db.all(sql, params || [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows as T[]);
        }
      });
    });
  }

  private async runExec(sql: string): Promise<void> {
    const db = this.ensureDb();
    return new Promise<void>((resolve, reject) => {
      db.exec(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  private async runGet<T = any>(sql: string, params?: any[]): Promise<T | undefined> {
    const db = this.ensureDb();
    return new Promise<T | undefined>((resolve, reject) => {
      db.get(sql, params || [], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row as T);
        }
      });
    });
  }

  test(): Promise<PromiseResult> {
    return new Promise<PromiseResult>((resolve) => {
      const dbPath = this.getDbPath();
      if (!dbPath) {
        resolve({ success: false, message: "数据库路径未配置" });
        return;
      }
      const timeout = setTimeout(() => {
        resolve({ success: false, message: "连接超时（3秒）" });
      }, 3000);

      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const sqlite3 = getSqlite3();
      const testDb = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
        clearTimeout(timeout);
        if (err) {
          resolve({ success: false, message: err.message });
        } else {
          testDb.close(() => {
            resolve({ success: true, message: "" });
          });
        }
      });
    });
  }

  connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      try {
        this.ensureDb();
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  disconnect(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            console.error("关闭 SQLite 连接失败:", err.message);
          }
          this.db = undefined;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getConnection(): Database {
    return this.ensureDb();
  }

  listCollations(_: Datasource): Promise<Datasource[]> {
    return Promise.resolve([]);
  }

  createDatabase(_params: any): Promise<void> {
    return Promise.reject(new Error("SQLite 不支持创建数据库（一个文件即一个数据库）"));
  }

  listFiles(ds: Datasource, dsPath: vscode.Uri): Promise<Datasource[]> {
    return Promise.resolve(ds.children || []);
  }

  listUsers(_: Datasource): Promise<Datasource[]> {
    return Promise.resolve([]);
  }

  listAllUsers(_: Datasource): Promise<Datasource[]> {
    return Promise.resolve([]);
  }

  listDatabases(ds: Datasource): Promise<Datasource[]> {
    // SQLite 没有多数据库概念，返回一个虚拟的 "main" 数据库节点
    const dbNode = new Datasource(
      {
        type: "collection",
        name: "main",
        tooltip: "主数据库",
        extra: "",
      },
      this,
      ds
    );
    ds.children = [dbNode];
    return Promise.resolve(ds.children);
  }

  async listTables(ds: Datasource): Promise<Datasource[]> {
    try {
      const rows = await this.run<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
      );
      ds.children = rows.map(
        (row) =>
          new Datasource(
            {
              type: "document",
              name: row.name,
              tooltip: row.name,
              extra: "",
            },
            this,
            ds
          )
      );
      return ds.children;
    } catch (err) {
      vscode.window.showErrorMessage(`查询表失败：${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  async listColumns(ds: Datasource): Promise<Datasource[]> {
    const tableName = ds.parent?.label?.toString();
    if (!tableName) {
      return [];
    }
    try {
      const rows = await this.run<{ name: string; type: string; notnull: number; dflt_value: any; pk: number }>(
        `PRAGMA table_info(${this.escapeId(tableName)})`
      );
      ds.children = rows.map(
        (row) =>
          new Datasource(
            {
              type: "field",
              name: row.name,
              tooltip: row.dflt_value != null ? `默认值: ${row.dflt_value}` : "",
              extra: row.type,
              nullable: row.notnull === 0,
            },
            this,
            ds
          )
      );
      return ds.children;
    } catch (err) {
      vscode.window.showErrorMessage(`查询字段失败：${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  async listIndexes(ds: Datasource): Promise<Datasource[]> {
    const tableName = ds.parent?.label?.toString();
    if (!tableName) {
      return [];
    }
    try {
      const rows = await this.run<{ name: string; unique: number; origin: string }>(
        `PRAGMA index_list(${this.escapeId(tableName)})`
      );
      ds.children = rows.map(
        (row) =>
          new Datasource(
            {
              type: "index",
              name: row.name,
              tooltip: row.origin,
              extra: row.unique === 1 ? "UNIQUE" : "",
            },
            this,
            ds
          )
      );
      return ds.children;
    } catch (err) {
      vscode.window.showErrorMessage(`查询索引失败：${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  listObjects(ds: Datasource, type: string): Promise<Datasource[]> {
    return new Promise<Datasource[]>((resolve) => {
      if (type === "document") {
        ds.children = [
          new Datasource({ type: "fieldType", name: "字段", tooltip: "" }, this, ds),
          new Datasource({ type: "indexType", name: "索引", tooltip: "" }, this, ds),
        ];
      } else if (type === "collection") {
        ds.children = [
          new Datasource({ type: "collectionType", name: "表", tooltip: "" }, this, ds),
        ];
      } else if (type === "datasource") {
        ds.children = [
          new Datasource({ type: "datasourceType", name: "数据库", tooltip: "" }, this, ds),
          new Datasource({ type: "fileType", name: "查询", tooltip: "" }, this, ds),
        ];
      }
      resolve(ds.children);
    });
  }

  listFolders(_: Datasource): Promise<Datasource[]> {
    return Promise.resolve([]);
  }

  async listData(ds: Datasource, options?: ListDataOptions): Promise<TableResult> {
    const startTime = Date.now();
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 2000;
    const tableName = ds.label?.toString();

    if (!tableName) {
      return { title: "", columnDefs: [], rowData: [], queryTime: 0 };
    }

    try {
      // 获取表结构
      const columns = await this.run<{ name: string; type: string; notnull: number; dflt_value: any; pk: number }>(
        `PRAGMA table_info(${this.escapeId(tableName)})`
      );

      const columnDefs: ColDef[] = columns.map((c) => ({
        field: c.name,
        type: c.type,
        canNull: c.notnull === 0 ? "YES" : "NO",
        defaultValue: c.dflt_value,
        autoIncrement: c.pk === 1 && c.type.toUpperCase() === "INTEGER",
      }));

      // 构建查询
      const whereParts: string[] = [];
      if (options?.filterModel) {
        for (const [key, model] of Object.entries(options.filterModel)) {
          if (!model) continue;
          const col = columnDefs.find((c) => c.field === key);
          if (!col) continue;
          const filter = model as any;
          const field = this.escapeId(key);
          switch (filter.filterType) {
            case "text":
              if (filter.type === "contains" && filter.filter) {
                whereParts.push(`${field} LIKE '%${this.escapeString(filter.filter)}%'`);
              } else if (filter.type === "equals" && filter.filter != null) {
                whereParts.push(`${field} = '${this.escapeString(filter.filter)}'`);
              } else if (filter.type === "startsWith" && filter.filter) {
                whereParts.push(`${field} LIKE '${this.escapeString(filter.filter)}%'`);
              } else if (filter.type === "endsWith" && filter.filter) {
                whereParts.push(`${field} LIKE '%${this.escapeString(filter.filter)}'`);
              }
              break;
            case "number":
              if (filter.type === "equals" && filter.filter != null) {
                whereParts.push(`${field} = ${filter.filter}`);
              } else if (filter.type === "greaterThan" && filter.filter != null) {
                whereParts.push(`${field} > ${filter.filter}`);
              } else if (filter.type === "lessThan" && filter.filter != null) {
                whereParts.push(`${field} < ${filter.filter}`);
              }
              break;
          }
        }
      }

      const whereClause = whereParts.length > 0 ? ` WHERE ${whereParts.join(" AND ")}` : "";

      const orderParts: string[] = [];
      if (options?.sortModel) {
        for (const sort of options.sortModel) {
          orderParts.push(`${this.escapeId(sort.colId)} ${sort.sort.toUpperCase()}`);
        }
      }
      const orderClause = orderParts.length > 0 ? ` ORDER BY ${orderParts.join(", ")}` : "";

      const sql = `SELECT * FROM ${this.escapeId(tableName)}${whereClause}${orderClause} LIMIT ${limit} OFFSET ${offset}`;
      options?.sqlLogger?.(sql);

      const rowData = await this.run<Record<string, any>>(sql);

      const queryTime = (Date.now() - startTime) / 1000;
      return {
        title: tableName,
        columnDefs,
        rowData,
        queryTime,
      };
    } catch (err) {
      vscode.window.showErrorMessage(`查询数据失败：${err instanceof Error ? err.message : String(err)}`);
      return { title: tableName, columnDefs: [], rowData: [], queryTime: 0 };
    }
  }

  async saveData(params: SaveDataParams): Promise<SaveResult> {
    const { tableName, primaryKeyField, rows, deletedRows } = params;
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];
    const executedSql: string[] = [];

    const escapeVal = (v: any): string => {
      if (v === null || v === undefined) return "NULL";
      if (typeof v === "boolean") return v ? "1" : "0";
      if (typeof v === "number") return String(v);
      return `'${String(v).replace(/'/g, "''")}'`;
    };

    const run = async (sql: string) => {
      executedSql.push(sql);
      await this.runExec(sql);
    };

    try {
      if (deletedRows?.length) {
        for (const { id } of deletedRows) {
          try {
            await run(`DELETE FROM ${this.escapeId(tableName)} WHERE ${this.escapeId(primaryKeyField)} = ${escapeVal(id)}`);
            successCount++;
          } catch (e) {
            errorCount++;
            errors.push(e instanceof Error ? e.message : String(e));
          }
        }
      }

      for (const row of rows) {
        try {
          const isNew = !!row.isNew;
          const full = row.full || row.original || {};
          const updated = row.updated || {};

          if (isNew) {
            const allKeys = Object.keys(full).filter((k) => !String(k).startsWith("__"));
            const insertKeys = allKeys.filter(
              (k) => k !== primaryKeyField || (full[k] != null && String(full[k]).trim() !== "")
            );
            if (insertKeys.length === 0) {
              errors.push("新行无有效字段");
              errorCount++;
              continue;
            }
            const cols = insertKeys.map((k) => this.escapeId(k)).join(", ");
            const vals = insertKeys.map((k) => escapeVal(full[k])).join(", ");
            await run(`INSERT INTO ${this.escapeId(tableName)} (${cols}) VALUES (${vals})`);
            successCount++;
            continue;
          }

          const id = row.id;
          if (id === undefined || id === null || id === "") {
            errors.push("行缺少主键值");
            errorCount++;
            continue;
          }

          if (!updated || Object.keys(updated).length === 0) {
            continue;
          }

          const setClause = Object.keys(updated)
            .map((key) => `${this.escapeId(key)} = ${escapeVal(updated[key])}`)
            .join(", ");
          await run(
            `UPDATE ${this.escapeId(tableName)} SET ${setClause} WHERE ${this.escapeId(primaryKeyField)} = ${escapeVal(id)}`
          );
          successCount++;
        } catch (e) {
          errorCount++;
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }
    } catch (e) {
      errorCount++;
      errors.push(e instanceof Error ? e.message : String(e));
    }

    return { successCount, errorCount, errors, executedSql };
  }

  descDatasource(ds: Datasource): Promise<FormResult | undefined> {
    return Promise.resolve({
      rowData: [ds.data],
    });
  }

  descUser(_: Datasource): Promise<FormResult | undefined> {
    return Promise.resolve(undefined);
  }

  descDatabase(ds: Datasource): Promise<FormResult | undefined> {
    return Promise.resolve({
      rowData: [{ name: ds.label?.toString() || "main" }],
    });
  }

  async descTable(ds: Datasource): Promise<FormResult | undefined> {
    const tableName = ds.label?.toString() || "";
    if (!tableName) {
      return undefined;
    }
    try {
      const columns = await this.run<Record<string, any>>(
        `PRAGMA table_info(${this.escapeId(tableName)})`
      );
      const indexes = await this.run<Record<string, any>>(
        `PRAGMA index_list(${this.escapeId(tableName)})`
      );
      return {
        rowData: columns,
        indexes: indexes.map((idx: any) => ({
          id: `index-${idx.name}`,
          name: idx.name,
          type: idx.origin === "pk" ? "primary" : (idx.unique === 1 ? "unique" : "index"),
          fields: [], // PRAGMA index_info 需要单独查，简化处理
          unique: idx.unique === 1,
        })),
      } as FormResult & { indexes?: any[] };
    } catch (err) {
      vscode.window.showErrorMessage(`获取表结构失败：${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  }

  descColumn(_: Datasource): Promise<FormResult | undefined> {
    return Promise.resolve(undefined);
  }

  descIndex(_: Datasource): Promise<FormResult | undefined> {
    return Promise.resolve(undefined);
  }

  descStructure(): string[] {
    return ["cid", "name", "type", "notnull", "dflt_value", "pk"];
  }

  async alterColumn(params: {
    databaseName: string;
    tableName: string;
    operation: "add" | "modify" | "drop";
    originalName?: string;
    field?: {
      name: string;
      type: string;
      length?: number | null;
      defaultValue?: string | null;
      nullable?: boolean;
      autoIncrement?: boolean;
      primaryKey?: boolean;
      comment?: string;
    };
  }): Promise<string> {
    const { tableName, operation, originalName, field } = params;
    const table = this.escapeId(tableName);

    if (operation === "drop" && originalName) {
      const sql = `ALTER TABLE ${table} DROP COLUMN ${this.escapeId(originalName)}`;
      await this.runExec(sql);
      return sql;
    }

    if (operation === "add" && field) {
      const colDef = this.buildColumnDefinition(field);
      const sql = `ALTER TABLE ${table} ADD COLUMN ${this.escapeId(field.name)} ${colDef}`;
      await this.runExec(sql);
      return sql;
    }

    // SQLite 不支持直接修改列（3.35.0+ 支持 ALTER TABLE DROP COLUMN，但 MODIFY 需要重建表）
    throw new Error(`SQLite 不支持 ${operation} 列操作（除 ADD/DROP 外）`);
  }

  async alterIndex(params: {
    databaseName: string;
    tableName: string;
    operation: "add" | "modify" | "drop";
    originalName?: string;
    index?: {
      name: string;
      type: string;
      fields: string[];
      unique?: boolean;
      comment?: string;
    };
  }): Promise<string> {
    const { tableName, operation, originalName, index } = params;

    if (operation === "drop" && originalName) {
      const sql = `DROP INDEX IF EXISTS ${this.escapeId(originalName)}`;
      await this.runExec(sql);
      return sql;
    }

    if ((operation === "add" || operation === "modify") && index) {
      const cols = index.fields.map((c) => this.escapeId(c)).join(", ");
      const unique = index.type === "unique" || index.unique ? "UNIQUE " : "";
      const sql = `CREATE ${unique}INDEX ${this.escapeId(index.name)} ON ${this.escapeId(tableName)} (${cols})`;
      await this.runExec(sql);
      return sql;
    }

    throw new Error(`不支持的索引操作: ${operation}`);
  }

  /**
   * 新建表（支持自定义字段与索引）
   */
  async createTable(
    tableName: string,
    fields?: Array<{
      name: string;
      type: string;
      length?: number | null;
      defaultValue?: string | null;
      nullable?: boolean;
      key?: string;
      extra?: string;
      autoIncrement?: boolean;
      primaryKey?: boolean;
      comment?: string;
    }>,
    indexes?: Array<{
      name: string;
      type: string;
      fields: string[];
      unique?: boolean;
    }>,
  ): Promise<void> {
    if (fields && fields.length > 0) {
      const colDefs = fields.map((f) => {
        const escapedName = this.escapeId(f.name);
        const colDef = this.buildColumnDefinition(f);
        return `${escapedName} ${colDef}`;
      });

      let pkCols: string[] = [];
      fields.forEach((f) => {
        const isAutoInc = f.autoIncrement === true || String(f.autoIncrement) === "true";
        const isPK = f.primaryKey === true || f.key === "PRI";
        if (isAutoInc || isPK) {
          pkCols.push(this.escapeId(f.name));
        }
      });

      const hasAutoInc = fields.some(
        (f) => f.autoIncrement === true || String(f.autoIncrement) === "true"
      );
      if (pkCols.length > 0 && !hasAutoInc) {
        colDefs.push(`PRIMARY KEY (${pkCols.join(", ")})`);
      }

      const createSql = `CREATE TABLE ${this.escapeId(tableName)} (\n  ${colDefs.join(",\n  ")}\n)`;
      await this.runExec(createSql);

      if (indexes && indexes.length > 0) {
        for (const idx of indexes) {
          if (idx.type === "primary") continue;
          const cols = idx.fields.map((c) => this.escapeId(c)).join(", ");
          const unique = idx.type === "unique" || idx.unique ? "UNIQUE " : "";
          const idxSql = `CREATE ${unique}INDEX ${this.escapeId(idx.name)} ON ${this.escapeId(tableName)} (${cols})`;
          await this.runExec(idxSql);
        }
      }
    } else {
      await this.runExec(
        `CREATE TABLE IF NOT EXISTS ${this.escapeId(tableName)} (id INTEGER PRIMARY KEY AUTOINCREMENT)`
      );
    }
  }

  async renameTable(_databaseName: string, oldName: string, newName: string): Promise<void> {
    const sql = `ALTER TABLE ${this.escapeId(oldName)} RENAME TO ${this.escapeId(newName)}`;
    await this.runExec(sql);
  }

  /**
   * 执行任意 SQL（供 SqlExecutor 使用）
   */
  async executeSql(sql: string): Promise<{ results: any[]; fields: any[] }> {
    const trimmed = sql.trim().toUpperCase();
    const isSelect = trimmed.startsWith("SELECT") || trimmed.startsWith("PRAGMA") || trimmed.startsWith("WITH");

    if (isSelect) {
      const rows = await this.run<Record<string, any>>(sql);
      const fields = rows.length > 0
        ? Object.keys(rows[0]).map((name) => ({ name }))
        : [];
      return { results: rows, fields };
    } else {
      const db = this.ensureDb();
      return new Promise<{ results: any[]; fields: any[] }>((resolve, reject) => {
        db.run(sql, function (err) {
          if (err) {
            reject(err);
            return;
          }
          const result = {
            affectedRows: this.changes,
            insertId: this.lastID,
          };
          resolve({ results: [result], fields: [] });
        });
      });
    }
  }

  private escapeId(id: string): string {
    return `"${id.replace(/"/g, '""')}"`;
  }

  private escapeString(s: string): string {
    return s.replace(/'/g, "''");
  }

  private buildColumnDefinition(field: {
    type: string;
    length?: number | null;
    defaultValue?: string | null;
    nullable?: boolean;
    autoIncrement?: boolean;
    primaryKey?: boolean;
    comment?: string;
  }): string {
    const isAutoInc = field.autoIncrement === true || String(field.autoIncrement) === "true";
    if (isAutoInc) {
      let s = "INTEGER PRIMARY KEY AUTOINCREMENT";
      if (field.defaultValue !== undefined && field.defaultValue !== null && field.defaultValue !== "") {
        const v = String(field.defaultValue).trim();
        if (v.toLowerCase() === "null") {
          s += " DEFAULT NULL";
        } else if (v.toUpperCase() === "CURRENT_TIMESTAMP" || v.toUpperCase() === "CURRENT_DATE") {
          s += ` DEFAULT ${v.toUpperCase()}`;
        } else {
          s += ` DEFAULT '${this.escapeString(v)}'`;
        }
      }
      return s;
    }
    const parts: string[] = [];
    const upperType = field.type.toUpperCase();
    const needsLength = ["VARCHAR", "CHAR", "NVARCHAR", "DECIMAL", "NUMERIC"].includes(upperType);
    if (field.length != null && field.length > 0 && needsLength) {
      parts.push(`${upperType}(${field.length})`);
    } else {
      parts.push(upperType);
    }
    const nullable = field.nullable !== false;
    if (!nullable) {
      parts.push("NOT NULL");
    }
    if (field.defaultValue !== undefined && field.defaultValue !== null && field.defaultValue !== "") {
      const v = String(field.defaultValue).trim();
      if (v.toLowerCase() === "null") {
        parts.push("DEFAULT NULL");
      } else if (v.toUpperCase() === "CURRENT_TIMESTAMP" || v.toUpperCase() === "CURRENT_DATE") {
        parts.push(`DEFAULT ${v.toUpperCase()}`);
      } else {
        parts.push(`DEFAULT '${this.escapeString(v)}'`);
      }
    }
    return parts.join(" ");
  }
}
