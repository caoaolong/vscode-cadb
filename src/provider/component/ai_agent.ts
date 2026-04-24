import * as path from "path";
import { z } from "zod";
import { tool } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import {
  createDeepAgent,
  FilesystemBackend,
  type SubAgent,
} from "deepagents";
import type { DatasourceInputData } from "../entity/datasource";
import { withMysqlSession } from "../mysql/pool_registry";
import {
  DATA_ANALYSIS_AGENT_PROMPT,
  EXECUTION_AGENT_PROMPT,
  MAIN_AGENT_PROMPT,
  REPAIR_AGENT_PROMPT,
  SCHEMA_AGENT_PROMPT,
  SQL_AGENT_PROMPT,
  SQL_VALIDATOR_AGENT_PROMPT,
  VISUALIZATION_AGENT_PROMPT,
} from "./ai_prompts";

/** Agent 执行配置 */
export interface AgentRunConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  connData: DatasourceInputData;
  connName: string;
  databaseName: string;
  tableNames: string[];
  /** 插件 extensionPath，用于定位 resources/ai-skills */
  extensionPath: string;
}

/** 主编排输出的单步计划（与 publish_execution_plan 工具一致） */
export interface ExecutionPlanStep {
  step: number;
  agent: string;
  input?: Record<string, unknown>;
}

export interface ExecutionPlanPayload {
  intent: string;
  plan: ExecutionPlanStep[];
}

/** 流式 token 归属：主编排模型 vs task 子图内 subagent（与 checkpoint_ns 一致） */
export type AgentTokenStreamMeta =
  | { stream: "main" }
  | { stream: "subagent"; subagentType: string; delegationId: number };

