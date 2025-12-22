/**
 * Config 页面 - 数据库连接配置
 * 支持多种数据库类型：MySQL、PostgreSQL、SQLite、SQL Server
 */

layui.use(['form', 'layer'], function() {
  const form = layui.form;
  const layer = layui.layer;

  // 获取 VSCode API
  let vscode = null;
  if (window.vscode) {
    vscode = window.vscode;
  } else {
    vscode = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null;
  }

  // 获取表单元素
  const $dbType = $('#dbType');
  const $standardConfig = $('#standardConfig');
  const $sqliteConfig = $('#sqliteConfig');
  const $port = $('#port');
  const $testBtn = $('#testBtn');
  const $connectBtn = $('#connectBtn');
  const $status = $('#status');

  // 默认端口配置
  const defaultPorts = {
    mysql: 3306,
    postgres: 5432,
    mssql: 1433
  };

  /**
   * 数据库类型改变时的处理
   */
  function onDatabaseTypeChange() {
    const type = $dbType.val();
    
    if (type === 'sqlite') {
      $standardConfig.hide();
      $sqliteConfig.addClass('show');
    } else {
      $standardConfig.show();
      $sqliteConfig.removeClass('show');
    }

    // 设置默认端口
    setDefaultPort();
  }

  /**
   * 设置默认端口
   */
  function setDefaultPort() {
    const type = $dbType.val();
    if (defaultPorts[type]) {
      $port.attr('placeholder', String(defaultPorts[type]));
    } else {
      $port.attr('placeholder', '');
    }
  }

  /**
   * 获取表单数据
   */
  function getFormData() {
    const type = $dbType.val();
    const data = {
      type: 'datasource',
      dbType: type,
      name: $('#name').val().trim(),
      host: $('#host').val().trim(),
      port: $port.val() ? parseInt($port.val(), 10) : (defaultPorts[type] || null),
      username: $('#user').val().trim(),
      password: $('#password').val(),
      database: type === 'sqlite' 
        ? $('#sqlitePath').val().trim() 
        : $('#database').val().trim()
    };

    return data;
  }

  /**
   * 表单验证
   */
  function validateForm() {
    const data = getFormData();

    if (!data.name) {
      showStatus('请输入连接名称', 'error');
      return false;
    }

    if (data.dbType !== 'sqlite') {
      if (!data.host) {
        showStatus('请输入主机地址', 'error');
        return false;
      }
      if (!data.database) {
        showStatus('请输入数据库名', 'error');
        return false;
      }
    } else {
      if (!data.database) {
        showStatus('请输入 SQLite 文件路径', 'error');
        return false;
      }
    }

    return true;
  }

  /**
   * 测试连接
   */
  function testConnection() {
    if (!validateForm()) {
      return;
    }

    if (!vscode) {
      showStatus('未在 VS Code Webview 中运行', 'error');
      return;
    }

    setButtonsDisabled(true);
    showStatus('正在测试连接...', 'info');

    vscode.postMessage({
      command: 'test',
      payload: getFormData()
    });
  }

  /**
   * 保存连接
   */
  function saveConnection() {
    if (!validateForm()) {
      return;
    }

    if (!vscode) {
      showStatus('未在 VS Code Webview 中运行', 'error');
      return;
    }

    setButtonsDisabled(true);
    showStatus('正在保存配置...', 'info');

    vscode.postMessage({
      command: 'save',
      payload: getFormData()
    });
  }

  /**
   * 显示状态消息
   */
  function showStatus(message, type = 'info') {
    $status
      .text(message)
      .removeClass('info success error')
      .addClass(`show ${type}`);

    // 自动隐藏（除了错误消息）
    if (type !== 'error') {
      setTimeout(() => {
        $status.removeClass('show');
      }, 3000);
    }
  }

  /**
   * 设置按钮禁用状态
   */
  function setButtonsDisabled(disabled) {
    if (disabled) {
      $testBtn.addClass('layui-btn-disabled').prop('disabled', true);
      $connectBtn.addClass('layui-btn-disabled').prop('disabled', true);
    } else {
      $testBtn.removeClass('layui-btn-disabled').prop('disabled', false);
      $connectBtn.removeClass('layui-btn-disabled').prop('disabled', false);
    }
  }

  /**
   * 加载配置值
   */
  function loadValues(values) {
    Object.keys(values).forEach((key) => {
      const $el = $(`[name="${key}"]`);
      if ($el.length) {
        $el.val(values[key]);
      }
    });
    
    // 重新渲染表单
    form.render();
    onDatabaseTypeChange();
  }

  // 监听数据库类型变化
  form.on('select(dbType)', function(data) {
    onDatabaseTypeChange();
  });

  // 测试连接按钮
  $testBtn.on('click', function(e) {
    e.preventDefault();
    testConnection();
  });

  // 保存连接按钮
  $connectBtn.on('click', function(e) {
    e.preventDefault();
    saveConnection();
  });

  // 监听来自 VSCode 的消息
  window.addEventListener('message', (event) => {
    const message = event.data;
    
    if (!message || !message.command) {
      return;
    }

    switch (message.command) {
      case 'status': {
        const isSuccess = message.success !== false;
        showStatus(
          message.message || '操作完成',
          isSuccess ? 'success' : 'error'
        );
        setButtonsDisabled(false);
        break;
      }
      case 'setValues': {
        loadValues(message.values || {});
        break;
      }
      case 'testResult': {
        const isSuccess = message.success === true;
        if (isSuccess) {
          showStatus('连接测试成功！', 'success');
        } else {
          showStatus(message.message || '连接测试失败', 'error');
        }
        setButtonsDisabled(false);
        break;
      }
    }
  });

  // 初始化
  setDefaultPort();
  onDatabaseTypeChange();

  // 通知 VSCode 页面已准备好
  if (vscode) {
    vscode.postMessage({
      command: 'ready'
    });
  }
});

