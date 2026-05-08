# CADB — VS Code 数据库管理扩展

> 本文件面向 AI 编码助手与人类开发者，提供项目背景、架构概览、开发约定与扩展指南。README 面向终端用户，AGENTS 面向贡献者。

---

## 1. 项目背景

**CADB** 是一个在 VS Code 中管理多种数据源的扩展，当前支持：

- **MySQL**（含 MariaDB）：连接池、SQL 执行、表数据查看与编辑、表结构编辑、工作区符号搜索
- **SQLite**：本地文件数据库、SQL 执行、表数据查看与编辑、表结构查看
- **Redis**：键值浏览、Pub/Sub
- **OSS**（S3 兼容）：Bucket/目录/文件浏览、下载预览

扩展还提供 **AI 数据库助手**，基于 `deepagents` 实现主编排 + 多 Subagent 编排（schema / sql / validator / repair / execution / visualization / analysis），通过自然语言查库。

- 仓库：https://github.com/caoaolong/vscode-cadb
- 发布者：`codingsoul`
- 许可证：MIT

---

## 2. 技术栈

| 层级 | 技术 |
|------|------|
| 扩展运行时 | Node.js + VS Code Extension API (`vscode`) |
| 语言 | TypeScript 5.9（`strict: true`，`module: Node16`） |
| 构建工具 | Webpack 5 + `ts-loader` |
| 数据库驱动 | `mysql2`（连接池）、`sqlite3`（SQLite）、`redis`（官方客户端）、`@aws-sdk/client-s3` |
| AI / LLM | `deepagents` + `langchain` + `@langchain/openai` / `anthropic` / `google-genai` |
| Webview UI | Layui 2.x、jQuery、AG Grid Community、Monaco Editor、jsoneditor、marked、chatarea |
| 图标字体 | VS Code Codicons（本地 vendor） |

---

## 3. 目录结构

