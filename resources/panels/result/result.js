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

  // 当前右键菜单的标签ID
  let contextMenuTabId = null;

  /**
   * 初始化 Tabs
   */
  function initTabs() {
    // 使用 layui tabs 的新 API
    tabs.set({
      elem: '#results',
      data: []
    });

    // 初始化右键菜单
    initContextMenu();
  }

  /**
   * 初始化右键菜单
   */
  function initContextMenu() {
    const $body = $('body');
    
    // 创建右键菜单HTML
    const contextMenuHtml = `
      <div class="tab-context-menu" id="tabContextMenu">
        <div class="tab-context-menu-item" data-action="pin">
          <i class="layui-icon layui-icon-rate"></i>
          <span class="menu-text">固定</span>
        </div>
        <div class="tab-context-menu-separator"></div>
        <div class="tab-context-menu-item" data-action="close">
          <i class="layui-icon layui-icon-close"></i>
          <span>关闭当前结果</span>
        </div>
        <div class="tab-context-menu-item" data-action="close-left">
          <i class="layui-icon layui-icon-left"></i>
          <span>关闭左侧结果</span>
        </div>
        <div class="tab-context-menu-item" data-action="close-right">
          <i class="layui-icon layui-icon-right"></i>
          <span>关闭右侧结果</span>
        </div>
        <div class="tab-context-menu-separator"></div>
        <div class="tab-context-menu-item" data-action="close-all">
          <i class="layui-icon layui-icon-close-fill"></i>
          <span>关闭全部结果</span>
        </div>
      </div>
    `;
    
    $body.append(contextMenuHtml);
    
    const $menu = $('#tabContextMenu');
    
    // 点击菜单项
    $menu.on('click', '.tab-context-menu-item:not(.disabled)', function(e) {
      e.stopPropagation();
      const action = $(this).data('action');
      handleContextMenuAction(action, contextMenuTabId);
      hideContextMenu();
    });
    
    // 点击页面其他地方隐藏菜单
    $(document).on('click', function() {
      hideContextMenu();
    });
    
    // 阻止菜单自身的右键
    $menu.on('contextmenu', function(e) {
      e.preventDefault();
      e.stopPropagation();
    });
  }

  /**
   * 显示右键菜单
   */
  function showContextMenu(tabId, x, y) {
    contextMenuTabId = tabId;
    const $menu = $('#tabContextMenu');
    const $tab = $(`.layui-tab-title li[lay-id="${tabId}"]`);
    const isPinned = $tab.hasClass('tab-pinned');
    
    // 更新固定按钮文本
    const $pinItem = $menu.find('[data-action="pin"]');
    if (isPinned) {
      $pinItem.find('.menu-text').text('取消固定');
      $pinItem.find('.layui-icon').removeClass('layui-icon-rate').addClass('layui-icon-rate-solid');
    } else {
      $pinItem.find('.menu-text').text('固定');
      $pinItem.find('.layui-icon').removeClass('layui-icon-rate-solid').addClass('layui-icon-rate');
    }
    
    // 检查是否可以关闭
    const canClose = !isPinned;
    $menu.find('[data-action="close"]').toggleClass('disabled', !canClose);
    
    // 检查是否有左侧/右侧标签
    const $allTabs = $('.layui-tab-title li');
    const currentIndex = $allTabs.index($tab);
    const hasLeft = currentIndex > 0;
    const hasRight = currentIndex < $allTabs.length - 1;
    
    $menu.find('[data-action="close-left"]').toggleClass('disabled', !hasLeft);
    $menu.find('[data-action="close-right"]').toggleClass('disabled', !hasRight);
    
    // 检查是否有可关闭的标签
    const hasClosable = $('.layui-tab-title li:not(.tab-pinned)').length > 0;
    $menu.find('[data-action="close-all"]').toggleClass('disabled', !hasClosable);
    
    // 定位菜单
    $menu.css({
      left: x + 'px',
      top: y + 'px'
    }).addClass('show');
    
    // 确保菜单不超出屏幕
    const menuWidth = $menu.outerWidth();
    const menuHeight = $menu.outerHeight();
    const windowWidth = $(window).width();
    const windowHeight = $(window).height();
    
    if (x + menuWidth > windowWidth) {
      $menu.css('left', (windowWidth - menuWidth - 5) + 'px');
    }
    if (y + menuHeight > windowHeight) {
      $menu.css('top', (windowHeight - menuHeight - 5) + 'px');
    }
  }

  /**
   * 隐藏右键菜单
   */
  function hideContextMenu() {
    $('#tabContextMenu').removeClass('show');
    contextMenuTabId = null;
  }

  /**
   * 处理右键菜单操作
   */
  function handleContextMenuAction(action, tabId) {
    switch (action) {
      case 'pin':
        togglePinTab(tabId);
        break;
      case 'close':
        closeTab(tabId);
        break;
      case 'close-left':
        closeLeftTabs(tabId);
        break;
      case 'close-right':
        closeRightTabs(tabId);
        break;
      case 'close-all':
        closeAllTabs();
        break;
    }
  }

  /**
   * 切换固定状态
   */
  function togglePinTab(tabId) {
    const $tab = $(`.layui-tab-title li[lay-id="${tabId}"]`);
    $tab.toggleClass('tab-pinned');
    
    const isPinned = $tab.hasClass('tab-pinned');
    layer.msg(isPinned ? '已固定' : '已取消固定', { icon: 1, time: 1000 });
  }

  /**
   * 关闭左侧标签
   */
  function closeLeftTabs(tabId) {
    const $tab = $(`.layui-tab-title li[lay-id="${tabId}"]`);
    const $allTabs = $('.layui-tab-title li');
    const currentIndex = $allTabs.index($tab);
    
    let closedCount = 0;
    $allTabs.each(function(index) {
      if (index < currentIndex && !$(this).hasClass('tab-pinned')) {
        const id = $(this).attr('lay-id');
        closeTab(id, true);
        closedCount++;
      }
    });
    
    if (closedCount > 0) {
      layer.msg(`已关闭 ${closedCount} 个标签`, { icon: 1, time: 1500 });
    }
  }

  /**
   * 关闭右侧标签
   */
  function closeRightTabs(tabId) {
    const $tab = $(`.layui-tab-title li[lay-id="${tabId}"]`);
    const $allTabs = $('.layui-tab-title li');
    const currentIndex = $allTabs.index($tab);
    
    let closedCount = 0;
    $allTabs.each(function(index) {
      if (index > currentIndex && !$(this).hasClass('tab-pinned')) {
        const id = $(this).attr('lay-id');
        closeTab(id, true);
        closedCount++;
      }
    });
    
    if (closedCount > 0) {
      layer.msg(`已关闭 ${closedCount} 个标签`, { icon: 1, time: 1500 });
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
    const { id, title, content, icon = '&#xe65b;', closable = true, pinned = false } = options;

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
      <li class="layui-this ${pinned ? 'tab-pinned' : ''}" lay-id="${tabId}">
        <i class="layui-icon">${icon}</i>
        ${tabTitle}
        ${closable && !pinned ? '<i class="layui-icon layui-icon-close layui-tab-close"></i>' : ''}
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
    if (closable && !pinned) {
      $newTab.find('.layui-tab-close').on('click', function(e) {
        e.stopPropagation();
        closeTab(tabId);
      });
    }

    // 绑定标签点击事件
    $newTab.on('click', function() {
      if (!$(this).hasClass('layui-this')) {
        switchTab(tabId);
      }
    });

    // 绑定右键菜单事件
    $newTab.on('contextmenu', function(e) {
      e.preventDefault();
      showContextMenu(tabId, e.clientX, e.clientY);
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
   * @param {boolean} silent - 是否静默关闭（不显示消息）
   */
  function closeTab(tabId, silent = false) {
    const $tabs = $('#results');
    const $tab = $tabs.find(`.layui-tab-title li[lay-id="${tabId}"]`);
    const $content = $tabs.find(`.layui-tab-content .layui-tab-item[lay-id="${tabId}"]`);
    
    // 检查是否固定
    if ($tab.hasClass('tab-pinned')) {
      if (!silent) {
        layer.msg('固定的标签无法关闭', { icon: 2, time: 1500 });
      }
      return;
    }
    
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
    const $allTabs = $tabs.find('.layui-tab-title li');
    
    let closedCount = 0;
    $allTabs.each(function() {
      if (!$(this).hasClass('tab-pinned')) {
        const id = $(this).attr('lay-id');
        closeTab(id, true);
        closedCount++;
      }
    });
    
    if (closedCount > 0) {
      layer.msg(`已关闭 ${closedCount} 个标签`, { icon: 1, time: 1500 });
    } else {
      layer.msg('没有可关闭的标签', { icon: 0, time: 1500 });
    }
    
    // 如果还有固定标签，激活第一个
    const $firstTab = $tabs.find('.layui-tab-title li').first();
    if ($firstTab.length > 0) {
      const firstTabId = $firstTab.attr('lay-id');
      switchTab(firstTabId);
    }
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
