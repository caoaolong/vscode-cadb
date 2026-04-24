import { Uri, window, ProgressLocation } from "vscode";
import {
  Dataloader,
  FormResult,
  ListDataOptions,
  PromiseResult,
  SaveDataParams,
  SaveResult,
  TableResult,
} from "./dataloader";
import {
  GetObjectCommand,
  HeadBucketCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { Datasource, DatasourceInputData } from "./datasource";

/** 将字节数格式化为 KB、MB、GB 等易读字符串 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const unit = units[Math.min(i, units.length - 1)];
  const value = bytes / Math.pow(1024, Math.min(i, units.length - 1));
  return value % 1 === 0 ? `${value} ${unit}` : `${value.toFixed(2)} ${unit}`;
}

/**
 * 单次目录展开最多列出多少条；超过时附加占位「更多对象未显示…」节点。
 * 防止有的目录里有几十万对象时一次性塞给 TreeView 卡死渲染线程。
 */
const OSS_MAX_ENTRIES_PER_LEVEL = 5000;
/** S3/OSS ListObjectsV2 单页上限 */
const OSS_PAGE_SIZE = 1000;

export class OssDataLoader implements Dataloader {
  private ds: Datasource;
  private data: DatasourceInputData;
  private client: S3Client;

  constructor(ds: Datasource, input: DatasourceInputData) {
    this.ds = ds;
    this.data = input;

    this.client = new S3Client({
      region: input.region,
      endpoint: input.endpoint,
      credentials: {
        accessKeyId: input.accessKeyId || "",
        secretAccessKey: input.accessSecretKey || "",
      },
      forcePathStyle: false,
    });
  }

  rootNode(): Datasource {
    return this.ds;
  }
  dbType(): string {
    return this.ds.data.dbType || "oss";
  }
  async test(): Promise<PromiseResult> {
    try {
      await this.client.send(
        new HeadBucketCommand({ Bucket: this.data.bucket })
      );
      return { success: true, message: "Connection successful" };
    } catch (error: any) {
      let message = error.message || "Connection failed";
      return { success: false, message };
    }
  }
  connect(): Promise<void> {
    throw new Error("connect Method not implemented.");
  }

  async disconnect(): Promise<void> {
    try {
      this.client.destroy();
    } catch {
      /* 忽略 */
    }
  }
  getConnection() {
    throw new Error("getConnection Method not implemented.");
  }
  listCollations(ds: Datasource): Promise<Datasource[]> {
    throw new Error("listCollations Method not implemented.");
  }
  createDatabase(params: any): Promise<void> {
    throw new Error("createDatabase Method not implemented.");
  }
  listFiles(ds: Datasource, path: Uri): Promise<Datasource[]> {
    throw new Error("listFiles Method not implemented.");
  }
  listUsers(ds: Datasource): Promise<Datasource[]> {
    throw new Error("listUsers Method not implemented.");
  }
  listAllUsers(ds: Datasource): Promise<Datasource[]> {
    throw new Error("listAllUsers Method not implemented.");
  }
  listDatabases(ds: Datasource): Promise<Datasource[]> {
    throw new Error("listDatabases Method not implemented.");
  }
  async listObjects(ds: Datasource, type: string): Promise<Datasource[]> {
    try {
      const buckets = await this.client.send(new ListBucketsCommand({ 
        BucketRegion: this.data.region,
       }));
       ds.children = buckets.Buckets?.map((bucket) => new Datasource({
        name: bucket.Name || "",
        type: "collectionType",
        tooltip: "",
        extra: "bucket",
      }, this, ds)) || [];
    } catch (error: any) {
      return [];
    }
    return Promise.resolve(ds.children);
  }
  listIndexes(ds: Datasource): Promise<Datasource[]> {
    throw new Error("listIndexes Method not implemented.");
  }
  listColumns(ds: Datasource): Promise<Datasource[]> {
    throw new Error("listColumns Method not implemented.");
  }
  /**
   * 列出 bucket 顶层（懒加载）：只取一层，子目录展开时再调用 listFolders 继续向下。
   * 之前实现是「一次性把 bucket 下所有对象拉回来构造完整树」，bucket 文件多时会卡死。
   */
  async listTables(ds: Datasource): Promise<Datasource[]> {
    const bucketName = this.resolveBucketName(ds);
    if (!bucketName) {
      ds.children = [];
      return [];
    }
    ds.children = await this.loadLevelWithProgress(ds, bucketName, "");
    return ds.children;
  }

  /** 文件夹节点（type=folder）展开时调用：从父链拼出完整 prefix，按 Delimiter 拉一层 */
  async listFolders(ds: Datasource): Promise<Datasource[]> {
    const bucketName = this.resolveBucketName(ds);
    if (!bucketName) {
      ds.children = [];
      return [];
    }
    const prefix = this.buildPrefixFromAncestors(ds);
    ds.children = await this.loadLevelWithProgress(ds, bucketName, prefix);
    return ds.children;
  }

  /** 沿父节点向上找到 bucket（collectionType）节点的名字 */
  private resolveBucketName(ds: Datasource): string {
    const fromData =
      (ds.data as { bucket?: string })?.bucket || this.data.bucket || "";
    if (fromData && (ds.type === "collectionType" || ds.type !== "folder")) {
      // 当前节点本身就是 bucket，data.bucket / label 都可能拿到
      if (ds.type === "collectionType") {
        return ds.label?.toString() || fromData;
      }
    }
    let cur: Datasource | undefined = ds;
    while (cur) {
      if (cur.type === "collectionType") {
        return cur.label?.toString() || (cur.data as { bucket?: string })?.bucket || "";
      }
      cur = cur.parent;
    }
    return fromData;
  }

  /**
   * 从 folder 节点沿父链拼出 OSS Prefix，例如 a/b/c/。
   * bucket 节点本身视为根，prefix 为空串。
   */
  private buildPrefixFromAncestors(ds: Datasource): string {
    if (ds.type === "collectionType") {
      return "";
    }
    const segs: string[] = [];
    let cur: Datasource | undefined = ds;
    while (cur && cur.type !== "collectionType") {
      const name = cur.label?.toString() || cur.data?.name || "";
      if (name) segs.unshift(name);
      cur = cur.parent;
    }
    return segs.length ? segs.join("/") + "/" : "";
  }

  /** 用进度提示包裹一层加载，避免长时间 IO 期间用户没有反馈 */
  private async loadLevelWithProgress(
    parentDs: Datasource,
    bucket: string,
    prefix: string,
  ): Promise<Datasource[]> {
    const title = prefix
      ? `加载 OSS 目录 ${bucket}/${prefix}`
      : `加载 OSS Bucket ${bucket}`;
    return window.withProgress(
      {
        location: ProgressLocation.Window,
        title,
        cancellable: false,
      },
      async () => this.loadLevel(parentDs, bucket, prefix),
    );
  }

  /**
   * 拉取「一层」目录内容：使用 Delimiter:"/"，返回 CommonPrefixes（子目录）+ Contents（文件）。
   * 单层最多累计 OSS_MAX_ENTRIES_PER_LEVEL，超出时插入只读「更多对象未显示」节点。
   */
  private async loadLevel(
    parentDs: Datasource,
    bucket: string,
    prefix: string,
  ): Promise<Datasource[]> {
    const folders = new Map<string, string>();
    const files: { name: string; size: number; lastModified?: Date }[] = [];
    let continuationToken: string | undefined;
    let total = 0;
    let truncated = false;
    try {
      do {
        const result = await this.client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix || undefined,
            Delimiter: "/",
            ContinuationToken: continuationToken,
            MaxKeys: OSS_PAGE_SIZE,
          }),
        );

        if (result.CommonPrefixes?.length) {
          for (const cp of result.CommonPrefixes) {
            const full = cp.Prefix ?? "";
            if (!full || full === prefix) continue;
            const rel = full.slice(prefix.length).replace(/\/+$/, "");
            if (!rel || folders.has(rel)) continue;
            folders.set(rel, full);
            total += 1;
            if (total >= OSS_MAX_ENTRIES_PER_LEVEL) break;
          }
        }

        if (total < OSS_MAX_ENTRIES_PER_LEVEL && result.Contents?.length) {
          for (const obj of result.Contents) {
            const key = obj.Key ?? "";
            if (!key || key === prefix) continue;
            // 跳过「目录占位对象」(以 / 结尾且大小为 0)
            if (key.endsWith("/") && (obj.Size ?? 0) === 0) continue;
            const rel = key.slice(prefix.length);
            if (!rel || rel.includes("/")) continue;
            files.push({
              name: rel,
              size: obj.Size ?? 0,
              lastModified: obj.LastModified,
            });
            total += 1;
            if (total >= OSS_MAX_ENTRIES_PER_LEVEL) break;
          }
        }

        if (total >= OSS_MAX_ENTRIES_PER_LEVEL) {
          truncated = result.IsTruncated === true || total >= OSS_MAX_ENTRIES_PER_LEVEL;
          break;
        }
        continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
      } while (continuationToken);
    } catch (error: any) {
      window.showErrorMessage(
        `加载 OSS 目录失败：${error?.message || String(error)}`,
      );
      return [];
    }

    const children: Datasource[] = [];
    for (const [name] of folders) {
      children.push(
        new Datasource(
          { name, type: "folder", tooltip: "", extra: "" },
          this,
          parentDs,
        ),
      );
    }
    files.sort((a, b) => a.name.localeCompare(b.name));
    for (const f of files) {
      children.push(
        new Datasource(
          {
            name: f.name,
            type: "item",
            tooltip: f.lastModified
              ? `${formatFileSize(f.size)} · ${f.lastModified.toISOString()}`
              : formatFileSize(f.size),
            extra: formatFileSize(f.size),
          },
          this,
          parentDs,
        ),
      );
    }
    if (truncated) {
      children.push(
        new Datasource(
          {
            name: `（已截断，仅显示前 ${OSS_MAX_ENTRIES_PER_LEVEL} 项；请使用「下载」/搜索处理更多对象）`,
            type: "item",
            tooltip: "当前目录条目过多，已截断显示，避免阻塞 UI",
            extra: "",
          },
          this,
          parentDs,
        ),
      );
    }
    return children;
  }

  /** 获取对象内容（用于预览与下载） */
  async getObject(bucket: string, key: string): Promise<Uint8Array> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    );
    const body = result.Body;
    if (!body) return new Uint8Array(0);
    return await body.transformToByteArray();
  }

  /** 按前缀列出所有对象（用于文件夹下载） */
  async listObjectsWithPrefix(
    bucket: string,
    prefix: string
  ): Promise<{ Key: string; Size?: number }[]> {
    const out: { Key: string; Size?: number }[] = [];
    let continuationToken: string | undefined;
    do {
      const result = await this.client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
          MaxKeys: 1000,
        })
      );
      if (result.Contents?.length) {
        for (const c of result.Contents) {
          if (c.Key) out.push({ Key: c.Key, Size: c.Size });
        }
      }
      continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
    } while (continuationToken);
    return out;
  }

  listData(ds: Datasource, _options?: ListDataOptions): Promise<TableResult> {
    throw new Error("listData Method not implemented.");
  }
  descDatasource(ds: Datasource): Promise<FormResult | undefined> {
    return Promise.resolve({
      rowData: [ds.data],
    });
  }
  descUser(ds: Datasource): Promise<FormResult | undefined> {
    throw new Error("descUser Method not implemented.");
  }
  descDatabase(ds: Datasource): Promise<FormResult | undefined> {
    throw new Error("descDatabase Method not implemented.");
  }
  descTable(ds: Datasource): Promise<FormResult | undefined> {
    throw new Error("descTable Method not implemented.");
  }
  descColumn(ds: Datasource): Promise<FormResult | undefined> {
    throw new Error("descColumn Method not implemented.");
  }
  descIndex(ds: Datasource): Promise<FormResult | undefined> {
    throw new Error("descIndex Method not implemented.");
  }
  descStructure(): string[] {
    throw new Error("descStructure Method not implemented.");
  }
  saveData(params: SaveDataParams): Promise<SaveResult> {
    throw new Error("saveData Method not implemented.");
  }
}