```
vscode-cadb/
├── src/
│   ├── extension.ts                          # 扩展激活入口（activate）
│   ├── provider/
│   │   ├── database_provider.ts              # 数据源树 TreeDataProvider（核心）
│   │   ├── result_provider.ts                # 底部「查询」WebviewViewProvider
│   │   ├── completion_item_provider.ts       # SQL 自动补全
│   │   ├── workspace_symbol_provider.ts      # MySQL 表工作区符号 + cadb:// 虚拟文档
│   │   ├── webview_helper.ts                 # WebviewPanel 创建工具
│   │   ├── cadb_storage_keys.ts              # globalState/workspaceState 键名常量
│   │   ├── entity/
│   │   │   ├── datasource.ts                 # Datasource 树节点（TreeItem 子类）
│   │   │   ├── dataloader.ts                 # Dataloader 接口定义
│   │   │   ├── mysql_dataloader.ts           # MySQL 驱动实现
│   │   │   ├── sqlite_dataloader.ts          # SQLite 驱动实现
│   │   │   ├── redis_dataloader.ts           # Redis 驱动实现
│   │   │   └── oss_dataloader.ts             # OSS 驱动实现
│   │   ├── component/
│   │   │   ├── commands.ts                   # 命令注册（树操作、设置、表编辑等）
│   │   │   ├── sql_executor.ts               # SQL 执行器
│   │   │   ├── database_manager.ts           # 当前连接/数据库状态管理
│   │   │   ├── database_status_bar.ts        # 底部状态栏
│   │   │   ├── database_selector.ts          # 数据库选择器
│   │   │   ├── sql_hover_provider.ts         # SQL 悬浮提示（表 DDL、字段信息）
│   │   │   ├── sql_codelens_provider.ts      # CodeLens（尚未大规模使用）
│   │   │   ├── sql_limit_guard.ts            # SELECT 自动追加 LIMIT
│   │   │   ├── grid_filter_sql.ts            # AG Grid 过滤模型转 SQL WHERE
│   │   │   ├── db_connection_scanner.ts      # 扫描目录中的数据库连接配置
│   │   │   ├── cadb_drag_drop_controller.ts  # 树拖拽控制器
│   │   │   ├── ai_chat_provider.ts           # AI 数据库助手 Webview 管理
│   │   │   ├── ai_agent.ts                   # deepagents 运行封装
│   │   │   └── ai_prompts.ts                 # AI 系统提示词
│   │   ├── drivers/
│   │   │   ├── registry.ts                   # 驱动注册表（支持外部扩展注册新驱动）
│   │   │   ├── builtin_drivers.ts            # 内置驱动注册（MySQL / SQLite / Redis / OSS）
│   │   │   ├── types.ts                      # 驱动能力接口
│   │   │   ├── enabled_store.ts              # 驱动启用状态持久化
│   │   │   └── package_versions.ts           # 驱动依赖版本展示
│   │   ├── mysql/
│   │   │   └── pool_registry.ts              # MySQL 连接池全局注册表
│   │   ├── preview_plugins/
│   │   │   ├── registry.ts                   # 单元格预览插件注册表
│   │   │   ├── enabled_store.ts              # 预览插件启用状态
│   │   │   └── types.ts                      # 预览插件接口
│   │   └── utils/
│   │       └── index.ts                      # 工具函数（fuzzyMatch 等）
│   └── test/
│       └── extension.test.ts                 # 扩展测试入口
├── resources/
│   ├── panels/                               # Webview HTML / JS / CSS
│   │   ├── grid.html / grid.js / grid.css    # 数据表格（AG Grid）
│   │   ├── result.html / result.js           # 查询结果面板
│   │   ├── edit.html / edit.js               # 表结构编辑
│   │   ├── settings.html / settings.js       # 连接/数据库配置管理
│   │   ├── ai-chat.html / ai-chat.js / ai-chat.css   # AI 助手
│   │   ├── redis-pubsub.html / redis-pubsub.js       # Redis Pub/Sub
│   │   ├── items.html / items.js             # 新建项向导
│   │   └── common/                           # 公共脚本与 vendor
│   │       ├── vendor/layui/                 # Layui（完整 dist + modules）
│   │       ├── vendor/jquery/                # jQuery
│   │       ├── vendor/jsoneditor/            # JSON Editor
│   │       ├── vendor/codicons/              # VS Code Codicons
│   │       └── ...
│   ├── ai-skills/                            # AI Agent 技能定义（供开发参考）
│   │   ├── main/
│   │   │   ├── db-orchestrator/SKILL.md      # 主编排计划
│   │   │   └── deepagent-stream-token-usage/SKILL.md  # Token 用量统计
│   │   ├── schema/db-schema-expert/
│   │   ├── sql/sql-generator/
│   │   ├── validator/sql-validator/
│   │   ├── repair/sql-repair/
│   │   ├── execution/sql-executor/
│   │   ├── visualization/data-visualizer/
│   │   └── analysis/data-analyst/
│   └── icons/                                # 驱动图标（SVG 明暗两套）
├── scripts/
│   ├── copy-webview-vendor.cjs               # 复制 jQuery / Layui / jsoneditor 到 resources
│   ├── copy-layui-modules.cjs                # 从 GitHub 源码包下载 Layui modules
│   └── copy-ai-chat-vendor.cjs               # 复制 chatarea / marked / codicons
├── dist/                                     # Webpack 输出（extension.js）
├── out/                                      # tsc 测试编译输出
├── package.json                              # 扩展清单（命令、菜单、配置、快捷键）
├── webpack.config.js                         # Webpack 配置（target: node）
├── tsconfig.json                             # TS 配置（strict, Node16）
└── .cursor/rules/deepagent-stream-subagents.mdc  # AI stream chunk 解读规则（Cursor 工作区规则）
```

---

## 4. 架构概览

### 4.1 扩展生命周期

1. **`activate(context)`**（`src/extension.ts`）
   - 注册内置驱动（`registerBuiltinDatabaseDrivers`）
   - 创建 `DataSourceProvider`（树数据源）
   - 创建 `TreeView`，恢复展开状态与侧栏可见性
   - 注册所有命令（数据源、SQL、AI、结果面板等）
   - 初始化 `DatabaseManager`、`SqlExecutor`、`AiChatProvider`
   - 注册语言功能（补全、悬浮、格式化、CodeLens、工作区符号）