/** 流式回调 */
export interface AgentStreamCallbacks {
  onToken: (token: string, meta?: AgentTokenStreamMeta) => void;
  onToolStart: (toolName: string, input: string) => void;
  onToolEnd: (toolName: string, output: string) => void;
  /** 主编排通过 publish_execution_plan 同步的计划，用于聊天界面展示 */
  onExecutionPlan?: (payload: ExecutionPlanPayload) => void;
  /** 主 agent 调用 deepagents 的 task 工具委派 subagent 时回调 */
  onSubagentTask?: (payload: {
    subagentType: string;
    description: string;
    delegationId: number;
  }) => void;
  onError: (err: string) => void;
  onEnd: () => void;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function querySql(
  connData: DatasourceInputData,
  databaseName: string,
  sql: string,
): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> {
  return withMysqlSession(connData, databaseName, async (conn) => {
    return new Promise((resolve, reject) => {
      conn.query(sql, (err: unknown, results: unknown) => {
        if (err) return reject(err);
        if (Array.isArray(results)) {
          const rows = results.slice(0, 50) as Record<string, unknown>[];
          return resolve({ rows, rowCount: results.length });
        }
        const r = results as Record<string, unknown>;
        return resolve({
          rows: [],
          rowCount:
            typeof r?.affectedRows === "number" ? r.affectedRows : 0,
        });
      });
    });
  });
}

/** 将值格式化为可读字符串（处理 Date、Buffer 等特殊类型） */
function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (v instanceof Date) {
    const y = v.getFullYear();
    const mo = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    const h = v.getHours(), mi = v.getMinutes(), s = v.getSeconds();
    if (h === 0 && mi === 0 && s === 0) return `${y}-${mo}-${d}`;
    return `${y}-${mo}-${d} ${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  if (Buffer.isBuffer(v)) {
    if (v.length <= 8) return "0x" + v.toString("hex");
    return `<BLOB ${v.length} bytes>`;
  }
  const s = String(v);
  return s.length > 100 ? s.slice(0, 100) + "…" : s;
}

/** 将行数据格式化为 Markdown 表格 */
function toMarkdownTable(
  rows: Record<string, unknown>[],
  totalCount: number,
  maxRows: number,
): string {
  if (rows.length === 0) return "(空结果集)";
  const cols = Object.keys(rows[0]);
  const display = rows.slice(0, maxRows);
  const header = "| " + cols.join(" | ") + " |";
  const sep = "| " + cols.map(() => "---").join(" | ") + " |";
  const body = display
    .map((r) => "| " + cols.map((c) => formatValue(r[c])).join(" | ") + " |")
    .join("\n");
  let result = header + "\n" + sep + "\n" + body;
  if (totalCount > maxRows) {
    result += `\n\n共 ${totalCount} 行，已显示前 ${maxRows} 行。`;
  } else {
    result += `\n\n共 ${totalCount} 行。`;
  }
  return result;
}

/** 构造连接到当前数据库会话的工具集（execute_sql / list_tables / describe_table） */
function buildTools(connData: DatasourceInputData, databaseName: string) {
  const executeSql = tool(
    async ({ sql }) => {
      try {
        const { rows, rowCount } = await querySql(
          connData,
          databaseName,
          sql,
        );
        if (rows.length > 0) {
          return toMarkdownTable(rows, rowCount, 30);
        }
        return `执行成功，影响 ${rowCount} 行。`;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return `SQL 执行失败: ${msg}`;
      }
    },
    {
      name: "execute_sql",
      description:
        "在当前 MySQL 数据库上执行 SQL 语句并返回 Markdown 表格格式的结果。可以执行 SELECT、INSERT、UPDATE、DELETE、CREATE 等任意 SQL。",
      schema: z.object({
        sql: z.string().describe("要执行的 SQL 语句"),
      }),
    },
  );

  const listTables = tool(
    async () => {
      try {
        const { rows } = await querySql(
          connData,
          databaseName,
          `SELECT TABLE_NAME AS \`表名\`, TABLE_COMMENT AS \`备注\`, TABLE_ROWS AS \`行数(估)\`
           FROM information_schema.TABLES
           WHERE TABLE_SCHEMA = '${databaseName}'
           ORDER BY TABLE_NAME`,
        );
        if (rows.length === 0) return "当前数据库没有表。";
        return toMarkdownTable(rows, rows.length, 200);
      } catch (err: unknown) {
        return `查询失败: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
    {
      name: "list_tables",
      description:
        "列出当前数据库中的所有表名、备注和大致行数，返回 Markdown 表格。",
      schema: z.object({}),
    },
  );

  const describeTable = tool(
    async ({ table_name }) => {
      try {
        const { rows } = await querySql(
          connData,
          databaseName,
          `SELECT COLUMN_NAME AS \`列名\`, COLUMN_TYPE AS \`类型\`, IS_NULLABLE AS \`可空\`,
                  COLUMN_KEY AS \`键\`, COLUMN_DEFAULT AS \`默认值\`, COLUMN_COMMENT AS \`备注\`
           FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = '${databaseName}' AND TABLE_NAME = '${table_name}'
           ORDER BY ORDINAL_POSITION`,
        );
        if (rows.length === 0) return `表 \`${table_name}\` 不存在或没有字段。`;
        return toMarkdownTable(rows, rows.length, 200);
      } catch (err: unknown) {
        return `查询失败: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
    {
      name: "describe_table",
      description:
        "查看指定表的字段结构（列名、类型、是否可空、主键、默认值、注释），返回 Markdown 表格。",
      schema: z.object({
        table_name: z.string().describe("表名"),
      }),
    },
  );

  const explainSql = tool(
    async ({ sql }) => {
      const trimmed = sql.trim();
      if (!/^explain\s+/i.test(trimmed)) {
        return "拒绝：本工具仅允许以 EXPLAIN 开头的只读诊断语句（例如 EXPLAIN SELECT …）。";
      }
      try {
        const { rows, rowCount } = await querySql(
          connData,
          databaseName,
          sql,
        );
        if (rows.length > 0) {
          return toMarkdownTable(rows, rowCount, 40);
        }
        return "(EXPLAIN 无行结果)";
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return `EXPLAIN 执行失败: ${msg}`;
      }
    },
    {
      name: "explain_sql",
      description:
        "仅执行 EXPLAIN … 形式的只读诊断，返回 Markdown 表格。用于 SQL 校验前预估执行计划。",
      schema: z.object({
        sql: z.string().describe("必须以 EXPLAIN 开头的 SQL"),
      }),
    },
  );

  return { executeSql, listTables, describeTable, explainSql };
}

const executionPlanStepSchema = z.object({
  step: z.number(),
  agent: z.string(),
  input: z.record(z.string(), z.unknown()).optional(),
});

/** 主编排将计划同步到 UI（由插件转发到 webview） */
function buildPublishExecutionPlanTool(callbacks: AgentStreamCallbacks) {
  return tool(
    async (input: { intent: string; plan: z.infer<typeof executionPlanStepSchema>[] }) => {
      callbacks.onExecutionPlan?.({
        intent: input.intent,
        plan: input.plan,
      });
      return "执行计划已同步到聊天界面，请继续通过 task 工具委派各 subagent。";
    },
    {
      name: "publish_execution_plan",
      description:
        "将主编排生成的执行计划同步到用户聊天界面。在确定 intent 与 plan 步骤后、开始调用 task 委派之前必须调用一次。",
      schema: z.object({
        intent: z.string().describe("用户意图简述"),
        plan: z
          .array(executionPlanStepSchema)
          .describe("步骤列表，与系统要求 JSON 中 plan 字段一致"),
      }),
    },
  );
}

function parseToolCallArgs(args: unknown): Record<string, unknown> | null {
  if (args == null) {
    return null;
  }
  if (typeof args === "string") {
    try {
      return JSON.parse(args) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (typeof args === "object") {
    return args as Record<string, unknown>;
  }
  return null;
}

/** 主 agent 系统提示中追加的当前数据库上下文（与 db-orchestrator/SKILL.md 配合） */
function buildContextPrompt(cfg: AgentRunConfig): string {
  let ctx =
    "\n\n## Current Database Context\n" +
    `- Connection: ${cfg.connName}\n` +
    `- Database: ${cfg.databaseName}\n`;
  if (cfg.tableNames.length > 0) {
    ctx += `- Known tables: ${cfg.tableNames.join(", ")}\n`;
  }
  ctx +=
    "\n## Orchestration UI\n" +
    "- After you finalize the deterministic plan (intent + plan steps), you MUST call the tool `publish_execution_plan` exactly once with the same structure.\n" +
    "- Then delegate each step using the `task` tool: set `subagent_type` to one of: schema_agent, sql_agent, sql_validator_agent, execution_agent, data_analysis_agent, visualization_agent, repair_agent (and general-purpose if needed).\n" +
    "\n## Output Convention\n" +
    "- Reply in 中文.\n" +
    "- 工具返回的 Markdown 表格本身就是数据结论；不要在正文里逐行复述。\n" +
    "- 对最终的 SELECT 结果，正文一两句话收尾即可。\n" +
    "- Markdown 表格：表头行必须以 `|` 开头（同一行不要写 `1.`、`•`、`- ` 等序号或项目符号）；表格前必须有空行；不要把 Markdown 表格放进 ``` 代码围栏内。\n" +
    "- 不要把 SQL、JSON 与中文说明混在一个代码块里；SQL 用 ```sql 单独围栏。\n";
  return ctx;
}

