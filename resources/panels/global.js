class DatabaseConfigForm {
  constructor() {
    this.$dbType = $("#dbType");
    this.$name = $("#name");
    this.$host = $("#host");
    this.$port = $("#port");
    this.$user = $("#user");
    this.$password = $("#password");
    this.$database = $("#database");
    this.$sqlitePath = $("#sqlitePath");
    this.$status = $("#status");
    this.$testBtn = $("#testBtn");
    this.$connectBtn = $("#connectBtn");
    this.$standardConfig = $("#standardConfig");
    this.$sqliteConfig = $("#sqliteConfig");

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.listenToMessages();
    this.setDefaultPort();
  }

  setupEventListeners() {
    this.$dbType.on("change", () => {
      this.onDatabaseTypeChange();
      this.setDefaultPort();
    });

    this.$testBtn.on("click", (e) => {
      e.preventDefault();
      this.testConnection();
    });

    this.$connectBtn.on("click", (e) => {
      e.preventDefault();
      this.saveConnection();
    });
  }

  onDatabaseTypeChange() {
    const type = this.$dbType.val();
    if (type === "sqlite") {
      this.$standardConfig.hide();
      this.$sqliteConfig.show();
    } else {
      this.$standardConfig.show();
      this.$sqliteConfig.hide();
    }
  }

  setDefaultPort() {
    const type = this.$dbType.val();
    const defaultPorts = {
      mysql: 3306,
      postgres: 5432,
      mssql: 1433,
    };
    if (defaultPorts[type]) {
      this.$port.attr("placeholder", String(defaultPorts[type]));
    } else {
      this.$port.attr("placeholder", "");
    }
  }

  getFormData() {
    const type = this.$dbType.val();
    return {
      type: "datasource",
      dbType: type,
      name: (this.$name.val() || "").trim(),
      host: (this.$host.val() || "").trim(),
      port: this.$port.val() ? parseInt(this.$port.val(), 10) : null,
      username: (this.$user.val() || "").trim(),
      password: this.$password.val() || "",
      database:
        type === "sqlite"
          ? (this.$sqlitePath.val() || "").trim()
          : (this.$database.val() || "").trim(),
    };
  }

  validateForm() {
    const data = this.getFormData();
    if (!data.name) {
      this.showStatus("请输入连接名称", "error");
      return false;
    }
    if (data.dbType !== "sqlite") {
      if (!data.host) {
        this.showStatus("请输入主机地址", "error");
        return false;
      }
      if (!data.database) {
        this.showStatus("请输入数据库名", "error");
        return false;
      }
    } else {
      if (!data.database) {
        this.showStatus("请输入 SQLite 文件路径", "error");
        return false;
      }
    }
    return true;
  }

  testConnection() {
    if (!this.validateForm()) {
      return;
    }
    if (!window.vscode) {
      this.showStatus("未在 VS Code Webview 中运行", "error");
      return;
    }
    this.setButtonsDisabled(true);
    this.showStatus("正在测试连接...", "info");
    window.vscode.postMessage({ command: "test", payload: this.getFormData() });
  }

  saveConnection() {
    if (!this.validateForm()) {
      return;
    }
    if (!window.vscode) {
      this.showStatus("未在 VS Code Webview 中运行", "error");
      return;
    }
    this.setButtonsDisabled(true);
    this.showStatus("正在保存配置...", "info");
    window.vscode.postMessage({ command: "save", payload: this.getFormData() });
  }

  listenToMessages() {
    window.addEventListener("message", (event) => {
      const message = event.data;
      if (!message || !message.command) {
        return;
      }

      switch (message.command) {
        case "status": {
          const isSuccess = message.success !== false;
          this.showStatus(
            message.message || "",
            isSuccess ? "success" : "error"
          );
          this.setButtonsDisabled(false);
          break;
        }
        case "setValues": {
          this.loadValues(message.values || {});
          break;
        }
      }
    });
  }

  loadValues(values) {
    Object.keys(values).forEach((key) => {
      const $el = $(`[name="${key}"]`);
      if ($el.length) {
        $el.val(values[key]);
      }
    });
    this.onDatabaseTypeChange();
  }

  showStatus(message, type = "info") {
    this.$status.text(message).attr("class", `status-message show ${type}`);
  }

  setButtonsDisabled(disabled) {
    this.$testBtn.prop("disabled", disabled);
    this.$connectBtn.prop("disabled", disabled);
  }
}

class DatabaseTableData {
  constructor(options) {
    this.tableSelector = options.tableSelector;
    this.stats = options.stats;
    this.vscode = options.vscode || null;

    this.table = null;
    this.tableData = [];
    this.columns = [];

    this.changedRows = new Set();
    this.selectedRowIndexes = new Set();
    this.lastClickedRowIndex = null;
    this.highlightedCell = null;
  }

  /* ========== 初始化入口 ========== */

  init(columns, data) {
    this.columns = columns;
    this.tableData = JSON.parse(JSON.stringify(data));
    this.changedRows.clear();
    this.selectedRowIndexes.clear();

    this._buildTableHead();
    this._initDataTable();
    this._bindEvents();
    this._updateStats();
  }

  /* ========== DataTable 初始化 ========== */