### 4.2 数据源树（核心模型）

- `DataSourceProvider` 实现 `vscode.TreeDataProvider<Datasource>`
- 树节点类型（`Datasource.type` / `contextValue`）：
  - `group` → 连接分组（根节点）
  - `datasource` / `datasourceClosed` → 数据库连接（可开关）
  - `datasourceType` → 数据库列表（Databases）
  - `collection` → 数据库
  - `collectionType` → 表列表（Tables）
  - `document` → 表
  - `fieldType` / `field` → 字段列表 / 字段
  - `indexType` / `index` → 索引列表 / 索引
  - `userType` / `user` → 用户列表 / 用户
  - `fileType` / `file` → SQL 文件列表 / 文件
  - `folder` / `item` → OSS 目录 / 通用项

- 树数据**每次刷新都从服务器拉取最新结构**，不缓存树数据；仅持久化：
  - 展开状态（`expandedNodes`）
  - 过滤显示的数据库/表（`selectedDatabases` / `selectedTables`）
  - 用户手动关闭的连接名（`closedConnectionNames`）

### 4.3 驱动架构（可扩展）

- `RegisteredDatabaseDriver` 接口定义驱动的 ID、能力、展示、Dataloader 工厂
- `registerDatabaseDriver()` 允许外部扩展在激活时注册新驱动
- 内置驱动在 `builtin_drivers.ts` 中注册，能力标记：
  - `createDatabase` — 支持创建数据库
  - `sqlExecutionTarget` — 可作为 SQL 执行目标
  - `supportsTreeDelete` — 支持在侧栏删除对象
  - `supportsSchemaHover` — 支持表/字段悬浮提示

> **SQLite 特殊处理**：SQLite 没有「多数据库」概念，一个文件即一个数据库。因此 `listDatabases` 返回一个虚拟的 `main` 节点，树结构为 `datasource → datasourceType → collection(main) → collectionType → document`。SQL 执行时不需切换数据库，直接对文件操作。

### 4.4 SQL 执行流程

1. 用户在 `.sql` 编辑器中执行命令（`runCurrent` / `runSelection` / `runAll` / `runLine`）
2. 解析 SQL 语句（按分号拆分，支持注释与字符串逃逸）
3. `SqlExecutor` 通过 `DatabaseManager` 获取当前连接与数据库
4. 自动追加 `LIMIT`（若配置开启且为 SELECT/WITH）
5. `SqlExecutor` 根据当前连接 `dbType` 分发执行：
   - **MySQL**：通过 `withMysqlSession` 使用连接池执行
   - **SQLite**：通过 `SQLiteDataloader.executeSql()` 直接操作 `sqlite3.Database`
6. 执行后结果发送到 `ResultWebviewProvider`（底部查询面板）
7. 执行日志写入 `CADB SQL` 输出通道

### 4.5 AI 数据库助手

- `AiChatProvider` 管理 AI 聊天 WebviewPanel
- `ai_agent.ts` 封装 `deepagents` 的 `runAgent`，使用 `streamMode: ["updates", "messages"]`
- 流式 chunk 通过 `checkpoint_ns` / `langgraph_checkpoint_ns` 区分主编排与子 Agent
- 前端使用 Layui 时间线 + 折叠面板渲染执行计划与各 subagent 输出
- 聊天记录持久化到文件（`globalStorageUri/ai-chat-sessions.json`），含 `intent` / `plan[]` / `agents[]`

---

## 5. 开发工作流

### 5.1 安装依赖

```bash
npm install
```

`postinstall` 会自动执行三个 copy scripts，将 Webview 静态资源复制到 `resources/panels/` 下。

### 5.2 编译与调试

```bash
# 开发模式（watch）
npm run watch

# 一次性编译
npm run compile

# 打包（生产模式，隐藏 source map）
npm run package
```

按 `F5` 启动 Extension Host 调试窗口。

### 5.3 测试

```bash
npm run test
```

### 5.4 Lint

```bash
npm run lint
```

---

## 6. 关键设计决策与约定

### 6.1 静态资源不直接引用 `node_modules`

