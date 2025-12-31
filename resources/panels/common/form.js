/**
 * 动态表单工具类
 * 用于根据数据和配置映射自动生成表单
 */
class DynamicForm {
  /**
   * @param {Object} options 配置选项
   * @param {string} options.container 表单容器选择器
   * @param {Object} options.fieldMapping 字段映射配置
   * @param {string} options.formId 表单ID
   * @param {Function} options.onSubmit 提交回调
   * @param {Function} options.onCancel 取消回调
   */
  constructor(options) {
    this.container = $(options.container);
    this.fieldMapping = options.fieldMapping || {};
    this.formId = options.formId || "dynamic-form";
    this.onSubmit = options.onSubmit;
    this.onCancel = options.onCancel;
    this.form = null;
    this.layer = null;
    this.element = null;
    this.currentData = null;

    this.ready = new Promise((resolve) => {
      // 初始化 Layui
      layui.use(["form", "layer", "element", "laydate"], () => {
        this.form = layui.form;
        this.layer = layui.layer;
        this.element = layui.element;
        this.laydate = layui.laydate;
        resolve();
      });
    });
    this.laydateInstances = {}; // 存储 laydate 实例
  }

  /**
   * 根据数据加载并生成表单
   * @param {Object} data 表单数据
   */
  async load(data) {
    await this.ready;

    this.currentData = data || {};
    const fields = Object.keys(this.currentData);

    // 分类字段
    const baseFields = [];
    const advanceFields = [];

    fields.forEach((fieldName) => {
      const config = this.getFieldConfig(fieldName);
      if (config.type === "hidden") {
        return;
      }
      if (config.category === "advance") {
        advanceFields.push({ name: fieldName, config });
      } else {
        baseFields.push({ name: fieldName, config });
      }
    });

    // 生成表单HTML
    const formHtml = this.generateFormHtml(baseFields, advanceFields);
    this.container.html(formHtml);

    // 填充数据
    this.fillFormData(this.currentData);

    // 初始化日期和时间选择器
    this.initDateFields();

    // 重新渲染表单
    this.form.render("checkbox");
    this.form.render("switch");

    // 初始化字段显示状态
    this.updateAllFieldsVisibility();

    // 绑定事件
    this.bindEvents();
  }

  /**
   * 获取字段配置
   * @param {string} fieldName 字段名
   * @returns {Object} 字段配置
   */
  getFieldConfig(fieldName) {
    const defaultConfig = {
      type: "text",
      label: this.formatLabel(fieldName),
      category: "base",
      placeholder: "",
      required: false,
    };

    return { ...defaultConfig, ...this.fieldMapping[fieldName] };
  }

  /**
   * 格式化字段名为标签
   * @param {string} fieldName 字段名
   * @returns {string} 格式化后的标签
   */
  formatLabel(fieldName) {
    return fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
  }

  /**
   * 生成表单HTML
   * @param {Array} baseFields 基础字段
   * @param {Array} advanceFields 高级字段
   * @returns {string} 表单HTML
   */
  generateFormHtml(baseFields, advanceFields) {
    let html = `<form class="layui-form" lay-filter="${this.formId}">`;

    // 基础字段
    if (baseFields.length > 0) {
      html += '<div class="section-title">基础设置</div>';
      html += this.generateFieldsHtml(baseFields);
    }

    // 高级字段（折叠面板）- 只有当存在高级字段时才显示
    if (advanceFields && advanceFields.length > 0) {
      html += '<div class="form-divider"></div>';
      html += '<div class="layui-collapse" lay-accordion="">';
      html += '<div class="layui-colla-item">';
      html += '<h2 class="layui-colla-title">高级设置</h2>';
      html += '<div class="layui-colla-content">';
      html += this.generateFieldsHtml(advanceFields);
      html += "</div>";
      html += "</div>";
      html += "</div>";
    }

    // 按钮组
    html += '<div class="form-divider"></div>';
    html += '<div class="button-group">';
    html += '<button type="button" class="layui-btn" id="submitBtn">';
    html += '<i class="layui-icon layui-icon-ok"></i> 保存';
    html += "</button>";
    html +=
      '<button type="button" class="layui-btn layui-btn-primary" id="cancelBtn">';
    html += '<i class="layui-icon layui-icon-close"></i> 取消';
    html += "</button>";
    html += "</div>";

    // 状态消息
    html += '<div id="status" class="status-message"></div>';

    html += "</form>";

    return html;
  }

