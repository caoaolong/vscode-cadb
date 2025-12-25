layui.use(function () {
  var tabs = layui.tabs;
  tabs.render({
    elem: "#results",
    closable: true,
    header: [
      { title: "结果1", icon: "&#xe65b;" },
      { title: "结果2", icon: "&#xe65b;" },
    ],
    body: [
      { content: '<div class="layui-card-body">结果1</div>' },
      { content: '<div class="layui-card-body">结果2</div>' },
    ],
  });
});

$(function () {
  // 获取 VSCode API
  let vscode = null;
  if (window.vscode) {
    vscode = window.vscode;
  } else {
    vscode = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null;
  }
});