VS Code 安装版或新版本地资源管线下，Webview 直接通过 `asWebviewUri(node_modules/...)` 加载依赖易出现 **404**。因此：

- `scripts/copy-ai-chat-vendor.cjs` → `resources/panels/ai-chat/vendor/`
- `scripts/copy-webview-vendor.cjs` → `resources/panels/common/vendor/`
- `scripts/copy-layui-modules.cjs` → 从 GitHub 源码包下载 Layui modules 到 `node_modules/layui/dist/modules/`

**HTML 中一律使用 `{{resources-uri}}/...` 引用本地 vendor，不再引用 `node_modules`**。

### 6.2 Webview `ready` 后再下发 `load`

所有 Webview（settings、grid、edit、ai-chat 等）的初始数据下发，**必须等待前端发送 `ready` 消息**。编辑类面板还需等待 `item.edit()` 异步完成后再发送，避免扩展先于脚本注册监听而丢消息。

### 6.3 SQL 语句拆分

`parseSqlStatementSpans()` 手写状态机，支持：
- 单引号 / 双引号 / 反引号字符串（含转义）
- `--` / `#` 行注释
- `/* */` 块注释
- 分号语句分隔

用于 `runCurrent`、`runLine`、`runAll`、`runFile`、`explain` 等场景。

### 6.4 SQL 文件与数据源绑定记忆

- 每个 `.sql` 文件按 `document.uri.toString()` 作为 key，记忆最后一次使用的连接名与数据库名
- 切换到 SQL 编辑器时自动恢复绑定
- 绑定随 `workspaceState` 持久化

### 6.5 树节点多选与命令作用域

`commands.ts` 中 `nodesForTreeCommand(treeView, item)` 实现：
- 若右键项属于当前多选，则命令作用于整组多选
- 否则仅作用于右键项

与 VS Code 资源管理器行为一致。

### 6.6 工作区符号（Ctrl+T / Cmd+T）

`MySQLTableWorkspaceSymbolProvider` 将当前「过滤显示」的数据库下的所有表注册为工作区符号，选择后通过 `cadb://` 虚拟文档打开并触发「查看表数据」。

### 6.7 连接保存位置

连接可保存到：
- **用户**（`globalState`）— 全局可用
- **工作区**（`.cadb/connections.json`）— 仅当前工作区

`DataSourceProvider` 在初始化与刷新时合并两套连接，工作区连接优先（同名时覆盖用户连接）。

---

## 7. 编码规范

- **TypeScript**：`strict: true`，优先使用 `const` / `let`，避免 `var`
- **错误处理**：异步操作使用 `try/catch`，用户可见错误通过 `vscode.window.showErrorMessage` 或 Webview `status` 消息展示
- **字符串拼接 SQL**：仅在内部已知安全场景使用；用户输入一律用参数化或占位符转义
- **资源释放**：所有 `Disposable`（命令、事件监听、Webview、输出通道）必须 `context.subscriptions.push()`
- **日志**：开发调试使用 `console.error` / `console.warn`；用户执行日志使用专用 `OutputChannel`
- **平台兼容**：路径比较在 Windows 下转小写；`path.sep` 使用 `path.join`

---

## 8. 扩展指南：添加新数据库驱动

### 8.1 最小步骤

1. **安装 npm 依赖**：在 `package.json` `dependencies` 中添加数据库客户端包
2. **实现 Dataloader**：在 `src/provider/entity/` 下新建 `{xxx}_dataloader.ts`，实现 `Dataloader` 接口
3. **注册驱动**：在 `src/provider/drivers/builtin_drivers.ts` 中新增 `registerXxx()` 函数，调用 `registerDatabaseDriver()`
4. **添加图标**：在 `resources/icons/{xxx}/` 下放置 `{Xxx}_light.svg` 与 `{Xxx}_dark.svg`
5. **声明能力**：在 `DriverCapabilities` 中标记该驱动支持的操作

### 8.2 Dataloader 必须实现的方法

