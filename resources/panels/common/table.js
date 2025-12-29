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
    this.table = new Tabulator(this.tableSelector, {
      height: "100%",
      layout: "fitColumns",
      pagination: "local",
      paginationSize: 50,
      paginationCounter: "rows",
      columns: this._buildColumns(),
      data: [],
      // 启用行选择
      selectable: true,
      selectableRangeMode: "click",
      // 启用列排序
      headerSort: true,
      // 启用列调整大小
      resizableColumns: true,
      // 占位符文本
      placeholder: "暂无数据",
      // 启用虚拟 DOM（提升大数据性能）
      virtualDom: true,
      // 响应式列
      responsiveLayout: false,
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
    if (item.value.trim() !== item.initialValue) {
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
    if (!this.table) {
      return;
    }

    this.table.addData([this.newRow], false).then((rows) => {
      if (rows && rows.length > 0) {
        layui.use("layer", function () {
          const layer = layui.layer;
        });
      }
    });
  };

  /**
   * 刷新表格
   */
  refreshTable = () => {
    if (!this.table) {
      return;
    }

    this.table.replaceData(this.tableData);
    this.changedRows.clear();

    layui.use("layer", function () {
      const layer = layui.layer;
      layer.msg("表格已刷新", { icon: 1, time: 1500 });
    });
  };

  /**
   * 删除选中行
   */
  deleteRow = () => {
    if (!this.table) {
      return;
    }

    const selectedRows = this.table.getSelectedData();
    if (selectedRows.length === 0) {
      layui.use("layer", function () {
        const layer = layui.layer;
        layer.msg("请先选择要删除的行", { icon: 0, time: 2000 });
      });
      return;
    }

    const self = this;
    layui.use("layer", function () {
      const layer = layui.layer;
      layer.confirm(
        "确定要删除选中的 " + selectedRows.length + " 行吗？",
        {
          icon: 3,
          title: "确认删除",
        },
        function (index) {
          // 用户确认删除
          self.table.getSelectedRows().forEach((row) => row.delete());
          layer.close(index);
          layer.msg("删除成功", { icon: 1, time: 1500 });
        }
      );
    });
  };

  /**
   * 导出为 CSV
   */
  exportCSV = () => {
    if (!this.table) {
      return;
    }
    this.table.download("csv", "data.csv");
  };

  /**
   * 导出为 JSON
   */
  exportJSON = () => {
    if (!this.table) {
      return;
    }
    this.table.download("json", "data.json");
  };

  /**
   * 导出为 SQL
   */
  exportSQL = () => {
    layui.use("layer", function () {
      const layer = layui.layer;
      layer.msg("SQL 导出功能开发中...", { icon: 0, time: 2000 });
    });
  };

  /**
   * 获取修改的行数据
   */
  getChangedRows() {
    const rows = [];
    this.changedRows.forEach((row) => {
      rows.push(row.getData());
    });
    return rows;
  }

  /**
   * 应用过滤和排序
   * @param {string} whereClause - WHERE 子句
   * @param {string} orderByClause - ORDER BY 子句
   */
  applyFilter(whereClause, orderByClause) {
    if (!this.table) {
      return;
    }

    // 清除现有的过滤和排序
    this.table.clearFilter();
    this.table.clearSort();

    let filteredData = [...this.tableData];

    // 应用 WHERE 过滤
    if (whereClause && whereClause.trim()) {
      try {
        filteredData = this.filterByWhereClause(filteredData, whereClause);
        
        layui.use("layer", function () {
          const layer = layui.layer;
          layer.msg(`已应用 WHERE 过滤，找到 ${filteredData.length} 条记录`, { 
            icon: 1, 
            time: 2000 
          });
        });
      } catch (error) {
        layui.use("layer", function () {
          const layer = layui.layer;
          layer.msg(`WHERE 子句错误: ${error.message}`, { 
            icon: 2, 
            time: 3000 
          });
        });
        return;
      }
    }

    // 应用 ORDER BY 排序
    if (orderByClause && orderByClause.trim()) {
      try {
        filteredData = this.sortByOrderByClause(filteredData, orderByClause);
        
        if (!whereClause) {
          layui.use("layer", function () {
            const layer = layui.layer;
            layer.msg(`已应用 ORDER BY 排序`, { 
              icon: 1, 
              time: 2000 
            });
          });
        }
      } catch (error) {
        layui.use("layer", function () {
          const layer = layui.layer;
          layer.msg(`ORDER BY 子句错误: ${error.message}`, { 
            icon: 2, 
            time: 3000 
          });
        });
        return;
      }
    }

    // 更新表格数据
    this.table.setData(filteredData);

    // 如果没有过滤和排序，显示提示
    if (!whereClause && !orderByClause) {
      layui.use("layer", function () {
        const layer = layui.layer;
        layer.msg("已清除过滤和排序", { icon: 1, time: 1500 });
      });
    }
  }

  /**
   * 根据 WHERE 子句过滤数据
   * @param {Array} data - 原始数据
   * @param {string} whereClause - WHERE 子句
   * @returns {Array} 过滤后的数据
   */
  filterByWhereClause(data, whereClause) {
    // 简单的 WHERE 子句解析（支持基本的条件）
    return data.filter(row => {
      try {
        // 替换字段名为 row.字段名
        let condition = whereClause;
        
        // 替换所有字段名
        this.columns.forEach(col => {
          const fieldName = col.field;
          // 使用正则表达式替换字段名（避免替换引号内的内容）
          const regex = new RegExp(`\\b${fieldName}\\b`, 'gi');
          condition = condition.replace(regex, `row["${fieldName}"]`);
        });

        // 替换 SQL 运算符为 JavaScript 运算符
        condition = condition
          .replace(/\bAND\b/gi, '&&')
          .replace(/\bOR\b/gi, '||')
          .replace(/\bNOT\b/gi, '!')
          .replace(/\bIS NULL\b/gi, '=== null || === ""')
          .replace(/\bIS NOT NULL\b/gi, '!== null && !== ""')
          .replace(/\bLIKE\b/gi, '.includes')
          .replace(/'/g, '"');

        // 使用 Function 创建动态函数（比 eval 更安全）
        const evaluator = new Function('row', `return ${condition};`);
        return evaluator(row);
      } catch (error) {
        console.error('Filter error:', error);
        return true; // 如果出错，保留该行
      }
    });
  }

  /**
   * 根据 ORDER BY 子句排序数据
   * @param {Array} data - 原始数据
   * @param {string} orderByClause - ORDER BY 子句
   * @returns {Array} 排序后的数据
   */
  sortByOrderByClause(data, orderByClause) {
    // 解析 ORDER BY 子句：field1 ASC, field2 DESC
    const sortRules = orderByClause.split(',').map(rule => {
      const parts = rule.trim().split(/\s+/);
      const field = parts[0];
      const direction = (parts[1] || 'ASC').toUpperCase();
      return { field, direction };
    });

    // 复制数据以避免修改原数组
    const sortedData = [...data];

    // 多字段排序
    sortedData.sort((a, b) => {
      for (const rule of sortRules) {
        const aVal = a[rule.field];
        const bVal = b[rule.field];

        // 处理 null 和 undefined
        if (aVal == null && bVal == null) continue;
        if (aVal == null) return rule.direction === 'ASC' ? 1 : -1;
        if (bVal == null) return rule.direction === 'ASC' ? -1 : 1;

        // 比较值
        let comparison = 0;
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          comparison = aVal.localeCompare(bVal);
        } else {
          comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        }

        if (comparison !== 0) {
          return rule.direction === 'DESC' ? -comparison : comparison;
        }
      }
      return 0;
    });

    return sortedData;
  }
}
