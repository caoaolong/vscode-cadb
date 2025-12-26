/**
 * 统一配置页面
 * 根据配置类型动态加载不同的表单
 */

// VSCode API
const vscode = acquireVsCodeApi();

// 当前配置类型
let currentConfigType = null;
let dynamicForm = null;

// ==================== 配置类型定义 ====================

const CONFIG_TYPES = {
  DATASOURCE: "datasource",
  USER: "user",
};

// ==================== 数据库连接配置 ====================

const datasourceFieldMapping = {
  // 基础字段
  dbType: {
    type: "select",
    label: "数据库类型",
    category: "base",
    required: true,
    options: [
      { value: "mysql", label: "MySQL" },
      { value: "postgres", label: "PostgreSQL" },
      { value: "sqlite", label: "SQLite" },
      { value: "mssql", label: "SQL Server" },
    ],
  },
  name: {
    type: "text",
    label: "连接名称",
    category: "base",
    required: true,
    placeholder: "例如：生产数据库",
    hint: "给此连接起一个易于识别的名称",
  },
  host: {
    type: "text",
    label: "主机地址",
    category: "base",
    placeholder: "localhost 或 IP 地址",
  },
  port: {
    type: "number",
    label: "端口",
    category: "base",
    placeholder: "3306",
    min: 1,
    max: 65535,
  },
  username: {
    type: "text",
    label: "用户名",
    category: "base",
    placeholder: "数据库用户名",
  },
  password: {
    type: "password",
    label: "密码",
    category: "base",
    placeholder: "数据库密码",
  },
  database: {
    type: "text",
    label: "数据库名",
    category: "base",
    placeholder: "数据库名称",
    hint: "要连接的数据库名称（可选）",
  },
  // SQLite 专用字段
  sqlitePath: {
    type: "text",
    label: "文件路径",
    category: "base",
    placeholder: "/path/to/database.db",
    hint: "SQLite 数据库文件的完整路径",
  },
  // 高级字段
  charset: {
    type: "select",
    label: "字符集",
    category: "advance",
    options: ["utf8mb4", "utf8", "latin1", "gbk"],
  },
  timezone: {
    type: "text",
    label: "时区",
    category: "advance",
    placeholder: "+08:00",
  },
  connectTimeout: {
    type: "number",
    label: "连接超时(ms)",
    category: "advance",
    placeholder: "10000",
    min: 0,
  },
};

// ==================== 用户配置 ====================

// 所有权限字段列表
const privilegeFields = [
  "Select_priv", "Insert_priv", "Update_priv", "Delete_priv",
  "Create_priv", "Drop_priv", "Reload_priv", "Shutdown_priv",
  "Process_priv", "File_priv", "Grant_priv", "References_priv",
  "Index_priv", "Alter_priv", "Show_db_priv", "Super_priv",
  "Create_tmp_table_priv", "Lock_tables_priv", "Execute_priv",
  "Repl_slave_priv", "Repl_client_priv", "Create_view_priv",
  "Show_view_priv", "Create_routine_priv", "Alter_routine_priv",
  "Create_user_priv", "Event_priv", "Trigger_priv",
  "Create_tablespace_priv", "Create_role_priv", "Drop_role_priv"
];