| 方法 | 说明 |
|------|------|
| `test()` | 测试连接可用性 |
| `connect()` / `disconnect()` | 打开/关闭连接 |
| `listDatabases()` | 列出数据库 |
| `listTables()` | 列出表 |
| `listColumns()` | 列出字段 |
| `listData(options?)` | 查询表数据（支持分页/过滤/排序） |
| `descTable()` / `descDatabase()` / `descDatasource()` | 返回编辑表单数据 |

可选实现：`saveData()`（表数据编辑）、`alterColumn()` / `alterIndex()`（结构变更）、`listCollations()`、`createDatabase()` 等。

---

## 9. AI 助手开发约定

### 9.1 Stream Chunk 路由

`streamMode: ["updates", "messages"]` 下，每个 chunk 为 `[mode, payload]`：

- **`messages` 分片**：`payload` 为 `[messageChunk, bundleMetadata]`
  - `bundleMetadata.checkpoint_ns` / `langgraph_checkpoint_ns` **以 `tools:` 开头** → 来自 Task 子图内某 subagent
  - **仅为 `model_request:<uuid>`**、无 `tools:` 前缀 → 顶层主编排

- **具体 subagent 识别**：在时间上靠前的 `updates` 中读取 `model_request` 节点下 AI 消息的 `tool_calls`，对 `name === "task"` 解析 `args.subagent_type`

完整约定见 `.cursor/rules/deepagent-stream-subagents.mdc`。

### 9.2 Token 用量统计

从流式 chunk 汇总本次会话 Token 用量的步骤见 `resources/ai-skills/main/deepagent-stream-token-usage/SKILL.md`。

### 9.3 新增 AI Skill

如需新增 subagent 类型：
1. 在 `resources/ai-skills/` 下新建分类目录与 `SKILL.md`
2. 在 `ai_agent.ts` / `ai_prompts.ts` 中注册对应 agent 配置与系统提示词
3. 确保主编排计划（orchestrator）在适当时机通过 `task` 工具调用该 subagent

---

## 10. 常见问题

### Q: Webview 白屏或 `$ is not defined`
A: 检查 `postinstall` 是否成功执行了 copy scripts；`resources/panels/common/vendor/` 与 `resources/panels/ai-chat/vendor/` 下应有对应文件。

### Q: Layui 表单空白
A: `layui.use(['form','layer',...])` 需要 `layui.js` 同级 `modules/*.js`。确认 `copy-layui-modules.cjs` 已运行，且 `node_modules/layui/dist/modules/` 存在。

### Q: 新增驱动后树中不显示
A: 检查 `registerBuiltinDatabaseDrivers()` 是否在 `activate()` 最早阶段调用；检查 `isDriverEnabled()` 是否返回 true；检查 `attachDriverToDatasourceNode()` 是否成功挂载 dataloader。

### Q: AI 助手流式输出错乱（主/子内容串扰）
A: 检查 `pipeStream` 中是否正确按 `checkpoint_ns` 前缀将 token 路由到对应 subagent 缓冲区；检查 `agent-trace` 事件是否正确上抛 `delegationId`。

---

## 11. 相关文件速查

| 需求 | 文件 |
|------|------|
| 添加新命令 | `package.json` contributes.commands + `src/extension.ts` 或 `src/provider/component/commands.ts` |
| 修改树结构/过滤逻辑 | `src/provider/database_provider.ts` |
| 修改 SQL 执行行为 | `src/provider/component/sql_executor.ts` |
| 修改 AI 助手前端 | `resources/panels/ai-chat.html` / `ai-chat.js` / `ai-chat.css` |
| 修改 AI Agent 后端 | `src/provider/component/ai_agent.ts` / `ai_chat_provider.ts` / `ai_prompts.ts` |
| 修改表格展示 | `resources/panels/grid.html` / `grid.js` / `grid.css` |
| 修改驱动能力 | `src/provider/drivers/types.ts` + `builtin_drivers.ts` + `{xxx}_dataloader.ts` |
| 修改连接配置表单 | `resources/panels/settings.html` / `settings.js` |
| 发布扩展 | `.github/workflows/publish.yml`（需配置 `VSCE_PAT` / `OVSX_PAT`） |

---

*最后更新：2025-05-08*

