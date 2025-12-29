// 页面初始化
$(function () {
  // 获取 VSCode API
  let vscode = null;
  if (window.vscode) {
    vscode = window.vscode;
  } else {
    vscode = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null;
  }

  // 初始化数据表格
  const dbTable = new DatabaseTableData({
    tableSelector: "#grid",
    vscode: vscode,
  });

  // 初始化 SQL 输入增强
  let whereInput, orderByInput;
  
  const initSQLInputs = () => {
    // WHERE 输入框
    whereInput = new SQLInput("#input-where", {
      onEnter: applyFilter,
      keywords: [
        'AND', 'OR', 'NOT', 'IN', 'BETWEEN', 'LIKE', 'IS', 'NULL',
        'TRUE', 'FALSE', 'EXISTS', 'ANY', 'ALL',
        '=', '!=', '<>', '<', '>', '<=', '>=',
        'COUNT', 'SUM', 'AVG', 'MAX', 'MIN',
        'UPPER', 'LOWER', 'LENGTH', 'TRIM',
      ]
    });

    // ORDER BY 输入框
    orderByInput = new SQLInput("#input-orderby", {
      onEnter: applyFilter,
      keywords: [
        'ASC', 'DESC', 'NULLS', 'FIRST', 'LAST',
      ]
    });
  };

  // 应用过滤
  const applyFilter = () => {
    const whereClause = whereInput.getValue();
    const orderByClause = orderByInput.getValue();

    // 应用过滤到表格
    dbTable.applyFilter(whereClause, orderByClause);
  };

  // 延迟初始化 SQL 输入（等待 DOM 完全加载）
  setTimeout(initSQLInputs, 100);

  // 绑定按钮事件
  $("#btn-add").on("click", dbTable.addRow);
  $("#btn-refresh").on("click", () => {
    dbTable.refreshTable();
    // 清空过滤条件
    if (whereInput) whereInput.clear();
    if (orderByInput) orderByInput.clear();
  });
  $("#btn-delete").on("click", dbTable.deleteRow);
  $("#btn-export-csv").on("click", dbTable.exportCSV);
  $("#btn-export-json").on("click", dbTable.exportJSON);
  $("#btn-export-sql").on("click", dbTable.exportSQL);

  // 保存按钮
  $("#btn-save").on("click", () => {
    const changedRows = dbTable.getChangedRows();
    if (changedRows.length === 0) {
      layui.use("layer", function () {
        const layer = layui.layer;
        layer.msg("没有需要保存的修改", { icon: 0, time: 2000 });
      });
      return;
    }

    if (vscode) {
      vscode.postMessage({
        command: "save",
        data: changedRows,
      });
    }
  });

  // 监听来自 VSCode 的消息
  window.addEventListener("message", (event) => {
    const { command, data } = event.data;

    if (command === "load") {
      dbTable.init(data.columnDefs, data.rowData);
    } else if (command === "status") {
      layui.use("layer", function () {
        const layer = layui.layer;
        const icon = data.success ? 1 : 2;
        layer.msg(data.message || "操作完成", { icon: icon, time: 2000 });
      });
    }
  });

  // 暴露到全局
  window.dbTable = dbTable;
});
