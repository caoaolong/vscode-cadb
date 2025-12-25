/**
 * Result 页面 - SQL查询结果展示
 * 使用 Layui Tabs 标准 API 展示多个查询结果
 */

layui.use(['tabs', 'layer', 'dropdown'], function () {
  const tabs = layui.tabs;
  const layer = layui.layer;
  const dropdown = layui.dropdown;
  const $ = layui.$;

  // 获取 VSCode API
  let vscode = null;
  if (window.vscode) {
    vscode = window.vscode;
  } else {
    vscode = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null;
  }

  // Tabs 实例 ID
  const TABS_ID = 'results';
  
  // Dropdown 实例配置
  let dropdownConfig = null;

  /**
   * 初始化 Tabs
   */
  function initTabs() {
    // 初始化 tabs 容器
    tabs.set({
      elem: '#' + TABS_ID
    });

    // 初始化右键菜单配置
    initDropdownConfig();
    
    console.log('Tabs 初始化完成');
  }

  /**
   * 初始化右键菜单配置
   */
  function initDropdownConfig() {
    dropdownConfig = {
      trigger: 'contextmenu',
      data: [
        {
          title: '固定',
          id: 'pin',
          templet: '<span><i class="layui-icon layui-icon-rate"></i> <span class="pin-text">固定</span></span>'
        },
        { type: '-' },
        {
          title: '关闭当前结果',
          id: 'close'
        },
        {
          title: '关闭左侧结果',
          id: 'close-left'
        },
        {
          title: '关闭右侧结果',
          id: 'close-right'
        },
        { type: '-' },
        {
          title: '关闭全部结果',
          id: 'close-all'
        }
      ],
      click: function(data, othis, event) {
        const $headerItem = this.elem;
        const index = $headerItem.index();
        const layId = $headerItem.attr('lay-id');
        
        handleDropdownAction(data.id, layId, index);
      }
    };
  }

  /**
   * 处理右键菜单操作
   */
  function handleDropdownAction(action, tabId, index) {
    const $tab = $(`#${TABS_ID} .layui-tabs-header>li[lay-id="${tabId}"]`);
    const isPinned = $tab.hasClass('tab-pinned');
    
    switch (action) {
      case 'pin':
        // 切换固定状态
        $tab.toggleClass('tab-pinned');
        const newPinned = $tab.hasClass('tab-pinned');
        
        // 更新关闭按钮显示
        if (newPinned) {
          $tab.find('.layui-tabs-close').hide();
        } else {
          $tab.find('.layui-tabs-close').show();
        }
        
        layer.msg(newPinned ? '已固定' : '已取消固定', { icon: 1, time: 1000 });
        break;
        
      case 'close':
        if (!isPinned) {
          tabs.close(TABS_ID, tabId);
        } else {
          layer.msg('固定的标签无法关闭', { icon: 2, time: 1500 });
        }
        break;
        
      case 'close-left':
        closeTabsByDirection('left', index);
        break;
        
      case 'close-right':
        closeTabsByDirection('right', index);
        break;
        
      case 'close-all':
        closeAllUnpinnedTabs();
        break;
    }
  }

  /**
   * 根据方向关闭标签
   */
  function closeTabsByDirection(direction, currentIndex) {
    const $allTabs = $(`#${TABS_ID} .layui-tabs-header>li`);
    let closedCount = 0;
    
    $allTabs.each(function(index) {
      const $tab = $(this);
      const shouldClose = direction === 'left' 
        ? index < currentIndex 
        : index > currentIndex;
      
      if (shouldClose && !$tab.hasClass('tab-pinned')) {
        const tabId = $tab.attr('lay-id');
        tabs.close(TABS_ID, tabId);
        closedCount++;
      }
    });
    
    if (closedCount > 0) {
      layer.msg(`已关闭 ${closedCount} 个标签`, { icon: 1, time: 1500 });
    }
  }

  /**
   * 关闭所有未固定的标签
   */
  function closeAllUnpinnedTabs() {
    const $allTabs = $(`#${TABS_ID} .layui-tabs-header>li`);
    let closedCount = 0;
    
    // 收集要关闭的标签ID
    const toClose = [];
    $allTabs.each(function() {
      const $tab = $(this);
      if (!$tab.hasClass('tab-pinned')) {
        toClose.push($tab.attr('lay-id'));
      }
    });
    
    // 关闭收集的标签
    toClose.forEach(function(tabId) {
      tabs.close(TABS_ID, tabId);
      closedCount++;
    });
    
    if (closedCount > 0) {
      layer.msg(`已关闭 ${closedCount} 个标签`, { icon: 1, time: 1500 });
    } else {
      layer.msg('没有可关闭的标签', { icon: 0, time: 1500 });
    }
  }

  /**
   * 添加新的结果标签页
   * @param {Object} options - 标签页配置
   * @param {string} options.id - 标签页ID
   * @param {string} options.title - 标签页标题
   * @param {string} options.content - 标签页内容
   * @param {string} options.icon - 图标（可选）
   * @param {boolean} options.closable - 是否可关闭（默认true）
   * @param {boolean} options.pinned - 是否固定（默认false）
   */
  function addResultTab(options) {
    const { id, title, content, icon, closable = true, pinned = false } = options;
    const tabId = id || `tab-${Date.now()}`;

    console.log('添加标签:', tabId, title);

    // 使用 Layui 标准 API 添加标签
    tabs.add(TABS_ID, {
      id: tabId,
      title: icon ? `<i class="layui-icon">${icon}</i> ${title}` : title,
      content: content,
      closable: closable && !pinned,
      done: function(data) {
        console.log('标签添加完成:', data);
        
        // 标签添加完成后的回调
        const $headerItem = data.headerItem;
        
        // 如果是固定标签，添加固定样式
        if (pinned) {
          $headerItem.addClass('tab-pinned');
        }
        
        // 为新标签添加右键菜单
        dropdown.render($.extend({}, dropdownConfig, {
          elem: $headerItem
        }));
        
        // 显示 tabs 容器
        $(`#${TABS_ID}`).removeClass('layui-hide-v');
        console.log('容器已显示');
      }
    });
  }

  /**
   * 切换标签页
   * @param {string} tabId - 标签页ID
   */
  function switchTab(tabId) {
    tabs.change(TABS_ID, tabId);
  }

  /**
   * 关闭标签页
   * @param {string} tabId - 标签页ID
   */
  function closeTab(tabId) {
    const $tab = $(`#${TABS_ID} .layui-tabs-header>li[lay-id="${tabId}"]`);
    
    // 检查是否固定
    if ($tab.hasClass('tab-pinned')) {
      layer.msg('固定的标签无法关闭', { icon: 2, time: 1500 });
      return;
    }
    
    // 使用 Layui 标准 API 关闭标签
    tabs.close(TABS_ID, tabId);
    
    // 如果没有标签了，隐藏容器
    const $allTabs = $(`#${TABS_ID} .layui-tabs-header>li`);
    if ($allTabs.length === 0) {
      $(`#${TABS_ID}`).addClass('layui-hide-v');
    }
  }

  /**
   * 关闭所有标签页
   */
  function closeAllTabs() {
    closeAllUnpinnedTabs();
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
        const { title, columns, data, id, pinned } = message;
        const content = createTableContent(columns, data);
        addResultTab({
          id: id || `result-${Date.now()}`,
          title: title || '查询结果',
          content: content,
          icon: '&#xe65b;',
          pinned: pinned || false
        });
        break;
      }
      case 'showMessage': {
        // 显示消息
        const { title, text, type, id, pinned } = message;
        const content = createMessageContent(text, type || 'info');
        addResultTab({
          id: id || `message-${Date.now()}`,
          title: title || '消息',
          content: content,
          icon: type === 'error' ? '&#xe69c;' : '&#xe65b;',
          pinned: pinned || false
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

  // 示例：添加默认欢迎标签
  addResultTab({
    id: 'welcome',
    title: '欢迎',
    content: createMessageContent('执行 SQL 查询以查看结果', 'info'),
    icon: '&#xe68e;',
    closable: true
  });
});
