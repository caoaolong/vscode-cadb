# 动态表单工具类使用说明

## 概述

`form.js` 是一个通用的动态表单工具类，用于根据数据和配置映射自动生成表单。

## 当前使用情况

### 统一配置页面
- **settings.html** - 统一的配置管理页面
  - 数据库连接配置（datasource）
  - 用户管理配置（user）
  - 根据 `configType` 参数动态切换表单类型

### 编辑页面
- **edit.html** - 表结构编辑（右侧表单使用动态表单）

## 核心特性

### 1. 自动表单生成
根据加载的数据（`message.data.rowData[0]`）自动创建表单字段。

### 2. 字段映射配置
通过映射表灵活配置每个字段的显示方式：

```javascript
const fieldMapping = {
  "fieldName": {
    type: "text|number|password|select|checkbox|switch|textarea",
    label: "显示标签",
    category: "base|advance",  // base=基础字段，advance=高级字段
    placeholder: "提示文本",
    required: true|false,
    options: [],  // 用于 select 类型
    hint: "字段说明",
    min: 0,       // 用于 number 类型
    max: 100,     // 用于 number 类型
    rows: 3,      // 用于 textarea 类型
    text: "是|否" // 用于 switch 类型
  }
}
```

### 3. 自动分类与折叠
- **base 分类**: 显示为普通字段，默认展开
- **advance 分类**: 显示在折叠面板中，默认收起

### 4. 响应式布局
- 字段数量 < 4: 单列布局
- 字段数量 ≥ 4: 两列网格布局（自适应）

### 5. VSCode 主题适配
所有样式使用 VSCode 主题变量，自动适配明暗主题。

## 使用方法

### 基本用法

```javascript
// 1. 定义字段映射
const fieldMapping = {
  username: {
    type: "text",
    label: "用户名",
    category: "base",
    required: true,
  },
  password: {
    type: "password",
    label: "密码",
    category: "base",
  },
  maxConnections: {
    type: "number",
    label: "最大连接数",
    category: "advance",
    min: 0,
  }
};

// 2. 创建表单实例
const dynamicForm = new DynamicForm({
  container: "#formContainer",
  fieldMapping: fieldMapping,
  formId: "my-form",
  onSubmit: (data) => {
    console.log("表单数据：", data);
  },
  onCancel: () => {
    console.log("取消");
  }
});

// 3. 加载数据
dynamicForm.load({
  username: "admin",
  password: "",
  maxConnections: 100
});

// 4. 获取表单数据
const formData = dynamicForm.getData();

// 5. 验证表单
const isValid = dynamicForm.validate();

// 6. 显示状态消息
dynamicForm.showStatus("保存成功", "success");
```

### 扩展用法

对于特殊需求，可以继承 `DynamicForm` 类：

```javascript
class UserDynamicForm extends DynamicForm {
  generateFieldsHtml(fields) {
    // 自定义字段布局（如权限字段网格布局）
    return super.generateFieldsHtml(fields);
  }
}
```

## 支持的字段类型

| 类型 | 说明 | 配置参数 |
|------|------|----------|
| text | 文本输入框 | placeholder, required |
| number | 数字输入框 | placeholder, required, min, max |
| password | 密码输入框 | placeholder, required |
| select | 下拉选择框 | options, required |
| checkbox | 复选框 | title |
| switch | 开关 | text (如 "是\|否") |
| textarea | 多行文本框 | placeholder, required, rows |

## 默认行为

如果映射表中没有配置某个字段：
- **label**: 字段名首字母大写
- **type**: text
- **category**: base

## 文件结构

```
resources/panels/
├── common/
│   ├── form.js          # 动态表单核心类
│   ├── form.css         # 通用表单样式
│   ├── table.js         # 表格工具类
│   ├── table.css        # 表格样式
│   └── README.md        # 本文档
├── settings/
│   ├── settings.html    # 统一配置页面
│   ├── settings.js      # 配置页面逻辑（使用 DynamicForm）
│   └── settings.css     # 配置页面特殊样式
├── edit/
│   ├── edit.html        # 表结构编辑页面
│   ├── edit.js          # 编辑页面逻辑（使用 DynamicForm）
│   └── edit.css         # 编辑页面布局样式
└── ...
```

## 统一配置页面（settings.html）

`settings.html` 是一个多用途的配置页面，通过 `configType` 参数动态加载不同类型的表单：

### 配置类型

1. **datasource** - 数据库连接配置
   - 支持 MySQL, PostgreSQL, SQLite, SQL Server
   - 根据数据库类型动态显示/隐藏字段
   - 提供测试连接功能

2. **user** - 数据库用户管理
   - 用户名、主机、密码、认证插件
   - 30+ 权限字段（使用网格布局）
   - SSL 配置、连接限制、账户状态

### 使用示例

在 VSCode 扩展中调用：

```typescript
// 发送消息加载配置
panel.webview.postMessage({
  command: "load",
  configType: "datasource",  // 或 "user"
  data: {
    rowData: [configData]
  }
});
```

## 样式定制

所有样式都定义在 `form.css` 中，使用 CSS 变量适配 VSCode 主题。如需定制，可以在页面的独立 CSS 文件中覆盖。

## 注意事项

1. **数据格式**: `load()` 方法接收的数据应为简单对象（键值对）
2. **Buffer 处理**: 自动处理 MySQL 的 Buffer 类型字段（如 SSL 配置）
3. **布尔转换**: checkbox 和 switch 类型自动处理 Y/N 与 boolean 的转换
4. **表单验证**: 目前仅支持 `required` 验证，可根据需要扩展
5. **Layui 依赖**: 需要在页面中引入 Layui 框架

## 示例页面

参考以下页面的实现：
- `settings/settings.js` - 多类型配置切换，数据库类型动态切换，权限字段布局
- `edit/edit.js` - 多表单切换，添加自定义按钮

## 架构优势

### 统一配置页面的优势
1. **代码复用**: 所有配置类型共享同一套 HTML/CSS
2. **易于维护**: 新增配置类型只需添加字段映射
3. **一致性**: 统一的用户体验和交互模式
4. **性能优化**: 减少页面文件数量，降低加载开销
5. **灵活扩展**: 轻松添加新的配置类型