/** 构造 ChatOpenAI 实例 */
function buildModel(cfg: AgentRunConfig, streaming: boolean): ChatOpenAI {
  return new ChatOpenAI({
    apiKey: cfg.apiKey,
    configuration: { baseURL: cfg.baseUrl.replace(/\/+$/, "") },
    model: cfg.model,
    streaming,
  });
}

/** 把对话历史转换为 createDeepAgent 接受的简单消息数组 */
function buildMessages(
  systemAppendix: string,
  history: ChatMessage[],
): { role: string; content: string }[] {
  const filtered = history.filter((m) => m.role !== "system");
  if (!systemAppendix) return filtered;
  return [{ role: "system", content: systemAppendix }, ...filtered];
}

/**
 * 解析 deepagents 流事件并转发到 webview 回调；返回已发往 UI 的助手文本拼接（用于调试日志）
 *
 * Subagent 归属（与 README「DeepAgents 流式 chunk」及 `.cursor/rules/deepagent-stream-subagents.mdc` 一致）：
 * - messages 分片元数据 checkpoint_ns 以 `tools:` 开头 → Task 子图内（subagent）模型 token。
 * - 仅 `model_request:<uuid>` → 主编排模型 token；具体 subagent 名需结合 updates 里 task 的 args.subagent_type。
 */
