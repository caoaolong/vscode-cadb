/**
 * Result 页面 - SQL查询结果展示
 * 使用 Layui Tabs 组件展示多个查询结果
 */

layui.use(['tabs', 'layer'], function () {
  const tabs = layui.tabs;
  const layer = layui.layer;

  // 获取 VSCode API
  let vscode = null;
  if (window.vscode) {
    vscode = window.vscode;
  } else {
    vscode = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null;
  }

  /**
   * 初始化 Tabs
   */
  function initTabs() {
    // 使用 layui tabs 的新 API
    tabs.set({
      elem: '#results',
      data: []
    });
  }

  /**
   * 添加新的结果标签页
   * @param {Object} options - 标签页配置
   * @param {string} options.id - 标签页ID
   * @param {string} options.title - 标签页标题
   * @param {string} options.content - 标签页内容
   * @param {string} options.icon - 图标（可选）
   * @param {boolean} options.closable - 是否可关闭（默认true）
   */
  function addResultTab(options) {
    const { id, title, content, icon = '&#xe65b;', closable = true } = options;

    // 创建标签页HTML
    const tabId = id || `tab-${Date.now()}`;
    const tabTitle = `
      <span class="layui-tab-title-text">${title}</span>
    `;

    // 使用 jQuery 直接操作DOM（因为 layui tabs API 可能不够灵活）
    const $tabs = $('#results');
    const $tabTitle = $tabs.find('.layui-tab-title');
    const $tabContent = $tabs.find('.layui-tab-content');

    // 如果标签栏不存在，创建它
    if ($tabTitle.length === 0) {
      $tabs.append('<ul class="layui-tab-title"></ul>');
      $tabs.append('<div class="layui-tab-content"></div>');
    }

    // 移除其他标签的激活状态
    $tabs.find('.layui-tab-title li').removeClass('layui-this');
    $tabs.find('.layui-tab-content .layui-tab-item').removeClass('layui-show');

    // 添加新标签
    const $newTab = $(`
      <li class="layui-this" lay-id="${tabId}">
        <i class="layui-icon">${icon}</i>
        ${tabTitle}
        ${closable ? '<i class="layui-icon layui-icon-close layui-tab-close"></i>' : ''}
      </li>
    `);

    const $newContent = $(`
      <div class="layui-tab-item layui-show" lay-id="${tabId}">
        ${content}
      </div>
    `);

    $tabs.find('.layui-tab-title').append($newTab);
    $tabs.find('.layui-tab-content').append($newContent);

    // 显示 tabs 容器
    $tabs.removeClass('layui-hide-v');

    // 绑定关闭事件
    if (closable) {
      $newTab.find('.layui-tab-close').on('click', function(e) {
        e.stopPropagation();
        closeTab(tabId);
      });
    }

    // 绑定标签切换事件
    $newTab.on('click', function() {
      if (!$(this).hasClass('layui-this')) {
        switchTab(tabId);
      }
    });
  }

  /**
   * 切换标签页
   * @param {string} tabId - 标签页ID
   */
  function switchTab(tabId) {
    const $tabs = $('#results');
    
    // 移除所有激活状态
    $tabs.find('.layui-tab-title li').removeClass('layui-this');
    $tabs.find('.layui-tab-content .layui-tab-item').removeClass('layui-show');

    // 激活指定标签
    $tabs.find(`.layui-tab-title li[lay-id="${tabId}"]`).addClass('layui-this');
    $tabs.find(`.layui-tab-content .layui-tab-item[lay-id="${tabId}"]`).addClass('layui-show');
  }

  /**
   * 关闭标签页
   * @param {string} tabId - 标签页ID
   */
  function closeTab(tabId) {
    const $tabs = $('#results');
    const $tab = $tabs.find(`.layui-tab-title li[lay-id="${tabId}"]`);
    const $content = $tabs.find(`.layui-tab-content .layui-tab-item[lay-id="${tabId}"]`);
    
    const isActive = $tab.hasClass('layui-this');
    
    // 移除标签和内容
    $tab.remove();
    $content.remove();

    // 如果关闭的是激活标签，激活最后一个标签
    if (isActive) {
      const $lastTab = $tabs.find('.layui-tab-title li').last();
      if ($lastTab.length > 0) {
        const lastTabId = $lastTab.attr('lay-id');
        switchTab(lastTabId);
      } else {
        // 如果没有标签了，隐藏容器
        $tabs.addClass('layui-hide-v');
      }
    }
  }

  /**
   * 关闭所有标签页
   */
  function closeAllTabs() {
    const $tabs = $('#results');
    $tabs.find('.layui-tab-title').empty();
    $tabs.find('.layui-tab-content').empty();
    $tabs.addClass('layui-hide-v');
  }

  /**
   * 创建表格内容
   * @param {Array} columns - 列定义
   * @param {Array} data - 数据
   * @returns {string} HTML内容
   */
  function createTableContent(columns, data) {
    if (!data || data.length === 0) {
      return `
        <div class="empty-state">
          <i class="layui-icon layui-icon-face-surprised"></i>
          <p>暂无数据</p>
        </div>
      `;
    }

    // 创建简单表格
    let html = '<div class="layui-card-body" style="padding: 0;"><table class="layui-table" lay-skin="line">';
    
    // 表头
    html += '<thead><tr>';
    columns.forEach(col => {
      html += `<th>${col.field}</th>`;
    });
    html += '</tr></thead>';

    // 表体
    html += '<tbody>';
    data.forEach(row => {
      html += '<tr>';
      columns.forEach(col => {
        const value = row[col.field] !== null && row[col.field] !== undefined 
          ? row[col.field] 
          : '<span style="color: #888;">NULL</span>';
        html += `<td>${value}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody>';

    html += '</table></div>';
    return html;
  }

  /**
   * 创建消息内容
   * @param {string} message - 消息文本
   * @param {string} type - 消息类型（success/error/info）
   * @returns {string} HTML内容
   */
  function createMessageContent(message, type = 'info') {
    const icons = {
      success: 'layui-icon-ok-circle',
      error: 'layui-icon-close-fill',
      info: 'layui-icon-tips'
    };
    
    const colors = {
      success: '#89d185',
      error: '#f48771',
      info: '#4fc3f7'
    };

    return `
      <div class="layui-card-body" style="display: flex; align-items: center; justify-content: center; min-height: 200px;">
        <div style="text-align: center;">
          <i class="layui-icon ${icons[type]}" style="font-size: 48px; color: ${colors[type]}; margin-bottom: 16px;"></i>
          <p style="font-size: 14px; color: var(--vscode-fg);">${message}</p>
        </div>
      </div>
    `;
  }

  // 监听来自 VSCode 的消息
  window.addEventListener('message', (event) => {
    const message = event.data;
    
    if (!message || !message.command) {
      return;
    }

    switch (message.command) {
      case 'showResult': {
        // 显示查询结果
        const { title, columns, data, id } = message;
        const content = createTableContent(columns, data);
        addResultTab({
          id: id || `result-${Date.now()}`,
          title: title || '查询结果',
          content: content,
          icon: '&#xe65b;'
        });
        break;
      }
      case 'showMessage': {
        // 显示消息
        const { title, text, type, id } = message;
        const content = createMessageContent(text, type || 'info');
        addResultTab({
          id: id || `message-${Date.now()}`,
          title: title || '消息',
          content: content,
          icon: type === 'error' ? '&#xe69c;' : '&#xe65b;'
        });
        break;
      }
      case 'closeTab': {
        // 关闭指定标签
        closeTab(message.id);
        break;
      }
      case 'closeAllTabs': {
        // 关闭所有标签
        closeAllTabs();
        break;
      }
      case 'clear': {
        // 清空所有结果
        closeAllTabs();
        break;
      }
    }
  });

  // 初始化
  initTabs();

  // 通知 VSCode 页面已准备好
  if (vscode) {
    vscode.postMessage({
      command: 'ready'
    });
  }

  // 示例：添加默认标签（可删除）
  // addResultTab({
  //   id: 'welcome',
  //   title: '欢迎',
  //   content: createMessageContent('执行 SQL 查询以查看结果', 'info'),
  //   icon: '&#xe68e;',
  //   closable: true
  // });
});
