/**
 * Edit 页面 - 数据库结构编辑视图
 * 用于对数据库、表、字段、索引等进行结构修改
 * 使用动态表单工具类
 */

// VSCode API
const vscode = acquireVsCodeApi();

// 模拟数据
const mockData = {
  fields: [
    {
      id: "field-name",
      name: "name",
      type: "varchar",
      length: 255,
      defaultValue: "",
      nullable: false,
    },
    {
      id: "field-email",
      name: "email",
      type: "varchar",
      length: 255,
      defaultValue: "",
      nullable: false,
    },
    {
      id: "field-age",
      name: "age",
      type: "int",
      length: null,
      defaultValue: "0",
      nullable: true,
    },
  ],
  indexes: [
    {
      id: "index-primary",
      name: "PRIMARY",
      type: "primary",
      fields: "id",
      unique: true,
    },
    {
      id: "index-unique-email",
      name: "unique_email",
      type: "unique",
      fields: "email",
      unique: true,
    },
  ],
};

// 当前编辑的项
let currentEditItem = null;
let currentEditType = null; // 'field' 或 'index'
let dynamicForm = null;

// 字段表单映射配置
const fieldMapping = {
  name: {
    type: "text",
    label: "字段名",
    category: "base",
    required: true,
    placeholder: "字段名",
  },
  type: {
    type: "select",
    label: "数据类型",
    category: "base",
    required: true,
    options: [
      { value: "varchar", label: "VARCHAR" },
      { value: "int", label: "INT" },
      { value: "bigint", label: "BIGINT" },
      { value: "text", label: "TEXT" },
      { value: "datetime", label: "DATETIME" },
      { value: "date", label: "DATE" },
      { value: "decimal", label: "DECIMAL" },
    ],
  },
  length: {
    type: "number",
    label: "长度",
    category: "base",
    placeholder: "字段长度（可选）",
    hint: "部分类型需要指定长度，如 VARCHAR(255)",
  },
  defaultValue: {
    type: "text",
    label: "默认值",
    category: "base",
    placeholder: "默认值（可选）",
  },
  nullable: {
    type: "switch",
    label: "允许为空",
    category: "base",
    text: "是|否",
  },
};

// 索引表单映射配置
const indexMapping = {
  name: {
    type: "text",
    label: "索引名",
    category: "base",
    required: true,
    placeholder: "索引名",
  },
  type: {
    type: "select",
    label: "索引类型",
    category: "base",
    required: true,
    options: [
      { value: "primary", label: "主键索引" },
      { value: "unique", label: "唯一索引" },
      { value: "normal", label: "普通索引" },
      { value: "fulltext", label: "全文索引" },
    ],
  },
  fields: {
    type: "text",
    label: "涉及字段",
    category: "base",
    required: true,
    placeholder: "字段名，多个用逗号分隔",
    hint: "例如: id, name 或单个字段 email",
  },
  unique: {
    type: "switch",
    label: "唯一约束",
    category: "base",
    text: "是|否",
  },
};