async function pipeStream(
  stream: AsyncIterable<unknown>,
  callbacks: AgentStreamCallbacks,
): Promise<string> {
  let fullAssistantText = "";
  /** 当前 task 子图内模型流归属（由 updates.model_request 里 task 设置，tools 里 task 结束清除） */
  let pendingSubagentType: string | null = null;
  let activeDelegationId = -1;
  let delegationCounter = 0;

  for await (const chunk of stream) {
    const [mode, data] = chunk as [string, unknown];

    if (mode === "messages") {
      const parts = data as unknown[];
      const msg = parts[0] as { content?: string | unknown[] } | undefined;
      const bundle = parts[1] as Record<string, unknown> | undefined;
      const nsRaw =
        bundle && typeof bundle.checkpoint_ns === "string"
          ? bundle.checkpoint_ns
          : bundle && typeof bundle.langgraph_checkpoint_ns === "string"
            ? bundle.langgraph_checkpoint_ns
            : "";
      const inSubagentTools =
        typeof nsRaw === "string" &&
        nsRaw.startsWith("tools:") &&
        pendingSubagentType != null &&
        activeDelegationId >= 0;

      const emitToken = (text: string) => {
        if (!text) {
          return;
        }
        fullAssistantText += text;
        if (inSubagentTools) {
          callbacks.onToken(text, {
            stream: "subagent",
            subagentType: pendingSubagentType!,
            delegationId: activeDelegationId,
          });
        } else {
          callbacks.onToken(text, { stream: "main" });
        }
      };

      if (msg && typeof msg.content === "string" && msg.content) {
        emitToken(msg.content);
      } else if (Array.isArray(msg?.content)) {
        for (const block of msg.content) {
          if (
            block &&
            typeof block === "object" &&
            "type" in block &&
            (block as Record<string, unknown>).type === "text"
          ) {
            const text = (block as { text?: string }).text;
            if (text) {
              emitToken(text);
            }
          }
        }
      }
    }

    if (mode === "updates") {
      const upd = data as Record<
        string,
        { messages?: unknown[] } | undefined
      >;
      const toolsNode = upd?.tools;
      if (toolsNode?.messages) {
        for (const tmsg of toolsNode.messages) {
          const tm = tmsg as { name?: string; content?: string };
          if (tm.name === "task") {
            pendingSubagentType = null;
            activeDelegationId = -1;
          }
          if (tm.name && tm.content !== undefined) {
            callbacks.onToolEnd(
              tm.name,
              typeof tm.content === "string"
                ? tm.content.slice(0, 2000)
                : JSON.stringify(tm.content).slice(0, 2000),
            );
          }
        }
      }

      // LangGraph 节点名多为 model_request；与落盘 JSON 样本一致，兼容旧键 model
      const modelNode = upd?.model_request ?? upd?.model;
      if (modelNode?.messages) {
        for (const mmsg of modelNode.messages) {
          const am = mmsg as {
            tool_calls?: { name: string; args: unknown }[];
          };
          if (am.tool_calls) {
            for (const tc of am.tool_calls) {
              const argStr =
                typeof tc.args === "string"
                  ? tc.args
                  : JSON.stringify(tc.args);
              if (tc.name === "task") {
                const parsed = parseToolCallArgs(tc.args);
                const subagentType =
                  typeof parsed?.subagent_type === "string"
                    ? parsed.subagent_type
                    : "";
                const description =
                  typeof parsed?.description === "string"
                    ? parsed.description
                    : "";
                if (subagentType) {
                  delegationCounter += 1;
                  activeDelegationId = delegationCounter;
                  pendingSubagentType = subagentType;
                  callbacks.onSubagentTask?.({
                    subagentType,
                    description,
                    delegationId: delegationCounter,
                  });
                }
              }
              callbacks.onToolStart(tc.name, argStr);
            }
          }
        }
      }
    }
  }
  return fullAssistantText;
}

