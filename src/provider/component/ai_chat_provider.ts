import * as fs from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";
import { randomUUID } from "crypto";
import { DataSourceProvider } from "../database_provider";
import { DatabaseManager } from "./database_manager";
import { createWebview } from "../webview_helper";
import { driverSupportsSqlExecution } from "../drivers/registry";
import {
  Datasource,
  type DatasourceInputData,
} from "../entity/datasource";
import { runAgent, type AgentRunConfig, type AgentStreamCallbacks } from "./ai_agent";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** 主编排计划中的一项（来自 publish_execution_plan / agent-trace plan 事件） */
interface StoredChatPlanStep {
  agent: string;
  step?: number | string;
  input?: unknown;
}

/** 主编排委派出去的 subagent 输出片段，用于会话回放时复原时间线+折叠面板 */
interface StoredChatAgentSection {
  subagentType: string;
  description: string;
  delegationId: number;
  content: string;
}

interface StoredChatMessage {
  role: "user" | "assistant";
  content: string;
  html?: string;
  /** 主编排意图（assistant 可选） */
  intent?: string;
  /** 主编排计划步骤（assistant 可选） */
  plan?: StoredChatPlanStep[];
  /** 各 subagent 输出（按发生顺序，assistant 可选） */
  agents?: StoredChatAgentSection[];
}

interface StoredSession {
  id: string;
  title: string;
  dbId?: string;
  history: StoredChatMessage[];
}

interface TagItem {
  id: string;
  name: string;
}

/** 旧版：会话曾保存在 globalState，首次启动时迁移到文件 */
const AI_SESSIONS_KEY_LEGACY = "cadb.aiChat.sessions.v1";
const AI_CURRENT_SESSION_KEY_LEGACY = "cadb.aiChat.currentSessionId.v1";
const AI_SESSIONS_MAX = 80;
/** 聊天记录 JSON 文件名（位于 extensionContext.globalStorageUri） */
const AI_CHAT_SESSIONS_FILE = "ai-chat-sessions.json";

interface PersistedAiChatFileV1 {
  version: 1;
  currentSessionId: string;
  sessions: StoredSession[];
}

export class AiChatProvider {
  private panel?: vscode.WebviewPanel;
  private provider?: DataSourceProvider;
  private context?: vscode.ExtensionContext;
  private databaseManager?: DatabaseManager;
  private treeChangeDisposable?: vscode.Disposable;
  private treeRefreshTimer?: ReturnType<typeof setTimeout>;

  public open(
    provider: DataSourceProvider,
    context: vscode.ExtensionContext,
    databaseManager: DatabaseManager,
  ): void {
    this.provider = provider;
    this.context = context;
    this.databaseManager = databaseManager;

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      void this._sendInit();
      return;
    }

    this.panel = createWebview(provider, "aiChat", "AI 数据库助手");

    this.treeChangeDisposable?.dispose();
    if (provider.onDidChangeTreeData) {
      this.treeChangeDisposable = provider.onDidChangeTreeData(() => {
        this._scheduleTreeRefresh();
      });
    }

    this.panel.onDidDispose(() => {
      if (this.treeRefreshTimer !== undefined) {
        clearTimeout(this.treeRefreshTimer);
        this.treeRefreshTimer = undefined;
      }
      this.treeChangeDisposable?.dispose();
      this.treeChangeDisposable = undefined;
      this.panel = undefined;
    });

