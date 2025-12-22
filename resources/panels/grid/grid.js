/**
 * Grid 页面 - 数据表格视图
 * 使用 Tabulator 进行数据渲染
 */

class DatabaseTableData {
  constructor(options) {
    this.tableSelector = options.tableSelector;
    this.vscode = options.vscode || null;

    this.newRow = {};
    this.table = null;
    this.tableData = [];
    this.columns = [];
    this.changedRows = new Set();
  }

  /**
   * 初始化表格
   */
  init(columns, data) {
    this.columns = columns;
    this.tableData = data;
    this.changedRows.clear();
    this._initDataTable();
  }

  /**
   * 初始化 Tabulator
   */
  _initDataTable() {
    console.log('初始化表格数据:', this.tableData);
    this.table = new Tabulator(this.tableSelector, {
      height: "100%",
      layout: "fitColumns",
      pagination: "local",
      paginationSize: 50,
      columns: this._buildColumns(),
      data: [],
    });
    
    // 异步加载数据
    requestAnimationFrame(() => this.table.setData(this.tableData));
  }

  /**
   * 构建列定义
   */
  _buildColumns() {
    const cols = [];
    this.columns.forEach((c) => {
      cols.push({
        title: c.field.toUpperCase(),
        field: c.field,
        editor: "input",
        resizable: true,
        cellEdited: this._cellEdited.bind(this),
        rawData: c,
      });
      this.newRow[c.field] = c.defaultValue || "";
    });
    return cols;
  }

  /**
   * 单元格编辑回调
   */
  _cellEdited(cell) {
    const item = cell._cell;
    // 检查值是否改变
    if (item.value.trim() != item.initialValue) {
      $(cell._cell.element).addClass("tabulator-cell-edited");
      this.changedRows.add(item.row);
    } else {
      $(cell._cell.element).removeClass("tabulator-cell-edited");
      this.changedRows.delete(item.row);
    }
  }

  /**
   * 添加新行
   */
  addRow = () => {
    if (!this.table) return;
    
    this.table.addData([this.newRow], false).then((rows) => {
      console.log('添加新行:', rows);
      if (rows && rows.length > 0) {
        layui.use('layer', function() {
          const layer = layui.layer;
          layer.msg('新行已添加', { icon: 1, time: 1500 });
        });
      }
    });
  };

  /**
   * 刷新表格
   */
  refreshTable = () => {
    if (!this.table) return;
    
    this.table.replaceData(this.tableData);
    this.changedRows.clear();
    
    layui.use('layer', function() {
      const layer = layui.layer;
      layer.msg('表格已刷新', { icon: 1, time: 1500 });
    });
  };

  /**
   * 删除选中行
   */
  deleteRow = () => {
    if (!this.table) return;
    
    const selectedRows = this.table.getSelectedData();
    if (selectedRows.length === 0) {
      layui.use('layer', function() {
        const layer = layui.layer;
        layer.msg('请先选择要删除的行', { icon: 0, time: 2000 });
      });
      return;
    }

    layui.use('layer', function() {
      const layer = layui.layer;
      layer.confirm('确定要删除选中的 ' + selectedRows.length + ' 行吗？', {
        icon: 3,
        title: '确认删除'
      }, function(index) {
        // 用户确认删除
        this.table.getSelectedRows().forEach(row => row.delete());
        layer.close(index);
        layer.msg('删除成功', { icon: 1, time: 1500 });
      }.bind(this));
    }.bind(this));
  };

  /**
   * 导出为 CSV
   */
  exportCSV = () => {
    if (!this.table) return;
    this.table.download("csv", "data.csv");
  };

  /**
   * 导出为 JSON
   */
  exportJSON = () => {
    if (!this.table) return;
    this.table.download("json", "data.json");
  };

  /**
   * 导出为 SQL
   */
  exportSQL = () => {
    layui.use('layer', function() {
      const layer = layui.layer;
      layer.msg('SQL 导出功能开发中...', { icon: 0, time: 2000 });
    });
  };

  /**
   * 获取修改的行数据
   */
  getChangedRows() {
    const rows = [];
    this.changedRows.forEach(row => {
      rows.push(row.getData());
    });
    return rows;
  }
}

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

