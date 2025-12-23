/**
 * User 页面 - 数据库用户管理
 * 用于创建、编辑和管理数据库用户
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
  const $sslType = $('#sslType');
  const $sslConfig = $('#sslConfig');
  const $saveBtn = $('#saveBtn');
  const $cancelBtn = $('#cancelBtn');
  const $status = $('#status');

  /**
   * SSL 类型改变时的处理
   */
  function onSslTypeChange() {
    const type = $sslType.val();
    
    if (type === 'NONE' || type === 'ANY') {
      $sslConfig.hide();
    } else {
      $sslConfig.show();
    }
  }

  /**
   * 获取表单数据
   */
  function getFormData() {
    const data = {
      type: 'user',
      name: $('#name').val().trim(),
      host: $('#host').val().trim(),
      canLogin: $('input[name="canLogin"]').prop('checked'),
      plugin: $('#plugin').val(),
      password: $('#password').val(),
      maxConnections: parseInt($('#maxConnections').val() || '0', 10),
      maxQuestions: parseInt($('#maxQuestions').val() || '0', 10),
      maxUpdates: parseInt($('#maxUpdates').val() || '0', 10),
      maxUserConnections: parseInt($('#maxUserConnections').val() || '0', 10),
      sslType: $sslType.val(),
      sslCipher: $('#sslCipher').val().trim(),
      x509Issuer: $('#x509Issuer').val().trim(),
      x509Subject: $('#x509Subject').val().trim()
    };

    return data;
  }

  /**
   * 表单验证
   */
  function validateForm() {
    const data = getFormData();

    if (!data.name) {
      showStatus('请输入用户名', 'error');
      return false;
    }

    if (!data.host) {
      showStatus('请输入主机地址', 'error');
      return false;
    }

    return true;
  }

  /**
   * 保存用户
   */
  function saveUser() {
    if (!validateForm()) {
      return;
    }

    if (!vscode) {
      showStatus('未在 VS Code Webview 中运行', 'error');
      return;
    }

    setButtonsDisabled(true);
    showStatus('正在保存用户信息...', 'info');

    vscode.postMessage({
      command: 'save',
      payload: getFormData()
    });
  }

  /**
   * 取消操作
   */
  function cancelEdit() {
    if (!vscode) {
      showStatus('未在 VS Code Webview 中运行', 'error');
      return;
    }

    vscode.postMessage({
      command: 'cancel'
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
      $saveBtn.addClass('layui-btn-disabled').prop('disabled', true);
      $cancelBtn.addClass('layui-btn-disabled').prop('disabled', true);
    } else {
      $saveBtn.removeClass('layui-btn-disabled').prop('disabled', false);
      $cancelBtn.removeClass('layui-btn-disabled').prop('disabled', false);
    }
  }

  /**
   * 加载用户数据
   */
  function loadUserData(userData) {
    if (userData.name) $('#name').val(userData.name);
    if (userData.host) $('#host').val(userData.host);
    
    $('input[name="canLogin"]').prop('checked', userData.canLogin !== false);
    
    if (userData.plugin) $('#plugin').val(userData.plugin);
    if (userData.password) $('#password').val(userData.password);
    
    $('#maxConnections').val(userData.maxConnections || 0);
    $('#maxQuestions').val(userData.maxQuestions || 0);
    $('#maxUpdates').val(userData.maxUpdates || 0);
    $('#maxUserConnections').val(userData.maxUserConnections || 0);
    
    if (userData.sslType) $sslType.val(userData.sslType);
    if (userData.sslCipher) $('#sslCipher').val(userData.sslCipher);
    if (userData.x509Issuer) $('#x509Issuer').val(userData.x509Issuer);
    if (userData.x509Subject) $('#x509Subject').val(userData.x509Subject);
    
    // 重新渲染表单
    form.render();
    onSslTypeChange();
  }

  // 监听 SSL 类型变化
  form.on('select(sslType)', function(data) {
    onSslTypeChange();
  });

  // 保存按钮
  $saveBtn.on('click', function(e) {
    e.preventDefault();
    saveUser();
  });

  // 取消按钮
  $cancelBtn.on('click', function(e) {
    e.preventDefault();
    cancelEdit();
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
      case 'loadUser': {
        loadUserData(message.data || {});
        break;
      }
      case 'setValues': {
        loadUserData(message.values || {});
        break;
      }
    }
  });

  // 初始化
  onSslTypeChange();

  // 通知 VSCode 页面已准备好
  if (vscode) {
    vscode.postMessage({
      command: 'ready'
    });
  }
});

