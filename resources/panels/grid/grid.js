// 页面初始化
$(function() {
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
    vscode: vscode
  });

  // 绑定按钮事件
  $("#btn-add").on("click", dbTable.addRow);
  $("#btn-refresh").on("click", dbTable.refreshTable);
  $("#btn-delete").on("click", dbTable.deleteRow);
  $("#btn-export-csv").on("click", dbTable.exportCSV);
  $("#btn-export-json").on("click", dbTable.exportJSON);
  $("#btn-export-sql").on("click", dbTable.exportSQL);

  // 保存按钮
  $("#btn-save").on("click", () => {
    const changedRows = dbTable.getChangedRows();
    if (changedRows.length === 0) {
      layui.use('layer', function() {
        const layer = layui.layer;
        layer.msg('没有需要保存的修改', { icon: 0, time: 2000 });
      });
      return;
    }

    if (vscode) {
      vscode.postMessage({ 
        command: "save", 
        data: changedRows 
      });
    }
  });

  // 监听来自 VSCode 的消息
  window.addEventListener("message", (event) => {
    const { command, data } = event.data;

    if (command === "load") {
      dbTable.init(data.columnDefs, data.rowData);
    } else if (command === "status") {
      layui.use('layer', function() {
        const layer = layui.layer;
        const icon = data.success ? 1 : 2;
        layer.msg(data.message || '操作完成', { icon: icon, time: 2000 });
      });
    }
  });

  // 暴露到全局
  window.dbTable = dbTable;
});