    this.panel.webview.onDidReceiveMessage((msg) =>
      this._handleMessage(msg),
    );
  }

  private async _handleMessage(msg: {
    command: string;
    [key: string]: unknown;
  }): Promise<void> {
    switch (msg.command) {
      case "ready":
        await this._sendInit();
        break;

      case "send":
        await this._handleSend(
          msg.text as string,
          msg.dbId as string,
          msg.history as ChatMessage[],
        );
        break;

      case "saveConfig":
        await this._saveConfig(msg as {
          command: string;
          apiKey: string;
          baseUrl: string;
          model: string;
        });
        break;

      case "persistSessions":
        await this._persistSessions(
          msg as {
            command: string;
            sessions: StoredSession[];
            currentSessionId: string;
          },
        );
        break;

      case "requestTables":
        await this._handleRequestTables(msg.dbId as string);
        break;
    }
  }

  // ─── init / refresh ────────────────────────────────────────

  private async _sendInit(): Promise<void> {
    const config = vscode.workspace.getConfiguration("cadb.ai");
    const { sessions, currentId } = await this._readSessions();
    const dbOptions = await this._resolveDatabaseOptions();
    this.panel?.webview.postMessage({
      type: "init",
      config: {
        apiKey: config.get<string>("apiKey", ""),
        baseUrl: config.get<string>("baseUrl", "https://api.openai.com/v1"),
        model: config.get<string>("model", "gpt-4o"),
      },
      dbOptions,
      sessions,
      currentSessionId: currentId,
    });
  }

  private async _sendRefresh(): Promise<void> {
    if (!this.panel) return;
    const dbOptions = await this._resolveDatabaseOptions();
    this.panel.webview.postMessage({
      type: "refresh",
      dbOptions,
    });
  }

  private _scheduleTreeRefresh(): void {
    if (!this.panel) return;
    if (this.treeRefreshTimer !== undefined) {
      clearTimeout(this.treeRefreshTimer);
    }
    this.treeRefreshTimer = setTimeout(() => {
      this.treeRefreshTimer = undefined;
      void this._sendRefresh();
    }, 350);
  }

  // ─── 数据库选项（同步遍历已加载树节点） ────────────────────

  private _collectDatabaseOptions(): TagItem[] {
    if (!this.provider) return [];
    const options: TagItem[] = [];
    for (const group of this.provider.getRootNodes()) {
      if (group.type !== "group") continue;
      for (const conn of group.children || []) {
        if (conn.type !== "datasource" || !conn.connectionOpen) continue;
        if (!driverSupportsSqlExecution(conn.data.dbType)) continue;
        const connName = conn.label?.toString() || "";
        if (!connName) continue;
        for (const child of conn.children || []) {
          if (child.type !== "datasourceType") continue;
          for (const db of child.children || []) {
            if (db.type !== "collection") continue;
            const dbName = db.label?.toString() || "";
            if (dbName) {
              options.push({
                id: connName + "/" + dbName,
                name: connName + " / " + dbName,
              });
            }
          }
        }
      }
    }
    return options;
  }

  /**
   * 树尚未展开或刷新未完成时，getRootNodes 下无库节点，同步收集会得到空列表。
   * 此处按配置直连拉取库列表（与 _expandTablesForDatabase 一致），并尊重「已关闭连接」与「过滤显示的数据库」。
   */
  private async _collectDatabaseOptionsFromConnections(): Promise<TagItem[]> {
    if (!this.provider || !this.context) return [];
    const treeState = this.provider.getTreeState();
    const closed = new Set(treeState.closedConnectionNames ?? []);
    const options: TagItem[] = [];

    for (const raw of this.provider.getConnections()) {
      if (!driverSupportsSqlExecution(raw.dbType)) continue;
      const connName = (raw.name || "").trim();
      if (!connName || closed.has(connName)) continue;

      try {
        const connNode = new Datasource(
          { ...raw, type: "datasource" } as DatasourceInputData,
        );
        if (!connNode.dataloader) continue;

        const top = await connNode.expand(this.context);
        const dbTypeNode = top.find((o) => o.type === "datasourceType");
        if (!dbTypeNode) continue;

        const databases = await dbTypeNode.expand(this.context);
        const selected = treeState.selectedDatabases?.[connName];
        const allow =
          Array.isArray(selected) && selected.length > 0
            ? new Set(selected)
            : null;

        for (const db of databases) {
          if (db.type !== "collection") continue;
          const dbName = db.label?.toString() || "";
          if (!dbName) continue;
          if (allow && !allow.has(dbName)) continue;
          options.push({
            id: connName + "/" + dbName,
            name: connName + " / " + dbName,
          });
        }
      } catch {
        // 单个连接失败时跳过
      }
    }

    return options;
  }

  private async _resolveDatabaseOptions(): Promise<TagItem[]> {
    const fromTree = this._collectDatabaseOptions();
    if (fromTree.length > 0) {
      return fromTree;
    }
    return this._collectDatabaseOptionsFromConnections();
  }

  // ─── requestTables: 返回指定库的表名列表 ──────────────────

  private async _handleRequestTables(dbId: string): Promise<void> {
    if (!this.provider || !this.context) return;
    const idx = dbId.indexOf("/");
    if (idx < 1) return;
    const connName = dbId.slice(0, idx);
    const dbName = dbId.slice(idx + 1);

    let tags = this._getTablesFromTree(connName, dbName);
    if (tags.length === 0) {
      tags = await this._expandTablesForDatabase(connName, dbName);
    }
    this.panel?.webview.postMessage({
      type: "updateTableTags",
      tableTags: tags,
    });
  }

  private _getTablesFromTree(connName: string, dbName: string): TagItem[] {
    if (!this.provider) return [];
    const tags: TagItem[] = [];
    for (const group of this.provider.getRootNodes()) {
      if (group.type !== "group") continue;
      for (const conn of group.children || []) {
        if (conn.type !== "datasource") continue;
        if ((conn.label?.toString() || "") !== connName) continue;
        for (const child of conn.children || []) {
          if (child.type !== "datasourceType") continue;
          for (const db of child.children || []) {
            if (db.type !== "collection") continue;
            if ((db.label?.toString() || "") !== dbName) continue;
            for (const dbChild of db.children || []) {
              if (dbChild.type !== "collectionType") continue;
              for (const table of dbChild.children || []) {
                if (table.type !== "document") continue;
                const name = table.label?.toString() || "";
                if (name) tags.push({ id: name, name });
              }
            }
            return tags;
          }
        }
      }
    }
    return tags;
  }

  private async _expandTablesForDatabase(
    connName: string,
    dbName: string,
  ): Promise<TagItem[]> {
    if (!this.provider || !this.context) return [];
    const raw = this.provider
      .getConnections()
      .find((c) => (c.name || "").trim() === connName);
    if (!raw || !driverSupportsSqlExecution(raw.dbType)) return [];

    try {
      const connNode = new Datasource(
        { ...raw, type: "datasource" } as DatasourceInputData,
      );
      if (!connNode.dataloader) return [];
      const top = await connNode.expand(this.context);
      const dbTypeNode = top.find((o) => o.type === "datasourceType");
      if (!dbTypeNode) return [];
      const databases = await dbTypeNode.expand(this.context);
      const dbNode = databases.find(
        (d) => d.type === "collection" && d.label?.toString() === dbName,
      );
      if (!dbNode) return [];
      const dbChildren = await dbNode.expand(this.context);
      const tableTypeNode = dbChildren.find((o) => o.type === "collectionType");
      if (!tableTypeNode) return [];
      const tables = await tableTypeNode.expand(this.context);
      return tables
        .filter((t) => t.type === "document" && t.label?.toString())
        .map((t) => ({ id: t.label!.toString(), name: t.label!.toString() }));
    } catch {
      return [];
    }
  }

  // ─── Agent 流式发送 ────────────────────────────────────────

  private async _handleSend(
    _text: string,
    dbId: string,
    history: ChatMessage[],
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration("cadb.ai");
    const apiKey = config.get<string>("apiKey", "");
    const baseUrl = config.get<string>("baseUrl", "https://api.openai.com/v1");
    const model = config.get<string>("model", "gpt-4o");

    if (!apiKey) {
      this.panel?.webview.postMessage({
        type: "stream-error",
        error: "请先在右上角设置中配置 API Key",
      });
      return;
    }

    const idx = dbId.indexOf("/");
    if (idx < 1) {
      this.panel?.webview.postMessage({
        type: "stream-error",
        error: "会话未绑定数据库，请新建会话并选择数据库",
      });
      return;
    }
    const connName = dbId.slice(0, idx);
    const dbName = dbId.slice(idx + 1);

    const connData = this.provider
      ?.getConnections()
      .find((ds) => ds.name === connName);
    if (!connData) {
      this.panel?.webview.postMessage({
        type: "stream-error",
        error: `找不到数据源: ${connName}`,
      });
      return;
    }

    let tableNames: string[] = [];
    try {
      const tags = this._getTablesFromTree(connName, dbName);
      if (tags.length > 0) {
        tableNames = tags.map((t) => t.name);
      } else {
        const expanded = await this._expandTablesForDatabase(connName, dbName);
        tableNames = expanded.map((t) => t.name);
      }
    } catch {
      // 忽略
    }

    const agentConfig: AgentRunConfig = {
      apiKey,
      baseUrl,
      model,
      connData: connData as DatasourceInputData,
      connName,
      databaseName: dbName,
      tableNames,
      extensionPath: this.context!.extensionPath,
    };

    this.panel?.webview.postMessage({ type: "stream-start" });

    const callbacks: AgentStreamCallbacks = {
      onToken: (token, meta) => {
        this.panel?.webview.postMessage({
          type: "stream-chunk",
          text: token,
          stream: meta?.stream ?? "main",
          subagentType:
            meta?.stream === "subagent" ? meta.subagentType : undefined,
          delegationId:
            meta?.stream === "subagent" ? meta.delegationId : undefined,
        });
      },
      onToolStart: (toolName, input) => {
        this.panel?.webview.postMessage({ type: "tool-start", toolName, input });
      },
      onToolEnd: (toolName, output) => {
        this.panel?.webview.postMessage({ type: "tool-end", toolName, output });
      },
      onExecutionPlan: (payload) => {
        this.panel?.webview.postMessage({
          type: "agent-trace",
          kind: "plan",
          intent: payload.intent,
          plan: payload.plan,
        });
      },
      onSubagentTask: (payload) => {
        this.panel?.webview.postMessage({
          type: "agent-trace",
          kind: "subagent",
          subagentType: payload.subagentType,
          description: payload.description,
          delegationId: payload.delegationId,
        });
      },
      onError: (err) => {
        this.panel?.webview.postMessage({ type: "stream-error", error: err });
      },
      onEnd: () => {
        this.panel?.webview.postMessage({ type: "stream-end" });
      },
    };

    await runAgent(agentConfig, history, callbacks);
  }

  // ─── 会话持久化（文件：globalStorage/ai-chat-sessions.json）────────

  private _sessionsFilePath(ctx: vscode.ExtensionContext): string {
    return path.join(ctx.globalStorageUri.fsPath, AI_CHAT_SESSIONS_FILE);
  }

  /** 从原始数组解析会话列表（文件或旧版 globalState 共用） */
  private _parseSessionsFromRaw(raw: unknown): StoredSession[] {
    const sessions: StoredSession[] = [];
    if (!Array.isArray(raw)) {
      return sessions;
    }
    for (const item of raw) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const o = item as Record<string, unknown>;
      const id = typeof o.id === "string" ? o.id : "";
      const title = typeof o.title === "string" ? o.title : "会话";
      const dbId = typeof o.dbId === "string" ? o.dbId : "";
      const histRaw = o.history;
      const history: StoredChatMessage[] = [];
      if (Array.isArray(histRaw)) {
        for (const m of histRaw) {
          if (!m || typeof m !== "object") {
            continue;
          }
          const msg = m as Record<string, unknown>;
          const role =
            msg.role === "user" || msg.role === "assistant" ? msg.role : null;
          const content = typeof msg.content === "string" ? msg.content : "";
          const html = typeof msg.html === "string" ? msg.html : undefined;
          if (!role) {
            continue;
          }

          const stored: StoredChatMessage = { role, content };
          if (html) {
            stored.html = html;
          }
          if (role === "assistant") {
            const intent =
              typeof msg.intent === "string" ? msg.intent : undefined;
            if (intent) {
              stored.intent = intent;
            }
            const planRaw = msg.plan;
            if (Array.isArray(planRaw)) {
              const plan: StoredChatPlanStep[] = [];
              for (const p of planRaw) {
                if (!p || typeof p !== "object") {
                  continue;
                }
                const po = p as Record<string, unknown>;
                const agent = typeof po.agent === "string" ? po.agent : "";
                if (!agent) {
                  continue;
                }
                const step =
                  typeof po.step === "string" || typeof po.step === "number"
                    ? po.step
                    : undefined;
                plan.push({ agent, step, input: po.input });
              }
              if (plan.length) {
                stored.plan = plan;
              }
            }
            const agentsRaw = msg.agents;
            if (Array.isArray(agentsRaw)) {
              const agents: StoredChatAgentSection[] = [];
              for (const a of agentsRaw) {
                if (!a || typeof a !== "object") {
                  continue;
                }
                const ao = a as Record<string, unknown>;
                const subagentType =
                  typeof ao.subagentType === "string" ? ao.subagentType : "";
                const description =
                  typeof ao.description === "string" ? ao.description : "";
                const delegationIdRaw = ao.delegationId;
                const delegationId =
                  typeof delegationIdRaw === "number"
                    ? delegationIdRaw
                    : Number(delegationIdRaw);
                const aContent =
                  typeof ao.content === "string" ? ao.content : "";
                if (!subagentType && !aContent) {
                  continue;
                }
                agents.push({
                  subagentType,
                  description,
                  delegationId: Number.isFinite(delegationId)
                    ? delegationId
                    : 0,
                  content: aContent,
                });
              }
              if (agents.length) {
                stored.agents = agents;
              }
            }
          }
          history.push(stored);
        }
      }
      if (id) {
        sessions.push({ id, title, dbId, history });
      }
    }
    return sessions;
  }

  private async _writeSessionsFile(
    ctx: vscode.ExtensionContext,
    sessions: StoredSession[],
    currentId: string,
  ): Promise<void> {
    await fs.mkdir(ctx.globalStorageUri.fsPath, { recursive: true });
    const payload: PersistedAiChatFileV1 = {
      version: 1,
      currentSessionId: currentId,
      sessions,
    };
    await fs.writeFile(
      this._sessionsFilePath(ctx),
      JSON.stringify(payload, null, 2),
      "utf8",
    );
  }

  private async _readSessions(): Promise<{
    sessions: StoredSession[];
    currentId: string;
  }> {
    const ctx = this.context!;
    const filePath = this._sessionsFilePath(ctx);

    try {
      const text = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(text) as Partial<PersistedAiChatFileV1>;
      let sessions = this._parseSessionsFromRaw(parsed.sessions);
      let currentId =
        typeof parsed.currentSessionId === "string"
          ? parsed.currentSessionId
          : "";

      if (sessions.length === 0) {
        throw new Error("sessions empty in file");
      }
      if (!currentId || !sessions.some((s) => s.id === currentId)) {
        currentId = sessions[0].id;
      }
      return { sessions, currentId };
    } catch {
      // 无文件或损坏：尝试从旧版 globalState 迁移
      const rawLegacy = ctx.globalState.get<unknown>(AI_SESSIONS_KEY_LEGACY);
      let sessions = this._parseSessionsFromRaw(rawLegacy);
      let currentId =
        ctx.globalState.get<string>(AI_CURRENT_SESSION_KEY_LEGACY) || "";

      if (sessions.length === 0) {
        const id = randomUUID();
        sessions = [{ id, title: "新会话", dbId: "", history: [] }];
        currentId = id;
      } else if (!currentId || !sessions.some((s) => s.id === currentId)) {
        currentId = sessions[0].id;
      }

      await this._writeSessionsFile(ctx, sessions, currentId);
      await ctx.globalState.update(AI_SESSIONS_KEY_LEGACY, undefined);
      await ctx.globalState.update(AI_CURRENT_SESSION_KEY_LEGACY, undefined);
      return { sessions, currentId };
    }
  }

  private async _persistSessions(msg: {
    sessions: StoredSession[];
    currentSessionId: string;
  }): Promise<void> {
    const ctx = this.context;
    if (!ctx) {
      return;
    }
    const list = Array.isArray(msg.sessions) ? msg.sessions : [];
    if (list.length === 0) {
      return;
    }
    const trimmed = list.slice(0, AI_SESSIONS_MAX).map((s) => ({
      id: String(s.id || "").trim() || randomUUID(),
      title: String(s.title || "会话").slice(0, 200),
      dbId: String(s.dbId || ""),
      history: (Array.isArray(s.history) ? s.history : [])
        .filter(
          (m): m is StoredChatMessage =>
            !!m &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string",
        )
        .map((m) => {
          const out: StoredChatMessage = {
            role: m.role,
            content: m.content.slice(0, 200_000),
          };
          if (m.html) {
            out.html = m.html.slice(0, 200_000);
          }
          if (m.role === "assistant") {
            if (typeof m.intent === "string" && m.intent) {
              out.intent = m.intent.slice(0, 4000);
            }
            if (Array.isArray(m.plan) && m.plan.length) {
              out.plan = m.plan
                .filter(
                  (p): p is StoredChatPlanStep =>
                    !!p && typeof p.agent === "string" && p.agent.length > 0,
                )
                .map((p) => ({
                  agent: p.agent,
                  step: p.step,
                  input: p.input,
                }));
            }
            if (Array.isArray(m.agents) && m.agents.length) {
              out.agents = m.agents
                .filter(
                  (a): a is StoredChatAgentSection =>
                    !!a &&
                    typeof a.subagentType === "string" &&
                    typeof a.content === "string",
                )
                .map((a) => ({
                  subagentType: a.subagentType,
                  description:
                    typeof a.description === "string"
                      ? a.description.slice(0, 2000)
                      : "",
                  delegationId:
                    typeof a.delegationId === "number" &&
                    Number.isFinite(a.delegationId)
                      ? a.delegationId
                      : 0,
                  content: a.content.slice(0, 200_000),
                }));
            }
          }
          return out;
        }),
    }));
    let currentId = String(msg.currentSessionId || "").trim();
    if (!trimmed.some((s) => s.id === currentId)) {
      currentId = trimmed[0].id;
    }
    await this._writeSessionsFile(ctx, trimmed, currentId);
  }

  private async _saveConfig(msg: {
    apiKey: string;
    baseUrl: string;
    model: string;
    command: string;
  }): Promise<void> {
    const config = vscode.workspace.getConfiguration("cadb.ai");
    const target = vscode.ConfigurationTarget.Global;
    if (msg.apiKey !== undefined) await config.update("apiKey", msg.apiKey, target);
    if (msg.baseUrl !== undefined) await config.update("baseUrl", msg.baseUrl, target);
    if (msg.model !== undefined) await config.update("model", msg.model, target);
    vscode.window.showInformationMessage("AI 配置已保存");
  }

  public dispose(): void {
    if (this.treeRefreshTimer !== undefined) {
      clearTimeout(this.treeRefreshTimer);
      this.treeRefreshTimer = undefined;
    }
    this.treeChangeDisposable?.dispose();
    this.treeChangeDisposable = undefined;
    this.panel?.dispose();
  }
}