  /**
   * 生成字段HTML
   * @param {Array} fields 字段数组
   * @returns {string} 字段HTML
   */
  generateFieldsHtml(fields) {
    let html = "";

    // 分离带 hint 的字段和普通字段
    const fieldsWithHint = [];
    const normalFields = [];

    fields.forEach((field) => {
      if (field.config.hint) {
        fieldsWithHint.push(field);
      } else {
        normalFields.push(field);
      }
    });

    // 普通字段使用网格布局（如果数量 >= 4）
    if (normalFields.length >= 4) {
      html += '<div class="field-group">';
      normalFields.forEach((field) => {
        html += this.generateFieldHtml(field.name, field.config);
      });
      html += "</div>";
    } else {
      normalFields.forEach((field) => {
        html += this.generateFieldHtml(field.name, field.config);
      });
    }

    // 带 hint 的字段单独显示（不使用网格）
    fieldsWithHint.forEach((field) => {
      html += this.generateFieldHtml(field.name, field.config);
    });

    return html;
  }

  /**
   * 生成单个字段HTML
   * @param {string} fieldName 字段名
   * @param {Object} config 字段配置
   * @returns {string} 字段HTML
   */
  generateFieldHtml(fieldName, config) {
    // 处理条件显示和隐藏
    const showExpression = config.show || "";
    const hiddenExpression = config.hidden || "";
    const showAttr = showExpression ? `data-show="${showExpression.replace(/"/g, '&quot;')}"` : "";
    const hiddenAttr = hiddenExpression ? `data-hidden="${hiddenExpression.replace(/"/g, '&quot;')}"` : "";
    const fieldAttr = `data-field-name="${fieldName}"`;
    
    let html = `<div class="layui-form-item" ${fieldAttr} ${showAttr} ${hiddenAttr}>`;

    switch (config.type) {
      case "select":
        html += this.generateSelectField(fieldName, config);
        break;
      case "checkbox":
        html += this.generateCheckboxField(fieldName, config);
        break;
      case "switch":
        html += this.generateSwitchField(fieldName, config);
        break;
      case "textarea":
        html += this.generateTextareaField(fieldName, config);
        break;
      case "date":
        html += this.generateDateField(fieldName, config);
        break;
      case "time":
        html += this.generateTimeField(fieldName, config);
        break;
      case "datetime":
        html += this.generateDateTimeField(fieldName, config);
        break;
      case "number":
        html += this.generateNumberField(fieldName, config);
        break;
      case "password":
        html += this.generatePasswordField(fieldName, config);
        break;
      case "text":
      default:
        html += this.generateInputField(fieldName, config);
        break;
    }

    html += "</div>";

    // 添加提示信息
    if (config.hint) {
      html += `<div class="form-hint">${config.hint}</div>`;
    }

    return html;
  }

  /**
   * 生成输入框字段
   */
  generateInputField(fieldName, config) {
    const required = config.required ? 'lay-verify="required"' : "";
    const placeholder = config.placeholder || "";
    const type = config.type || "text";
    const min = config.min !== undefined ? `min="${config.min}"` : "";
    const max = config.max !== undefined ? `max="${config.max}"` : "";

    return `
      <label class="layui-form-label">${config.label}</label>
      <div class="layui-input-block">
        <input
          type="${type}"
          name="${fieldName}"
          placeholder="${placeholder}"
          ${required}
          ${min}
          ${max}
          class="layui-input"
        />
      </div>
    `;
  }

  /**
   * 生成数字输入框字段（使用 lay-affix="number"）
   */
  generateNumberField(fieldName, config) {
    const required = config.required ? 'lay-verify="required"' : "";
    const placeholder = config.placeholder || "";
    const step = config.step !== undefined ? `step="${config.step}"` : "";
    const min = config.min !== undefined ? `min="${config.min}"` : "";
    const max = config.max !== undefined ? `max="${config.max}"` : "";
    const precision = config.precision !== undefined ? `lay-precision="${config.precision}"` : "";
    const stepStrictly = config.stepStrictly ? `lay-step-strictly` : "";
    const wheel = config.wheel !== undefined ? `lay-wheel="${config.wheel}"` : "";
    const value = config.value !== undefined ? `value="${config.value}"` : "";

    return `
      <label class="layui-form-label">${config.label}</label>
      <div class="layui-input-block">
        <input
          type="text"
          name="${fieldName}"
          placeholder="${placeholder}"
          ${required}
          ${step}
          ${min}
          ${max}
          ${precision}
          ${stepStrictly}
          ${wheel}
          ${value}
          lay-affix="number"
          class="layui-input"
        />
      </div>
    `;
  }

