import * as vscode from "vscode";
import { Connection, createConnection } from "mysql2";
import path from "path";

const iconDir: string[] = ["..", "..", "resources", "icons"];

export interface DatasourceInputData {
  type: "mysql" | "redis";
  name: string;
  database: string;
  username: string;
  password: string;
  host: string;
  port: number;
}

export interface PromiseResult {
  success: boolean;
  message?: string;
}

export class Datasource extends vscode.TreeItem {
  private connection?: Connection;

  public constructor(input: DatasourceInputData) {
    super(input.name);
    switch (input.type) {
      case "mysql":
        this.iconPath = {
          light: vscode.Uri.file(
            path.join(
              __filename,
              ...iconDir,
              "mysql",
              "MySQL_light.svg"
            )
          ),
          dark: vscode.Uri.file(
            path.join(
              __filename,
              ...iconDir,
              "mysql",
              "MySQL_dark.svg"
            )
          ),
        };
        this.connection = createConnection({
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
      this.connection?.connect((err) => {
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