const userFieldMapping = {
  // 基础字段
  User: {
    type: "text",
    label: "用户名",
    category: "base",
    required: true,
    placeholder: "数据库用户名",
  },
  Host: {
    type: "text",
    label: "主机",
    category: "base",
    required: true,
    placeholder: "% 表示任意主机",
  },
  plugin: {
    type: "select",
    label: "认证插件",
    category: "base",
    options: [
      { value: "caching_sha2_password", label: "caching_sha2_password" },
      { value: "mysql_native_password", label: "mysql_native_password" },
      { value: "sha256_password", label: "sha256_password" },
    ],
  },
  password: {
    type: "password",
    label: "密码",
    category: "base",
    placeholder: "留空则不修改密码",
    hint: "提示：编辑模式下留空密码字段将不会修改密码",
  },
  // 权限字段（常用）
  Select_priv: { type: "checkbox", title: "SELECT", category: "base" },
  Insert_priv: { type: "checkbox", title: "INSERT", category: "base" },
  Update_priv: { type: "checkbox", title: "UPDATE", category: "base" },
  Delete_priv: { type: "checkbox", title: "DELETE", category: "base" },
  Create_priv: { type: "checkbox", title: "CREATE", category: "base" },
  Drop_priv: { type: "checkbox", title: "DROP", category: "base" },
  Index_priv: { type: "checkbox", title: "INDEX", category: "base" },
  Alter_priv: { type: "checkbox", title: "ALTER", category: "base" },
  // 高级权限字段
  Reload_priv: { type: "checkbox", title: "RELOAD", category: "advance" },
  Shutdown_priv: { type: "checkbox", title: "SHUTDOWN", category: "advance" },
  Process_priv: { type: "checkbox", title: "PROCESS", category: "advance" },
  File_priv: { type: "checkbox", title: "FILE", category: "advance" },
  Grant_priv: { type: "checkbox", title: "GRANT", category: "advance" },
  References_priv: { type: "checkbox", title: "REFERENCES", category: "advance" },
  Show_db_priv: { type: "checkbox", title: "SHOW DATABASES", category: "advance" },
  Super_priv: { type: "checkbox", title: "SUPER", category: "advance" },
  Create_tmp_table_priv: { type: "checkbox", title: "CREATE TEMP TABLES", category: "advance" },
  Lock_tables_priv: { type: "checkbox", title: "LOCK TABLES", category: "advance" },
  Execute_priv: { type: "checkbox", title: "EXECUTE", category: "advance" },
  Repl_slave_priv: { type: "checkbox", title: "REPLICATION SLAVE", category: "advance" },
  Repl_client_priv: { type: "checkbox", title: "REPLICATION CLIENT", category: "advance" },
  Create_view_priv: { type: "checkbox", title: "CREATE VIEW", category: "advance" },
  Show_view_priv: { type: "checkbox", title: "SHOW VIEW", category: "advance" },
  Create_routine_priv: { type: "checkbox", title: "CREATE ROUTINE", category: "advance" },
  Alter_routine_priv: { type: "checkbox", title: "ALTER ROUTINE", category: "advance" },
  Create_user_priv: { type: "checkbox", title: "CREATE USER", category: "advance" },
  Event_priv: { type: "checkbox", title: "EVENT", category: "advance" },
  Trigger_priv: { type: "checkbox", title: "TRIGGER", category: "advance" },
  Create_tablespace_priv: { type: "checkbox", title: "CREATE TABLESPACE", category: "advance" },
  Create_role_priv: { type: "checkbox", title: "CREATE ROLE", category: "advance" },
  Drop_role_priv: { type: "checkbox", title: "DROP ROLE", category: "advance" },
  // 连接限制
  max_connections: {
    type: "number",
    label: "最大连接数",
    category: "advance",
    placeholder: "0",
    min: 0,
    hint: "0 表示不限制",
  },
  max_questions: {
    type: "number",
    label: "最大问题数",
    category: "advance",
    placeholder: "0",
    min: 0,
  },
  max_updates: {
    type: "number",
    label: "最大更新数",
    category: "advance",
    placeholder: "0",
    min: 0,
  },
  max_user_connections: {
    type: "number",
    label: "最大用户连接数",
    category: "advance",
    placeholder: "0",
    min: 0,
  },
  // SSL 配置
  ssl_type: {
    type: "select",
    label: "SSL 类型",
    category: "advance",
    options: [
      { value: "", label: "NONE" },
      { value: "ANY", label: "ANY" },
      { value: "X509", label: "X509" },
      { value: "SPECIFIED", label: "SPECIFIED" },
    ],
  },
  ssl_cipher: {
    type: "text",
    label: "SSL 密码",
    category: "advance",
    placeholder: "SSL 密码套件",
  },
  x509_issuer: {
    type: "text",
    label: "X509 颁发者",
    category: "advance",
    placeholder: "X509 证书颁发者",
  },
  x509_subject: {
    type: "text",
    label: "X509 使用者",
    category: "advance",
    placeholder: "X509 证书使用者",
  },
  // 账户状态
  account_locked: {
    type: "switch",
    label: "账户锁定",
    category: "advance",
    text: "是|否",
  },
  password_expired: {
    type: "switch",
    label: "密码过期",
    category: "advance",
    text: "是|否",
  },
};