  /**
   * 生成密码输入框字段（使用 lay-affix="eye" 实现密码显隐）
   */
  generatePasswordField(fieldName, config) {
    const required = config.required ? 'lay-verify="required"' : "";
    const placeholder = config.placeholder || "";

    return `
      <label class="layui-form-label">${config.label}</label>
      <div class="layui-input-block">
        <div class="layui-input-wrap">
          <input
            type="password"
            name="${fieldName}"
            placeholder="${placeholder}"
            ${required}
            lay-affix="eye"
            class="layui-input"
          />
        </div>
      </div>
    `;
  }

  /**
   * 生成下拉框字段
   */
  generateSelectField(fieldName, config) {
    const required = config.required ? "required" : "";
    const options = Array.isArray(config.options) ? config.options : [];

    return `
    <label class="layui-form-label">${config.label}</label>
    <div class="layui-input-block">
      <select
        name="${fieldName}"
        class="native-select layui-input"
        ${required}
      >
        <option value="">请选择</option>
        ${options
          .map((option) => {
            const value = typeof option === "object" ? option.value : option;
            const label = typeof option === "object" ? option.label : option;
            return `<option value="${value}">${label}</option>`;
          })
          .join("")}
      </select>
    </div>
  `;
  }

  /**
   * 生成复选框字段
   */
  generateCheckboxField(fieldName, config) {
    const title = config.title || config.label;
    return `
      <label class="layui-form-label">${config.label}</label>
      <div class="layui-input-block">
        <input
          type="checkbox"
          name="${fieldName}"
          lay-skin="primary"
          title="${title}"
        />
      </div>
    `;
  }

  /**
   * 生成开关字段
   */
  generateSwitchField(fieldName, config) {
    const text = config.text || "是|否";
    return `
      <label class="layui-form-label">${config.label}</label>
      <div class="layui-input-block">
        <input
          type="checkbox"
          name="${fieldName}"
          lay-skin="switch"
          lay-text="${text}"
        />
      </div>
    `;
  }

  /**
   * 生成文本域字段
   */
  generateTextareaField(fieldName, config) {
    const required = config.required ? 'lay-verify="required"' : "";
    const placeholder = config.placeholder || "";
    const rows = config.rows || 3;

    return `
      <label class="layui-form-label">${config.label}</label>
      <div class="layui-input-block">
        <textarea
          name="${fieldName}"
          placeholder="${placeholder}"
          ${required}
          rows="${rows}"
          class="layui-textarea"
        ></textarea>
      </div>
    `;
  }

  /**
   * 生成日期选择字段
   */
  generateDateField(fieldName, config) {
    const required = config.required ? 'lay-verify="required"' : "";
    const placeholder = config.placeholder || "yyyy-MM-dd";
    const format = config.format || "yyyy-MM-dd";
    const fieldId = `${this.formId}-${fieldName}`;

    return `
      <label class="layui-form-label">${config.label}</label>
      <div class="layui-input-block">
        <input
          type="text"
          name="${fieldName}"
          id="${fieldId}"
          placeholder="${placeholder}"
          ${required}
          class="layui-input"
          autocomplete="off"
        />
      </div>
    `;
  }

  /**
   * 生成时间选择字段
   */
  generateTimeField(fieldName, config) {
    const required = config.required ? 'lay-verify="required"' : "";
    const placeholder = config.placeholder || "HH:mm:ss";
    const format = config.format || "HH:mm:ss";
    const fieldId = `${this.formId}-${fieldName}`;

    return `
      <label class="layui-form-label">${config.label}</label>
      <div class="layui-input-block">
        <input
          type="text"
          name="${fieldName}"
          id="${fieldId}"
          placeholder="${placeholder}"
          ${required}
          class="layui-input"
          autocomplete="off"
        />
      </div>
    `;
  }

  /**
   * 生成日期时间选择字段
   */
  generateDateTimeField(fieldName, config) {
    const required = config.required ? 'lay-verify="required"' : "";
    const placeholder = config.placeholder || "yyyy-MM-dd HH:mm:ss";
    const format = config.format || "yyyy-MM-dd HH:mm:ss";
    const fieldId = `${this.formId}-${fieldName}`;

    return `
      <label class="layui-form-label">${config.label}</label>
      <div class="layui-input-block">
        <input
          type="text"
          name="${fieldName}"
          id="${fieldId}"
          placeholder="${placeholder}"
          ${required}
          class="layui-input"
          autocomplete="off"
        />
      </div>
    `;
  }