// Layui 初始化
layui.use(["element", "form", "layer"], function () {
  const element = layui.element;
  const layer = layui.layer;

  /**
   * 渲染字段列表
   */
  function renderFieldList() {
    const $fieldList = $("#field-list");
    $fieldList.empty();

    mockData.fields.forEach((field) => {
      $fieldList.append(`
        <li class="menu-item" data-id="${field.id}" data-type="field">
          <i class="layui-icon layui-icon-cols"></i> ${field.name}
        </li>
      `);
    });

    // 默认选中第一个
    if (mockData.fields.length > 0) {
      $fieldList.find(".menu-item").first().addClass("active");
      loadFieldForm(mockData.fields[0]);
    }
  }

  /**
   * 渲染索引列表
   */
  function renderIndexList() {
    const $indexList = $("#index-list");
    $indexList.empty();

    mockData.indexes.forEach((index) => {
      $indexList.append(`
        <li class="menu-item" data-id="${index.id}" data-type="index">
          <i class="layui-icon layui-icon-template"></i> ${index.name}
        </li>
      `);
    });
  }

  /**
   * 加载字段表单
   */
  function loadFieldForm(field) {
    currentEditItem = field;
    currentEditType = "field";

    // 创建动态表单
    dynamicForm = new DynamicForm({
      container: "#formContainer",
      fieldMapping: fieldMapping,
      formId: "field-form",
      onSubmit: handleSaveField,
      onCancel: null, // 不需要取消按钮
    });

    dynamicForm.load(field);

    // 添加删除按钮
    addDeleteButton("删除字段", handleDeleteField);
  }

  /**
   * 加载索引表单
   */
  function loadIndexForm(index) {
    currentEditItem = index;
    currentEditType = "index";

    // 处理 fields 字段（数组转字符串）
    const indexData = { ...index };
    if (Array.isArray(indexData.fields)) {
      indexData.fields = indexData.fields.join(", ");
    }

    // 创建动态表单
    dynamicForm = new DynamicForm({
      container: "#formContainer",
      fieldMapping: indexMapping,
      formId: "index-form",
      onSubmit: handleSaveIndex,
      onCancel: null, // 不需要取消按钮
    });

    dynamicForm.load(indexData);

    // 添加删除按钮
    addDeleteButton("删除索引", handleDeleteIndex);
  }

  /**
   * 添加删除按钮
   */
  function addDeleteButton(text, handler) {
    const $buttonGroup = $("#formContainer .button-group");
    if ($buttonGroup.find("#deleteBtn").length === 0) {
      $buttonGroup.append(`
        <button type="button" id="deleteBtn" class="layui-btn layui-btn-danger">
          <i class="layui-icon layui-icon-delete"></i> ${text}
        </button>
      `);

      $("#deleteBtn").on("click", handler);
    }
  }

  /**
   * 处理保存字段
   */
  function handleSaveField(data) {
    if (currentEditItem) {
      Object.assign(currentEditItem, data);
      renderFieldList();
      dynamicForm.showStatus("字段保存成功！", "success");

      // 通知 VSCode
      vscode.postMessage({
        command: "saveField",
        data: data,
      });
    }
  }

  /**
   * 处理保存索引
   */
  function handleSaveIndex(data) {
    // 处理字段列表（字符串转数组）
    if (typeof data.fields === "string") {
      data.fields = data.fields
        .split(",")
        .map((f) => f.trim())
        .filter((f) => f);
    }

    if (currentEditItem) {
      Object.assign(currentEditItem, data);
      renderIndexList();
      dynamicForm.showStatus("索引保存成功！", "success");

      // 通知 VSCode
      vscode.postMessage({
        command: "saveIndex",
        data: data,
      });
    }
  }

  /**
   * 处理删除字段
   */
  function handleDeleteField() {
    if (!currentEditItem) return;

    layer.confirm('确定要删除字段 "' + currentEditItem.name + '" 吗？', {
      icon: 3,
      title: "确认删除",
    }, function (index) {
      const idx = mockData.fields.findIndex((f) => f.id === currentEditItem.id);
      if (idx !== -1) {
        mockData.fields.splice(idx, 1);
        renderFieldList();
        layer.msg("字段已删除", { icon: 1, time: 1500 });

        // 通知 VSCode
        vscode.postMessage({
          command: "deleteField",
          fieldId: currentEditItem.id,
        });
      }
      layer.close(index);
    });
  }

  /**
   * 处理删除索引
   */
  function handleDeleteIndex() {
    if (!currentEditItem) return;

    layer.confirm('确定要删除索引 "' + currentEditItem.name + '" 吗？', {
      icon: 3,
      title: "确认删除",
    }, function (index) {
      const idx = mockData.indexes.findIndex((i) => i.id === currentEditItem.id);
      if (idx !== -1) {
        mockData.indexes.splice(idx, 1);
        renderIndexList();
        layer.msg("索引已删除", { icon: 1, time: 1500 });

        // 通知 VSCode
        vscode.postMessage({
          command: "deleteIndex",
          indexId: currentEditItem.id,
        });
      }
      layer.close(index);
    });
  }

  // 初始化列表
  renderFieldList();
  renderIndexList();

  // 菜单项点击事件（事件委托）
  $(document).on("click", ".menu-item", function () {
    const $this = $(this);
    const type = $this.data("type");
    const id = $this.data("id");

    // 更新选中状态
    $this.siblings().removeClass("active");
    $this.addClass("active");

    // 加载对应表单
    if (type === "field") {
      const field = mockData.fields.find((f) => f.id === id);
      if (field) {
        loadFieldForm(field);
      }
    } else if (type === "index") {
      const index = mockData.indexes.find((i) => i.id === id);
      if (index) {
        loadIndexForm(index);
      }
    }
  });

  // 监听 Tab 切换事件
  element.on("tab(edit-tabs)", function (data) {
    if (data.index === 0) {
      // 切换到字段标签
      if (mockData.fields.length > 0) {
        setTimeout(() => {
          $("#field-list .menu-item").first().trigger("click");
        }, 100);
      }
    } else if (data.index === 1) {
      // 切换到索引标签
      if (mockData.indexes.length > 0) {
        setTimeout(() => {
          $("#index-list .menu-item").first().trigger("click");
        }, 100);
      }
    }
  });

  // 监听来自 VSCode 的消息
  window.addEventListener("message", (event) => {
    const { command, data } = event.data;

    if (command === "loadData") {
      // 加载数据
      if (data.fields) {
        mockData.fields = data.fields;
      }
      if (data.indexes) {
        mockData.indexes = data.indexes;
      }

      renderFieldList();
      renderIndexList();
    } else if (command === "status") {
      if (dynamicForm) {
        dynamicForm.showStatus(
          data.message || "操作完成",
          data.success ? "success" : "error"
        );
      } else {
        layer.msg(data.message || "操作完成", {
          icon: data.success ? 1 : 2,
          time: 2000,
        });
      }
    }
  });
});