/** 构造 7 个 subagent，各自挂载与职责匹配的数据库工具 */
function buildSubagents(
  _cfg: AgentRunConfig,
  skillsRoot: string,
  tools: ReturnType<typeof buildTools>,
): SubAgent[] {
  const subModel = buildModel(_cfg, true);
  const skill = (group: string) => `${skillsRoot}/${group}`;
  const readSchema = [tools.listTables, tools.describeTable];
  const readSchemaExplain = [
    tools.listTables,
    tools.describeTable,
    tools.explainSql,
  ];
  const readWriteQuery = [
    tools.executeSql,
    tools.listTables,
    tools.describeTable,
  ];

  return [
    {
      name: "schema_agent",
      description:
        "Agent responsible for understanding the database schema and mapping user queries to relevant tables and fields.",
      systemPrompt: SCHEMA_AGENT_PROMPT,
      skills: [skill("schema")],
      tools: readSchema,
      model: subModel,
    },
    {
      name: "sql_agent",
      description: "Agent responsible for generating SQL queries.",
      systemPrompt: SQL_AGENT_PROMPT,
      skills: [skill("sql")],
      tools: readSchema,
      model: subModel,
    },
    {
      name: "sql_validator_agent",
      description: "Agent responsible for validating SQL queries.",
      systemPrompt: SQL_VALIDATOR_AGENT_PROMPT,
      skills: [skill("validator")],
      tools: readSchemaExplain,
      model: subModel,
    },
    {
      name: "execution_agent",
      description:
        "Agent responsible for executing SQL against the database and returning raw results.",
      systemPrompt: EXECUTION_AGENT_PROMPT,
      skills: [skill("execution")],
      tools: [tools.executeSql],
      model: subModel,
    },
    {
      name: "data_analysis_agent",
      description: "Agent responsible for analyzing data.",
      systemPrompt: DATA_ANALYSIS_AGENT_PROMPT,
      skills: [skill("analysis")],
      tools: readWriteQuery,
      model: subModel,
    },
    {
      name: "visualization_agent",
      description: "Agent responsible for creating visualizations.",
      systemPrompt: VISUALIZATION_AGENT_PROMPT,
      skills: [skill("visualization")],
      tools: readWriteQuery,
      model: subModel,
    },
    {
      name: "repair_agent",
      description: "Agent responsible for repairing SQL issues.",
      systemPrompt: REPAIR_AGENT_PROMPT,
      skills: [skill("repair")],
      tools: readWriteQuery,
      model: subModel,
    },
  ];
}

export async function runAgent(
  cfg: AgentRunConfig,
  history: ChatMessage[],
  callbacks: AgentStreamCallbacks,
): Promise<void> {
  try {
    const tools = buildTools(cfg.connData, cfg.databaseName);
    const mainModel = buildModel(cfg, true);
    const publishPlan = buildPublishExecutionPlanTool(callbacks);

    const skillsRootAbs = path.join(
      cfg.extensionPath,
      "resources",
      "ai-skills",
    );
    const backend = new FilesystemBackend({
      rootDir: skillsRootAbs,
      virtualMode: true,
    });

    const subagents = buildSubagents(cfg, "/", tools);

    const agent = createDeepAgent({
      model: mainModel,
      tools: [
        publishPlan,
        tools.executeSql,
        tools.listTables,
        tools.describeTable,
        tools.explainSql,
      ],
      systemPrompt: MAIN_AGENT_PROMPT + buildContextPrompt(cfg),
      skills: ["/main"],
      backend,
      subagents,
    });

    const messages = buildMessages("", history);

    const stream = await agent.stream(
      { messages },
      { streamMode: ["updates", "messages"] },
    );

    await pipeStream(
      stream as AsyncIterable<unknown>,
      callbacks,
    );

    callbacks.onEnd();
  } catch (err: unknown) {
    callbacks.onError(err instanceof Error ? err.message : String(err));
    callbacks.onEnd();
  }
}
