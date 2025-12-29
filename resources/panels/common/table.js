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
    console.log('=== WHERE 过滤开始 ===');
    console.log('原始 WHERE 子句:', whereClause);
    console.log('数据行数:', data.length);
    console.log('可用字段:', this.columns.map(c => c.field));
    
    // 简单的 WHERE 子句解析（支持基本的条件）
    const filteredData = data.filter(row => {
      try {
        let condition = whereClause.trim();
        
        // 先处理 LIKE 运算符（需要特殊处理）
        // 将 field LIKE 'value' 转换为 field.toString().includes('value')
        condition = condition.replace(
          /(\w+)\s+LIKE\s+['"]([^'"]+)['"]/gi,
          (match, field, pattern) => {
            return `(row["${field}"] && row["${field}"].toString().includes("${pattern}"))`;
          }
        );
        
        // 处理 IS NULL 和 IS NOT NULL
        condition = condition.replace(
          /(\w+)\s+IS\s+NOT\s+NULL/gi,
          (match, field) => {
            return `(row["${field}"] !== null && row["${field}"] !== undefined && row["${field}"] !== "")`;
          }
        );
        
        condition = condition.replace(
          /(\w+)\s+IS\s+NULL/gi,
          (match, field) => {
            return `(row["${field}"] === null || row["${field}"] === undefined || row["${field}"] === "")`;
          }
        );
        
        // 替换所有字段名为 row["字段名"]
        // 但要避免替换已经处理过的 row["xxx"] 格式
        this.columns.forEach(col => {
          const fieldName = col.field;
          // 匹配独立的字段名（不在 row["..."] 或引号内）
          const regex = new RegExp(`(?<!row\\[")\\b${fieldName}\\b(?!")`, 'gi');
          condition = condition.replace(regex, `row["${fieldName}"]`);
        });

        // 替换 SQL 逻辑运算符为 JavaScript 运算符
        condition = condition
          .replace(/\bAND\b/gi, '&&')
          .replace(/\bOR\b/gi, '||')
          .replace(/\bNOT\b/gi, '!');
        
        // 替换单引号为双引号（JavaScript 字符串）
        condition = condition.replace(/'/g, '"');
        
        // 处理字符串比较（确保转换为字符串进行比较）
        // row["field"] = "value" -> row["field"].toString() === "value"
        condition = condition.replace(
          /row\["(\w+)"\]\s*([!=<>]+)\s*"([^"]*)"/g,
          (match, field, operator, value) => {
            const safeValue = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            return `(row["${field}"] && row["${field}"].toString() ${operator}= "${safeValue}")`;
          }
        );

        console.log('转换后的条件:', condition);
        
        // 使用 Function 创建动态函数（比 eval 更安全）
        const evaluator = new Function('row', `
          try {
            return ${condition};
          } catch (e) {
            console.error('执行条件出错:', e);
            return false;
          }
        `);
        
        const result = evaluator(row);
        
        if (result) {
          console.log('✓ 匹配的行:', row);
        }
        
        return result;
      } catch (error) {
        console.error('✗ Filter error:', error);
        console.error('错误的条件:', whereClause);
        console.error('当前行:', row);
        return false; // 出错时不保留该行
      }
    });
    
    console.log('过滤后行数:', filteredData.length);
    console.log('=== WHERE 过滤结束 ===');
    
    return filteredData;
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
