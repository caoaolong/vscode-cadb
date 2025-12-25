/**
 * Edit 页面 - 数据库结构编辑视图
 * 用于对数据库、表、字段、索引等进行结构修改
 */

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
      fields: ["id"],
      unique: true,
    },
    {
      id: "index-unique-email",
      name: "unique_email",
      type: "unique",
      fields: ["email"],
      unique: true,
    },
  ],
};

// 当前编辑的项
let currentEditItem = null;
let currentEditType = null; // 'field' 或 'index'

// 页面初始化
layui.use(["element", "form", "layer"], function () {
  const element = layui.element;
  const form = layui.form;
  const layer = layui.layer;

  // 获取 VSCode API
  let vscode = null;
  if (window.vscode) {
    vscode = window.vscode;
  } else {
    vscode = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null;
  }

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

    const formHtml = `
      <form class="layui-form" lay-filter="field-form">
        <div class="layui-form-item">
          <label class="layui-form-label">字段名</label>
          <div class="layui-input-block">
            <input type="text" name="name" value="${
              field.name
            }" placeholder="字段名" 
                   class="layui-input" required lay-verify="required">
          </div>
        </div>

        <div class="layui-form-item">
          <label class="layui-form-label">数据类型</label>
          <div class="layui-input-block">
            <select name="type" lay-verify="required">
              <option value="varchar" ${
                field.type === "varchar" ? "selected" : ""
              }>VARCHAR</option>
              <option value="int" ${
                field.type === "int" ? "selected" : ""
              }>INT</option>
              <option value="bigint" ${
                field.type === "bigint" ? "selected" : ""
              }>BIGINT</option>
              <option value="text" ${
                field.type === "text" ? "selected" : ""
              }>TEXT</option>
              <option value="datetime" ${
                field.type === "datetime" ? "selected" : ""
              }>DATETIME</option>
              <option value="date" ${
                field.type === "date" ? "selected" : ""
              }>DATE</option>
              <option value="decimal" ${
                field.type === "decimal" ? "selected" : ""
              }>DECIMAL</option>
            </select>
          </div>
        </div>

        <div class="layui-form-item">
          <label class="layui-form-label">长度</label>
          <div class="layui-input-block">
            <input type="number" name="length" value="${field.length || ""}" 
                   placeholder="字段长度（可选）" class="layui-input">
            <div class="form-hint">部分类型需要指定长度，如 VARCHAR(255)</div>
          </div>
        </div>

        <div class="layui-form-item">
          <label class="layui-form-label">默认值</label>
          <div class="layui-input-block">
            <input type="text" name="defaultValue" value="${
              field.defaultValue
            }" 
                   placeholder="默认值（可选）" class="layui-input">
          </div>
        </div>

        <div class="layui-form-item">
          <label class="layui-form-label">允许为空</label>
          <div class="layui-input-block">
            <input type="checkbox" name="nullable" lay-skin="switch" 
                   lay-text="是|否" ${field.nullable ? "checked" : ""}>
          </div>
        </div>

        <div class="button-group">
          <button type="submit" class="layui-btn" lay-submit lay-filter="save-field">
            <i class="layui-icon layui-icon-ok"></i> 保存字段
          </button>
          <button type="button" class="layui-btn layui-btn-primary" id="btn-delete-field">
            <i class="layui-icon layui-icon-delete"></i> 删除字段
          </button>
        </div>
      </form>
    `;

    $(".form-container").html(formHtml);
    form.render();

    // 删除按钮事件
    $("#btn-delete-field").on("click", function () {
      layer.confirm(
        '确定要删除字段 "' + field.name + '" 吗？',
        {
          icon: 3,
          title: "确认删除",
        },
        function (index) {
          deleteField(field.id);
          layer.close(index);
        }
      );
    });
  }

  /**
   * 加载索引表单
   */
  function loadIndexForm(index) {
    currentEditItem = index;
    currentEditType = "index";

    const formHtml = `
      <form class="layui-form" lay-filter="index-form">
        <div class="layui-form-item">
          <label class="layui-form-label">索引名</label>
          <div class="layui-input-block">
            <input type="text" name="name" value="${
              index.name
            }" placeholder="索引名" 
                   class="layui-input" required lay-verify="required">
          </div>
        </div>

        <div class="layui-form-item">
          <label class="layui-form-label">索引类型</label>
          <div class="layui-input-block">
            <select name="type" lay-verify="required">
              <option value="primary" ${
                index.type === "primary" ? "selected" : ""
              }>主键索引</option>
              <option value="unique" ${
                index.type === "unique" ? "selected" : ""
              }>唯一索引</option>
              <option value="normal" ${
                index.type === "normal" ? "selected" : ""
              }>普通索引</option>
              <option value="fulltext" ${
                index.type === "fulltext" ? "selected" : ""
              }>全文索引</option>
            </select>
          </div>
        </div>

        <div class="layui-form-item">
          <label class="layui-form-label">涉及字段</label>
          <div class="layui-input-block">
            <input type="text" name="fields" value="${index.fields.join(", ")}" 
                   placeholder="字段名，多个用逗号分隔" class="layui-input" 
                   required lay-verify="required">
            <div class="form-hint">例如: id, name 或单个字段 email</div>
          </div>
        </div>

        <div class="layui-form-item">
          <label class="layui-form-label">唯一约束</label>
          <div class="layui-input-block">
            <input type="checkbox" name="unique" lay-skin="switch" 
                   lay-text="是|否" ${index.unique ? "checked" : ""}>
          </div>
        </div>

        <div class="button-group">
          <button type="submit" class="layui-btn" lay-submit lay-filter="save-index">
            <i class="layui-icon layui-icon-ok"></i> 保存索引
          </button>
          <button type="button" class="layui-btn layui-btn-primary" id="btn-delete-index">
            <i class="layui-icon layui-icon-delete"></i> 删除索引
          </button>
        </div>
      </form>
    `;

    $(".form-container").html(formHtml);
    form.render();

    // 删除按钮事件
    $("#btn-delete-index").on("click", function () {
      layer.confirm(
        '确定要删除索引 "' + index.name + '" 吗？',
        {
          icon: 3,
          title: "确认删除",
        },
        function (idx) {
          deleteIndex(index.id);
          layer.close(idx);
        }
      );
    });
  }

  /**
   * 删除字段
   */
  function deleteField(fieldId) {
    const idx = mockData.fields.findIndex((f) => f.id === fieldId);
    if (idx !== -1) {
      mockData.fields.splice(idx, 1);
      renderFieldList();
      layer.msg("字段已删除", { icon: 1, time: 1500 });

      // 通知 VSCode
      if (vscode) {
        vscode.postMessage({
          command: "deleteField",
          fieldId: fieldId,
        });
      }
    }
  }

  /**
   * 删除索引
   */
  function deleteIndex(indexId) {
    const idx = mockData.indexes.findIndex((i) => i.id === indexId);
    if (idx !== -1) {
      mockData.indexes.splice(idx, 1);
      renderIndexList();
      layer.msg("索引已删除", { icon: 1, time: 1500 });

      // 通知 VSCode
      if (vscode) {
        vscode.postMessage({
          command: "deleteIndex",
          indexId: indexId,
        });
      }
    }
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

  // 保存字段表单
  form.on("submit(save-field)", function (data) {
    console.log("保存字段:", data.field);

    // 更新字段数据
    if (currentEditItem) {
      Object.assign(currentEditItem, data.field);
      renderFieldList();
    }

    layer.msg("字段保存成功！", { icon: 1, time: 1500 });

    // 通知 VSCode
    if (vscode) {
      vscode.postMessage({
        command: "saveField",
        data: data.field,
      });
    }

    return false;
  });

  // 保存索引表单
  form.on("submit(save-index)", function (data) {
    console.log("保存索引:", data.field);

    // 处理字段列表
    const fieldsStr = data.field.fields || "";
    data.field.fields = fieldsStr
      .split(",")
      .map((f) => f.trim())
      .filter((f) => f);

    // 更新索引数据
    if (currentEditItem) {
      Object.assign(currentEditItem, data.field);
      renderIndexList();
    }

    layer.msg("索引保存成功！", { icon: 1, time: 1500 });

    // 通知 VSCode
    if (vscode) {
      vscode.postMessage({
        command: "saveIndex",
        data: data.field,
      });
    }

    return false;
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
      const icon = data.success ? 1 : 2;
      layer.msg(data.message || "操作完成", { icon: icon, time: 2000 });
    }
  });
});