  /**
   * 初始化日期和时间选择器
   */
  initDateFields() {
    if (!this.laydate) {
      return;
    }

    const dateFields = [];
    const timeFields = [];
    const datetimeFields = [];

    // 收集所有日期、时间和日期时间字段
    Object.keys(this.currentData).forEach((fieldName) => {
      const config = this.getFieldConfig(fieldName);
      if (config.type === "date") {
        dateFields.push({ fieldName, config });
      } else if (config.type === "time") {
        timeFields.push({ fieldName, config });
      } else if (config.type === "datetime") {
        datetimeFields.push({ fieldName, config });
      }
    });

    // 初始化日期选择器
    dateFields.forEach(({ fieldName, config }) => {
      const fieldId = `#${this.formId}-${fieldName}`;
      const $field = this.container.find(fieldId);
      
      if ($field.length) {
        const format = config.format || "yyyy-MM-dd";
        const range = config.range || false;
        const min = config.min || "";
        const max = config.max || "";
        const instanceId = `${this.formId}-${fieldName}`;

        const laydateConfig = {
          elem: fieldId,
          id: instanceId,
          type: "date",
          format: format,
          range: range,
        };

        if (min) {
          laydateConfig.min = min;
        }
        if (max) {
          laydateConfig.max = max;
        }

        // 如果之前有实例，先销毁
        if (this.laydateInstances[fieldName]) {
          try {
            this.laydate.close(instanceId);
          } catch (e) {
            // 忽略错误
          }
        }

        // 创建新实例
        this.laydateInstances[fieldName] = this.laydate.render(laydateConfig);
      }
    });

    // 初始化时间选择器
    timeFields.forEach(({ fieldName, config }) => {
      const fieldId = `#${this.formId}-${fieldName}`;
      const $field = this.container.find(fieldId);
      
      if ($field.length) {
        const format = config.format || "HH:mm:ss";
        const range = config.range || false;
        const instanceId = `${this.formId}-${fieldName}`;

        const laydateConfig = {
          elem: fieldId,
          id: instanceId,
          type: "time",
          format: format,
          range: range,
        };

        // 如果之前有实例，先销毁
        if (this.laydateInstances[fieldName]) {
          try {
            this.laydate.close(instanceId);
          } catch (e) {
            // 忽略错误
          }
        }

        // 创建新实例
        this.laydateInstances[fieldName] = this.laydate.render(laydateConfig);
      }
    });

    // 初始化日期时间选择器
    datetimeFields.forEach(({ fieldName, config }) => {
      const fieldId = `#${this.formId}-${fieldName}`;
      const $field = this.container.find(fieldId);
      
      if ($field.length) {
        const format = config.format || "yyyy-MM-dd HH:mm:ss";
        const range = config.range || false;
        const min = config.min || "";
        const max = config.max || "";
        const fullPanel = config.fullPanel || false; // 是否显示全面板（日期和时间同时显示）
        const instanceId = `${this.formId}-${fieldName}`;

        const laydateConfig = {
          elem: fieldId,
          id: instanceId,
          type: "datetime",
          format: format,
          range: range,
        };

        if (min) {
          laydateConfig.min = min;
        }
        if (max) {
          laydateConfig.max = max;
        }
        if (fullPanel) {
          laydateConfig.fullPanel = true; // 2.8+ 支持全面板显示
        }

        // 如果之前有实例，先销毁
        if (this.laydateInstances[fieldName]) {
          try {
            this.laydate.close(instanceId);
          } catch (e) {
            // 忽略错误
          }
        }

        // 创建新实例
        this.laydateInstances[fieldName] = this.laydate.render(laydateConfig);
      }
    });
  }