// ==================== 自定义表单类 ====================

// 用户表单（扩展权限字段布局）
class UserDynamicForm extends DynamicForm {
  generateFieldsHtml(fields) {
    let html = "";
    
    // 分离权限字段和普通字段
    const privilegeFields = [];
    const normalFields = [];
    
    fields.forEach(field => {
      if (field.config.type === "checkbox" && field.name.endsWith("_priv")) {
        privilegeFields.push(field);
      } else {
        normalFields.push(field);
      }
    });
    
    // 先渲染普通字段
    if (normalFields.length > 0) {
      const useGrid = normalFields.length >= 4;
      if (useGrid) {
        html += '<div class="field-group">';
      }
      normalFields.forEach(field => {
        html += this.generateFieldHtml(field.name, field.config);
      });
      if (useGrid) {
        html += '</div>';
      }
    }
    
    // 再渲染权限字段（使用特殊网格布局）
    if (privilegeFields.length > 0) {
      if (normalFields.length > 0) {
        html += '<div class="section-title-small">权限设置</div>';
      }
      html += '<div class="permission-grid">';
      privilegeFields.forEach(field => {
        html += '<div class="layui-form-item permission-item">';
        html += this.generateCheckboxField(field.name, field.config);
        html += '</div>';
      });
      html += '</div>';
    }
    
    return html;
  }
}

// ==================== 初始化函数 ====================

/**
 * 初始化数据库连接配置表单
 */
function initDatasourceForm(data = {}) {
  $("#pageTitle").text("数据库连接配置");
  $("#pageSubtitle").text("配置数据库连接信息，支持多种数据库类型");
  
  // 根据数据库类型过滤字段
  const dbType = data.dbType || "mysql";
  let filteredData = { ...data };

  // 对于 SQLite，只显示相关字段
  if (dbType === "sqlite") {
    filteredData = {
      dbType: data.dbType,
      name: data.name,
      sqlitePath: data.database || data.sqlitePath,
    };
  } else {
    // 对于其他数据库，移除 SQLite 字段
    delete filteredData.sqlitePath;
  }

  dynamicForm = new DynamicForm({
    container: "#formContainer",
    fieldMapping: datasourceFieldMapping,
    formId: "datasource-form",
    onSubmit: handleDatasourceSave,
    onCancel: handleCancel,
  });

  dynamicForm.load(filteredData);

  // 监听数据库类型变化
  $(document).off("change", '[name="dbType"]').on("change", '[name="dbType"]', function () {
    const selectedType = $(this).val();
    const currentData = dynamicForm.getData();
    currentData.dbType = selectedType;
    initDatasourceForm(currentData);
  });

  // 添加测试连接按钮
  addTestButton();
}

/**
 * 初始化用户配置表单
 */
function initUserForm(data = {}) {
  $("#pageTitle").text("数据库用户配置");
  $("#pageSubtitle").text("管理数据库用户信息和权限设置");
  
  // 确保所有权限字段都存在
  const completeData = { ...data };
  privilegeFields.forEach(priv => {
    if (!(priv in completeData)) {
      completeData[priv] = "N";
    }
  });

  dynamicForm = new UserDynamicForm({
    container: "#formContainer",
    fieldMapping: userFieldMapping,
    formId: "user-form",
    onSubmit: handleUserSave,
    onCancel: handleCancel,
  });

  dynamicForm.load(completeData);

  // 监听 SSL 类型变化
  $(document).off("change", '[name="ssl_type"]').on("change", '[name="ssl_type"]', function () {
    const sslType = $(this).val();
    const $sslFields = $('[name="ssl_cipher"], [name="x509_issuer"], [name="x509_subject"]')
      .closest(".layui-form-item");
    
    if (sslType === "SPECIFIED" || sslType === "X509") {
      $sslFields.show();
    } else {
      $sslFields.hide();
    }
  });

  // 初始化时触发一次
  setTimeout(() => {
    $('[name="ssl_type"]').trigger("change");
  }, 100);
}

