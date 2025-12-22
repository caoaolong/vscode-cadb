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
    this.vscode = options.vscode || null;

		this.newRow = {};

    this.table = null;
    this.tableData = [];
    this.columns = [];

    this.changedRows = new Set();
    this.selectedRowIndexes = new Set();
    this.lastClickedRowIndex = null;
    this.highlightedCell = null;
  }

	// 外部函数

	addRow = () => {
		this.table.addData(this.newRow, false).then(rows => {
			console.log(rows);
		});
	};

	refreshTable = () => {
		this.table.replaceData(this.tableData);
	};

  /* ========== 初始化入口 ========== */

  init(columns, data) {
    this.columns = columns;
    this.tableData = data;
    this.changedRows.clear();
    this.selectedRowIndexes.clear();
    this._initDataTable();
  }

  /* ========== DataTable 初始化 ========== */

  _initDataTable() {
    console.log(this.tableData);
    this.table = new Tabulator(this.tableSelector, {
      height: "100%",
      layout: "fitColumns",
			pagination:"local",
      columns: this._buildColumns(),
      data: [],
    });
    requestAnimationFrame(() => this.table.setData(this.tableData));
  }

  _buildColumns() {
    const cols = [];
    this.columns.forEach((c) => {
      cols.push({
        title: c.field.toUpperCase(),
        field: c.field,
        editor: "input",
        resizable: true,
        cellEdited: this._cellEdited,
        rawData: c,
      });
			this.newRow[c.field] = c.defaultValue;
    });
    return cols;
  }

  _cellEdited = (cell) => {
		const item = cell._cell;
		// eslint-disable-next-line eqeqeq
		if (item.value.trim() != item.initialValue) {
			$(cell._cell.element).addClass("tabulator-cell-edited");
			this.changedRows.add(item.row);
		} else {
			$(cell._cell.element).removeClass("tabulator-cell-edited");
			this.changedRows.delete(item.row);
		}
  };
}

(function ($) {
  window.vscode =
    typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null;
  window.DatabaseConfigForm = DatabaseConfigForm;
})(jQuery);
