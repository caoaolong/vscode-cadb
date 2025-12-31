import { createClient } from "redis";
import { Uri } from "vscode";
import {
  Dataloader,
  FormResult,
  PromiseResult,
  TableResult,
} from "./dataloader";
import { Datasource, DatasourceInputData } from "./datasource";

export class RedisDataloader implements Dataloader {
	client: any;
	ds: Datasource;
	constructor(input: DatasourceInputData) {
		this.ds = new Datasource(input, this, undefined);
		this.client = createClient({
      socket: {
        host: input.host,
        port: input.port,
      },
			password: input.password,
    });
	}
  test(): Promise<PromiseResult> {
    throw new Error("Method not implemented.");
  }
  connect(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  getConnection() {
    throw new Error("Method not implemented.");
  }
  listFiles(ds: Datasource, path: Uri): Promise<Datasource[]> {
    throw new Error("Method not implemented.");
  }
  listUsers(ds: Datasource): Promise<Datasource[]> {
    throw new Error("Method not implemented.");
  }
  listAllUsers(ds: Datasource): Promise<Datasource[]> {
    throw new Error("Method not implemented.");
  }
  listDatabases(ds: Datasource): Promise<Datasource[]> {
    throw new Error("Method not implemented.");
  }
  listObjects(ds: Datasource, type: string): Promise<Datasource[]> {
    throw new Error("Method not implemented.");
  }
  listIndexes(ds: Datasource): Promise<Datasource[]> {
    throw new Error("Method not implemented.");
  }
  listColumns(ds: Datasource): Promise<Datasource[]> {
    throw new Error("Method not implemented.");
  }
  listTables(ds: Datasource): Promise<Datasource[]> {
    throw new Error("Method not implemented.");
  }
  listData(
    ds: Datasource,
    page?: number,
    pageSize?: number
  ): Promise<TableResult> {
    throw new Error("Method not implemented.");
  }
  descDatasource(ds: Datasource): Promise<FormResult | undefined> {
    throw new Error("Method not implemented.");
  }
  descUser(ds: Datasource): Promise<FormResult | undefined> {
    throw new Error("Method not implemented.");
  }
  descDatabase(ds: Datasource): Promise<FormResult | undefined> {
    throw new Error("Method not implemented.");
  }
  descTable(ds: Datasource): Promise<FormResult | undefined> {
    throw new Error("Method not implemented.");
  }
  descColumn(ds: Datasource): Promise<FormResult | undefined> {
    throw new Error("Method not implemented.");
  }
  descIndex(ds: Datasource): Promise<FormResult | undefined> {
    throw new Error("Method not implemented.");
  }
  descStructure(): string[] {
    throw new Error("Method not implemented.");
  }
}