  _initDataTable() {
    if ($.fn.DataTable.isDataTable(this.tableSelector)) {
      $(this.tableSelector).DataTable().destroy();
    }

    this.table = $(this.tableSelector).DataTable({
      data: this.tableData,
      columns: this._buildColumns(),
      dom: "tip",
      pageLength: 10,
      orderFixed: [[1, "asc"]],
    });

    this.table.on("draw", () => this._applyRowHighlight());
  }

  _buildColumns() {
    const cols = [];

    // 序号列
    cols.push({
      data: null,
      orderable: false,
      searchable: false,
      className: "row-index-cell",
      width: "50px",
      render: (_d, _t, _r, meta) => meta.row + 1 + meta.settings._iDisplayStart,
    });

    this.columns.forEach((c) => {
      cols.push({ data: c.field });
    });

    return cols;
  }

  _buildTableHead() {
    const $thead = $(`${this.tableSelector} thead`);
    $thead.empty();

    const $tr = $("<tr>");
    $tr.append("<th>#</th>");
    this.columns.forEach((c) => {
      $tr.append(`<th>${c.field}</th>`);
    });
    $thead.append($tr);
  }

  /* ========== 事件绑定 ========== */

  _bindEvents() {
    const $tbody = $(`${this.tableSelector} tbody`);

    // 序号列：整行高亮（支持 Ctrl / Shift）
    $tbody
      .off("click", "td.row-index-cell")
      .on("click", "td.row-index-cell", (e) => this._handleRowIndexClick(e));

    // 非序号列：单元格高亮
    $tbody
      .off("click", "td:not(.row-index-cell)")
      .on("click", "td:not(.row-index-cell)", (e) => {
        e.stopPropagation();
        this._clearRowHighlight();
        this._highlightCell(e.currentTarget);
      });

    // 双击编辑
    $tbody
      .off("dblclick", "td:not(.row-index-cell)")
      .on("dblclick", "td:not(.row-index-cell)", (e) =>
        this._editCell(e.currentTarget)
      );
  }

  /* ========== 行选择逻辑 ========== */

  _handleRowIndexClick(e) {
    const row = this.table.row($(e.currentTarget).closest("tr"));
    const idx = row.index();

    if (e.shiftKey && this.lastClickedRowIndex !== null) {
      const [s, eIdx] =
        idx > this.lastClickedRowIndex
          ? [this.lastClickedRowIndex, idx]
          : [idx, this.lastClickedRowIndex];
      for (let i = s; i <= eIdx; i++) {
        this.selectedRowIndexes.add(i);
      }
    } else if (e.ctrlKey || e.metaKey) {
      this.selectedRowIndexes.has(idx)
        ? this.selectedRowIndexes.delete(idx)
        : this.selectedRowIndexes.add(idx);
      this.lastClickedRowIndex = idx;
    } else {
      this.selectedRowIndexes.clear();
      this.selectedRowIndexes.add(idx);
      this.lastClickedRowIndex = idx;
    }

    this._applyRowHighlight();
  }

  _applyRowHighlight() {
    $(`${this.tableSelector} tbody tr`).removeClass("row-highlight");

    this.selectedRowIndexes.forEach((idx) => {
      const row = this.table.row(idx);
      if (row.node()) {
        $(row.node()).addClass("row-highlight");
      }
    });

    this._clearCellHighlight();
    this._updateStats();
  }

  _clearRowHighlight() {
    this.selectedRowIndexes.clear();
    $(`${this.tableSelector} tbody tr`).removeClass("row-highlight");
  }

  /* ========== 单元格高亮 ========== */

  _highlightCell(cell) {
    this._clearCellHighlight();
    this.highlightedCell = cell;
    $(cell).addClass("cell-highlight");
  }

  _clearCellHighlight() {
    if (this.highlightedCell) {
      $(this.highlightedCell).removeClass("cell-highlight");
      this.highlightedCell = null;
    }
  }

  /* ========== 单元格编辑 ========== */

  _editCell(cell) {
    const $cell = $(cell);
    if ($cell.hasClass("cell-edit")) {
      return;
    }

    const original = $cell.text();
    const colIndex = $cell.index() - 1;
    const row = this.table.row($cell.closest("tr"));
    const field = Object.keys(row.data())[colIndex + 1];

    $cell.addClass("cell-edit").empty();

    const $input = $("<input>")
      .val(original)
      .on("blur", () =>
        this._saveEdit($cell, row, field, $input.val(), original)
      )
      .on("keydown", (e) => {
        if (e.key === "Enter") {
          this._saveEdit($cell, row, field, $input.val(), original);
        }
        if (e.key === "Escape") {
          this._cancelEdit($cell, original);
        }
      });

    $cell.append($input);
    $input.focus().select();
  }

  _saveEdit($cell, row, field, value, original) {
    $cell.removeClass("cell-edit").text(value);

    if (value !== original) {
      row.data()[field] = value;
      row.invalidate();
      this.changedRows.add(row.index());
    }
    this._updateStats();
  }

  _cancelEdit($cell, original) {
    $cell.removeClass("cell-edit").text(original);
  }

  /* ========== 统计 ========== */

  _updateStats() {
    if (!this.stats) {
      return;
    }
    $(this.stats.total).text(this.tableData.length);
    $(this.stats.selected).text(this.selectedRowIndexes.size);
    $(this.stats.changed).text(this.changedRows.size);
  }
}

(function ($) {
  window.vscode =
    typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null;
  window.DatabaseConfigForm = DatabaseConfigForm;
})(jQuery);