  /**
   * 填充表单数据
   * @param {Object} data 表单数据
   */
  fillFormData(data) {
    Object.keys(data).forEach((fieldName) => {
      const config = this.getFieldConfig(fieldName);
      const value = data[fieldName];
      const $field = $(`[name="${fieldName}"]`);

      if (!$field.length) {
        return;
      }

      switch (config.type) {
        case "checkbox":
        case "switch":
          // 处理 Y/N 或 boolean 值
          const checked =
            value === "Y" || value === true || value === 1 || value === "1";
          $field.prop("checked", checked);
          break;
        case "select":
          $field.val(value);
          break;
        case "date":
        case "time":
        case "datetime":
          // 日期、时间和日期时间字段直接设置值
          $field.val(value || "");
          break;
        case "number":
          // 数字字段，确保值为数字或空字符串
          $field.val(value !== null && value !== undefined ? value : "");
          break;
        case "password":
          // 密码字段直接设置值
          $field.val(value || "");
          break;
        default:
          // 处理 Buffer 类型（如 SSL 字段）
          if (value && value.type === "Buffer" && value.data) {
            const decodedValue = new TextDecoder().decode(
              new Uint8Array(value.data)
            );
            $field.val(decodedValue);
          } else {
            $field.val(value || "");
          }
          break;
      }
    });

    // 重新渲染表单
    if (this.form) {
      this.form.render("checkbox");
      this.form.render("switch");
    }
    
    // 更新字段显示状态
    this.updateAllFieldsVisibility();
  }

  /**
   * 获取表单数据
   * @returns {Object} 表单数据
   */
  getData() {
    const formData = {};
    const $form = this.container.find("form");

    $form.find("[name]").each((index, element) => {
      const $element = $(element);
      const fieldName = $element.attr("name");
      const config = this.getFieldConfig(fieldName);

      switch (config.type) {
        case "checkbox":
        case "switch":
          formData[fieldName] = $element.prop("checked");
          break;
        case "number":
          const numValue = $element.val();
          // 支持整数和小数
          if (numValue && numValue.trim() !== "") {
            const parsed = parseFloat(numValue);
            formData[fieldName] = isNaN(parsed) ? 0 : parsed;
          } else {
            formData[fieldName] = 0;
          }
          break;
        case "password":
          formData[fieldName] = $element.val();
          break;
        default:
          formData[fieldName] = $element.val();
          break;
      }
    });

    return formData;
  }

  /**
   * 验证表单
   * @returns {boolean} 是否验证通过
   */
  validate() {
    let isValid = true;
    const $form = this.container.find("form");

    $form.find("[lay-verify]").each((index, element) => {
      const $element = $(element);
      const value = $element.val();
      const verify = $element.attr("lay-verify");

      if (verify.includes("required") && !value) {
        isValid = false;
        const label = $element
          .closest(".layui-form-item")
          .find(".layui-form-label")
          .text();
        this.showStatus(`${label} 不能为空`, "error");
        return false; // 跳出循环
      }
    });

    return isValid;
  }

  /**
   * 显示状态消息
   * @param {string} message 消息内容
   * @param {string} type 消息类型 success/error
   */
  showStatus(message, type = "success") {
    const $status = this.container.find("#status");
    $status
      .removeClass("status-success status-error")
      .addClass(`status-${type}`)
      .text(message)
      .fadeIn();

    setTimeout(() => {
      $status.fadeOut();
    }, 3000);
  }