// ==================== 事件处理 ====================

/**
 * 添加测试连接按钮（仅用于数据库连接配置）
 */
function addTestButton() {
  const $buttonGroup = $(".button-group");
  if ($buttonGroup.find("#testBtn").length === 0) {
    $buttonGroup.prepend(`
      <button type="button" id="testBtn" class="layui-btn layui-btn-test">
        <i class="layui-icon layui-icon-link"></i> 测试连接
      </button>
    `);
    $("#testBtn").on("click", handleTest);
  }
}

/**
 * 处理数据库连接配置保存
 */
function handleDatasourceSave(data) {
  // 对于 SQLite，将 sqlitePath 映射到 database
  if (data.dbType === "sqlite") {
    data.database = data.sqlitePath;
    delete data.sqlitePath;
  }

  vscode.postMessage({
    command: "save",
    payload: data,
  });

  showStatus("正在保存连接配置...", "success");
}

/**
 * 处理用户配置保存
 */
function handleUserSave(data) {
  // 转换权限字段为 Y/N 格式
  privilegeFields.forEach(priv => {
    if (priv in data) {
      data[priv] = data[priv] ? "Y" : "N";
    }
  });

  // 转换账户状态字段
  if ("account_locked" in data) {
    data.account_locked = data.account_locked ? "Y" : "N";
  }
  if ("password_expired" in data) {
    data.password_expired = data.password_expired ? "Y" : "N";
  }

  vscode.postMessage({
    command: "save",
    payload: data,
  });

  showStatus("正在保存用户配置...", "success");
}

/**
 * 处理测试连接
 */
function handleTest() {
  const data = dynamicForm.getData();

  // 对于 SQLite，将 sqlitePath 映射到 database
  if (data.dbType === "sqlite") {
    data.database = data.sqlitePath;
    delete data.sqlitePath;
  }

  vscode.postMessage({
    command: "test",
    payload: data,
  });

  showStatus("正在测试连接...", "success");
}

/**
 * 处理取消
 */
function handleCancel() {
  vscode.postMessage({
    command: "cancel",
  });
}

/**
 * 显示状态消息
 */
function showStatus(message, type = "success") {
  if (dynamicForm) {
    dynamicForm.showStatus(message, type);
  }
}

// ==================== 消息监听 ====================

window.addEventListener("message", (event) => {
  const message = event.data;
  if (!message || !message.command) {
    return;
  }

  switch (message.command) {
    case "load": {
      currentConfigType = message.configType;
      
      if (currentConfigType === CONFIG_TYPES.DATASOURCE) {
        // 数据库连接配置
        if (message.data && message.data.rowData && message.data.rowData.length > 0) {
          const rowData = message.data.rowData[0];
          initDatasourceForm(rowData);
        } else {
          // 新建模式：加载默认数据
          const defaultData = {
            dbType: "mysql",
            name: "",
            host: "localhost",
            port: 3306,
            username: "root",
            password: "",
            database: "",
          };
          initDatasourceForm(defaultData);
        }
      } else if (currentConfigType === CONFIG_TYPES.USER) {
        // 用户配置
        if (message.data && message.data.rowData && message.data.rowData.length > 0) {
          const rowData = message.data.rowData[0];
          initUserForm(rowData);
          showStatus("用户数据加载成功", "success");
        } else {
          // 新建模式：加载默认数据
          const defaultData = {
            User: "",
            Host: "%",
            plugin: "caching_sha2_password",
            password: "",
            ssl_type: "",
            account_locked: "N",
            password_expired: "N",
            max_connections: 0,
            max_questions: 0,
            max_updates: 0,
            max_user_connections: 0,
          };
          // 所有权限默认为 N
          privilegeFields.forEach(priv => {
            defaultData[priv] = "N";
          });
          initUserForm(defaultData);
        }
      }
      break;
    }
    case "status": {
      const { success, message: msg } = message;
      showStatus(msg, success ? "success" : "error");
      break;
    }
  }
});

// ==================== 页面加载 ====================

document.addEventListener("DOMContentLoaded", () => {
  // 发送就绪消息
  vscode.postMessage({
    command: "ready",
  });
});