  /**
   * 评估显示表达式
   * @param {string} expression 表达式，如 "dbType == 'redis'" 或 "dbType.value == 'redis'"
   * @param {Object} formData 表单数据
   * @returns {boolean} 是否显示
   */
  evaluateShowExpression(expression, formData) {
    if (!expression || !expression.trim()) {
      return true; // 没有表达式，默认显示
    }

    try {
      let evalExpression = expression.trim();
      
      // 先处理带 .value 的引用（如 dbType.value）
      const fieldValuePattern = /(\w+)\.value\b/g;
      evalExpression = evalExpression.replace(fieldValuePattern, (match, fieldName) => {
        if (formData.hasOwnProperty(fieldName)) {
          const value = formData[fieldName];
          return this.formatValueForExpression(value);
        }
        return 'null';
      });
      
      // 再处理直接字段引用（如 dbType）
      // 先找出所有可能的字段名
      const fieldNames = Object.keys(formData);
      const keywords = ['true', 'false', 'null', 'undefined', 'return', 'if', 'else', 'and', 'or', 'not'];
      
      // 按长度降序排序，先匹配长的字段名
      fieldNames.sort((a, b) => b.length - a.length);
      
      fieldNames.forEach(fieldName => {
        if (keywords.includes(fieldName)) {
          return; // 跳过关键字
        }
        
        // 使用单词边界匹配字段名，避免部分匹配
        const fieldPattern = new RegExp('\\b' + fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g');
        evalExpression = evalExpression.replace(fieldPattern, (match, offset, string) => {
          // 检查是否在字符串字面量中
          const before = string.substring(0, offset);
          const quoteCount = (before.match(/"/g) || []).length;
          const singleQuoteCount = (before.match(/'/g) || []).length;
          
          // 如果引号数量是奇数，说明在字符串中
          if (quoteCount % 2 === 1 || singleQuoteCount % 2 === 1) {
            return match;
          }
          
          // 检查前面是否有 .value（已经处理过）
          if (offset > 0 && string.substring(offset - 6, offset) === '.value') {
            return match;
          }
          
          // 替换为实际值
          const value = formData[fieldName];
          return this.formatValueForExpression(value);
        });
      });

      // 使用 Function 构造函数安全地评估表达式
      const result = new Function('return ' + evalExpression)();
      return Boolean(result);
    } catch (error) {
      console.error('评估显示表达式失败:', expression, error);
      return true; // 出错时默认显示
    }
  }

  /**
   * 格式化值为表达式可用的格式
   * @param {any} value 值
   * @returns {string} 格式化后的值
   */
  formatValueForExpression(value) {
    if (value === null || value === undefined) {
      return 'null';
    } else if (typeof value === 'string') {
      return `"${value.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
    } else if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    } else if (typeof value === 'number') {
      return value.toString();
    } else {
      return `"${String(value).replace(/"/g, '\\"')}"`;
    }
  }

  /**
   * 更新所有字段的显示状态
   */
  updateAllFieldsVisibility() {
    const formData = this.getData();
    const $form = this.container.find("form");
    
    $form.find("[data-field-name]").each((index, element) => {
      const $item = $(element);
      const fieldName = $item.attr("data-field-name");
      const showExpression = $item.attr("data-show");
      const hiddenExpression = $item.attr("data-hidden");
      
      let shouldShow = true; // 默认显示
      
      // 优先检查 hidden 表达式（优先级更高）
      if (hiddenExpression) {
        const isHidden = this.evaluateShowExpression(hiddenExpression, formData);
        if (isHidden) {
          shouldShow = false;
        }
      }
      
      // 如果 hidden 表达式没有隐藏，再检查 show 表达式
      if (shouldShow && showExpression) {
        shouldShow = this.evaluateShowExpression(showExpression, formData);
      }
      
      // 更新显示状态
      if (shouldShow) {
        $item.show();
      } else {
        $item.hide();
      }
    });
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    const self = this;

    // 提交按钮
    this.container
      .find("#submitBtn")
      .off("click")
      .on("click", function () {
        if (self.validate()) {
          const data = self.getData();
          if (self.onSubmit) {
            self.onSubmit(data);
          }
        }
      });

    // 取消按钮
    this.container
      .find("#cancelBtn")
      .off("click")
      .on("click", function () {
        if (self.onCancel) {
          self.onCancel();
        }
      });

    // 监听所有字段变化，更新条件显示
    const $form = this.container.find("form");
    
    // 移除旧的事件监听器，避免重复绑定
    $form.off("input change", "input, select, textarea");
    
    // 监听输入框、选择框、文本域变化
    $form.on("input change", "input, select, textarea", function () {
      // 使用 setTimeout 确保值已更新
      setTimeout(() => {
        self.updateAllFieldsVisibility();
      }, 0);
    });

    // 监听复选框和开关变化（使用 layui 的表单事件）
    if (this.form) {
      // 移除旧的事件监听器
      this.form.off("checkbox switch");
      
      // 监听复选框和开关变化
      this.form.on("checkbox", function(data) {
        setTimeout(() => {
          self.updateAllFieldsVisibility();
        }, 0);
      });
      
      this.form.on("switch", function(data) {
        setTimeout(() => {
          self.updateAllFieldsVisibility();
        }, 0);
      });
    }
  }

  /**
   * 重置表单
   */
  reset() {
    const $form = this.container.find("form");
    $form[0].reset();
    if (this.form) {
      this.form.render("checkbox");
      this.form.render("switch");
    }
  }

  /**
   * 销毁表单
   */
  destroy() {
    // 销毁所有 laydate 实例
    if (this.laydate && this.laydateInstances) {
      Object.keys(this.laydateInstances).forEach((fieldName) => {
        try {
          const instanceId = `${this.formId}-${fieldName}`;
          this.laydate.close(instanceId);
        } catch (e) {
          // 忽略错误
        }
      });
      this.laydateInstances = {};
    }
    
    this.container.empty();
    this.currentData = null;
  }
}
