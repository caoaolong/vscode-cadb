(function () {
  "use strict";

  const vscode = acquireVsCodeApi();

  // --- DOM refs ---
  const chatMessages = document.getElementById("chatMessages");
  const chatInput = document.getElementById("chatInput");
  const chatInputArea = document.getElementById("chatInputArea");
  const settingsBtn = document.getElementById("settingsBtn");
  const settingsOverlay = document.getElementById("settingsOverlay");
  const settingsSaveBtn = document.getElementById("settingsSaveBtn");
  const settingsCancelBtn = document.getElementById("settingsCancelBtn");
  const toggleApiKeyBtn = document.getElementById("toggleApiKey");
  const cfgApiKey = document.getElementById("cfgApiKey");
  const cfgBaseUrl = document.getElementById("cfgBaseUrl");
  const cfgModel = document.getElementById("cfgModel");
  const clearBtn = document.getElementById("clearBtn");
  const dbLabel = document.getElementById("dbLabel");
  const sessionSelect = document.getElementById("sessionSelect");
  const sessionNewBtn = document.getElementById("sessionNewBtn");
  const sessionDelBtn = document.getElementById("sessionDelBtn");
  const dbPickerScreen = document.getElementById("dbPickerScreen");
  const dbPicker = document.getElementById("dbPicker");
  const dbPickerConfirm = document.getElementById("dbPickerConfirm");

  // --- State ---
  let history = [];
  let streaming = false;
  let currentStreamText = "";
  let currentStreamBubble = null;
  /** 主编排流式文本（与 stream-chunk stream=main 对齐） */
  let streamMainText = "";
  /** delegationId -> subagent 流式 markdown 原文 */
  let streamSubBuffers = {};
  /** 主编排意图（agent-trace plan 事件） */
  let streamPlanIntent = "";
  /** 主编排计划步骤（agent-trace plan 事件） */
  let streamPlanSteps = [];
  /** 子 Agent 元数据按到达顺序排列（agent-trace subagent 事件），用于持久化复原 */
  let streamSubMetaList = [];
  /** delegationId -> meta 索引，避免重复 */
  let streamSubMetaMap = {};

  /** @type {{ id:string, title:string, dbId:string, history:{role:string,content:string,html?:string}[] }[]} */
  let sessions = [];
  let currentSessionId = "";
  let persistTimer = null;

  /** 扩展下发的数据库选项 [{id,name}] */
  var dbOptions = [];

  /** 主编排 task 与计划步骤 agent 字段的归一化匹配 */
  function normalizePlanAgentKey(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/_/g, "")
      .replace(/\s+/g, "");
  }

  function planAgentKeysMatch(planAgent, subagentType) {
    var a = normalizePlanAgentKey(planAgent);
    var b = normalizePlanAgentKey(subagentType);
    if (!a || !b) {
      return false;
    }
    if (a === b) {
      return true;
    }
    if (a.indexOf(b) !== -1 || b.indexOf(a) !== -1) {
      return true;
    }
    return false;
  }

  function newSessionId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return "s" + Date.now() + Math.random().toString(16).slice(2);
  }

  function schedulePersist() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(function () {
      persistTimer = null;
      vscode.postMessage({
        command: "persistSessions",
        sessions: sessions.map(function (s) {
          return {
            id: s.id, title: s.title, dbId: s.dbId || "",
            history: s.history.map(function (m) {
              var out = { role: m.role, content: m.content, html: m.html || "" };
              if (m.role === "assistant") {
                if (m.intent) { out.intent = m.intent; }
                if (Array.isArray(m.plan) && m.plan.length) { out.plan = m.plan; }
                if (Array.isArray(m.agents) && m.agents.length) { out.agents = m.agents; }
              }
              return out;
            }),
          };
        }),
        currentSessionId: currentSessionId,
      });
    }, 400);
  }

  function getCurrentSession() {
    return sessions.find(function (s) { return s.id === currentSessionId; });
  }

  function ensureCurrentSession() {
    if (!sessions.length) {
      var id = newSessionId();
      sessions.push({ id: id, title: "新会话", dbId: "", history: [] });
      currentSessionId = id;
      return;
    }
    if (!sessions.some(function (s) { return s.id === currentSessionId; })) {
      currentSessionId = sessions[0].id;
    }
  }

  function syncHistoryToSession() {
    var cur = getCurrentSession();
    if (cur) cur.history = history.slice();
  }

  function refreshSessionSelect() {
    sessionSelect.innerHTML = "";
    sessions.forEach(function (s) {
      var opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.title || "未命名";
      sessionSelect.appendChild(opt);
    });
    sessionSelect.value = currentSessionId;
  }

  // --- 数据库选择屏 ---

  function showDbPicker() {
    dbPickerScreen.classList.remove("hidden");
    chatMessages.style.display = "none";
    chatInputArea.style.display = "none";
    populateDbPicker();
  }

  function hideDbPicker() {
    dbPickerScreen.classList.add("hidden");
    chatMessages.style.display = "";
    chatInputArea.style.display = "";
  }

  function populateDbPicker() {
    dbPicker.innerHTML = '<option value="" disabled selected>-- 请选择 --</option>';
    dbOptions.forEach(function (o) {
      if (!o.id || o.id === "__empty__") return;
      var opt = document.createElement("option");
      opt.value = o.id;
      opt.textContent = o.name || o.id;
      dbPicker.appendChild(opt);
    });
    dbPickerConfirm.disabled = true;
  }

  dbPicker.addEventListener("change", function () {
    dbPickerConfirm.disabled = !dbPicker.value;
  });

  dbPickerConfirm.addEventListener("click", function () {
    var val = dbPicker.value;
    if (!val) return;
    var cur = getCurrentSession();
    if (!cur) return;
    cur.dbId = val;
    var label = "";
    for (var i = 0; i < dbOptions.length; i++) {
      if (dbOptions[i].id === val) { label = dbOptions[i].name || val; break; }
    }
    dbLabel.textContent = label;
    hideDbPicker();
    rebuildMessagesFromHistory();
    schedulePersist();
    vscode.postMessage({ command: "requestTables", dbId: val });
  });

  // --- 聊天视图 ---

  function rebuildMessagesFromHistory() {
    chatMessages.innerHTML = "";
    if (!history.length) {
      var cur = getCurrentSession();
      var dbName = cur && cur.dbId ? cur.dbId.split("/").pop() : "";
      chatMessages.innerHTML =
        '<div class="welcome-msg">' +
        '<div class="welcome-icon">&#x1F4AC;</div>' +
        '<div class="welcome-title">你好，我是数据库 AI 助手</div>' +
        '<div class="welcome-hint">当前数据库: <b>' + escapeHtml(dbName || "未知") + '</b><br/>输入 <b>@</b> 可插入表名，Enter 发送。</div>' +
        "</div>";
      return;
    }
    for (var i = 0; i < history.length; i++) {
      var h = history[i];
      if (h.role === "user") {
        appendUserBubble(h.content, h.html);
      } else if (h.role === "assistant") {
        var bubble = appendAssistantBubble();
        restoreAssistantOrchestration(bubble, h);
        renderMarkdown(bubble, h.content || "");
        addCopyButtons(getMdHost(bubble));
      }
    }
  }

  /** 历史回放：根据 history 中持久化的 plan/agents 复原时间线+折叠面板 */
  function restoreAssistantOrchestration(bubble, h) {
    if (!h) { return; }
    var hasPlan = Array.isArray(h.plan) && h.plan.length > 0;
    var hasAgents = Array.isArray(h.agents) && h.agents.length > 0;
    if (!hasPlan && !hasAgents) {
      return;
    }
    if (hasPlan) {
      renderOrchestrationPlan(bubble, h.intent || "", h.plan);
    } else {
      // 没有 plan 但有 agents 时，仍然显示意图行（如有）并展开容器
      showOrchRoot(bubble);
      var root = getOrchRoot(bubble);
      var intentEl = root ? root.querySelector(".orc-plan-intent-line") : null;
      if (intentEl && h.intent) {
        intentEl.style.display = "";
        intentEl.textContent = "执行计划（主编排）· 意图：" + h.intent;
      }
    }
    if (hasAgents) {
      for (var ai = 0; ai < h.agents.length; ai++) {
        var ag = h.agents[ai] || {};
        var did = typeof ag.delegationId === "number" ? ag.delegationId : 0;
        var md = bindSubagentToPlanOrAppend(
          bubble,
          ag.subagentType || "subagent",
          ag.description || "",
          did,
        );
        if (md) {
          renderMarkdownInto(md, ag.content || "");
          addCopyButtons(md);
        }
      }
    }
    refreshLayuiCollapse(bubble);
  }

  function applySession(id) {
    ensureCurrentSession();
    var s = sessions.find(function (x) { return x.id === id; });
    if (!s) return;
    currentSessionId = id;
    history = (s.history || []).map(function (m) {
      var hm = { role: m.role, content: m.content, html: m.html || "" };
      if (m.role === "assistant") {
        if (typeof m.intent === "string" && m.intent) { hm.intent = m.intent; }
        if (Array.isArray(m.plan) && m.plan.length) { hm.plan = m.plan.slice(); }
        if (Array.isArray(m.agents) && m.agents.length) { hm.agents = m.agents.slice(); }
      }
      return hm;
    });
    streaming = false;
    currentStreamText = "";
    streamMainText = "";
    streamSubBuffers = {};
    streamPlanIntent = "";
    streamPlanSteps = [];
    streamSubMetaList = [];
    streamSubMetaMap = {};
    currentStreamBubble = null;
    refreshSessionSelect();

    if (!s.dbId) {
      showDbPicker();
    } else {
      hideDbPicker();
      var label = "";
      for (var i = 0; i < dbOptions.length; i++) {
        if (dbOptions[i].id === s.dbId) { label = dbOptions[i].name || s.dbId; break; }
      }
      dbLabel.textContent = label || s.dbId;
      rebuildMessagesFromHistory();
      scrollToBottom();
      vscode.postMessage({ command: "requestTables", dbId: s.dbId });
    }
  }

  function updateCurrentTitleFromFirstUser() {
    var cur = getCurrentSession();
    if (!cur) return;
    var first = (cur.history || []).find(function (m) { return m.role === "user"; });
    if (first && first.content) {
      var t = first.content.replace(/\s+/g, " ").trim();
      if (t.length > 36) t = t.slice(0, 36) + "…";
      cur.title = t || "新会话";
    }
    refreshSessionSelect();
  }

  // --- ChatArea 初始化（@ 插入表名） ---
  var EMPTY_TABLE_HINT = [{ id: "__empty__", name: "加载中…" }];

  const chat = new ChatArea({
    elm: chatInput,
    maxLength: 8000,
    userList: EMPTY_TABLE_HINT,
    wrapKeyFun: function (event) {
      return event.shiftKey && event.key === "Enter";
    },
    sendKeyFun: function (event) {
      return !event.shiftKey && event.key === "Enter";
    },
  });

  try {
    chat.revisePCPointDialogLabel({ title: "选择数据表" });
  } catch (_e) {}

  chat.addEventListener("enterSend", onSend);

  /** 工具条与编排面板容器（与 Markdown 正文分离，避免 renderMarkdown 覆盖） */
  function getToolHost(bubble) {
    return bubble.querySelector(".msg-bubble-tools") || bubble;
  }

  function getMdHost(bubble) {
    return bubble.querySelector(".msg-bubble-main-md") || bubble.querySelector(".msg-bubble-md") || bubble;
  }

  function getOrchRoot(bubble) {
    return bubble ? bubble.querySelector(".agent-layui-orchestration") : null;
  }

  function getOrchTimeline(bubble) {
    var root = getOrchRoot(bubble);
    return root ? root.querySelector(".orch-plan-timeline") : null;
  }

  function clearLayuiOrchestration(bubble) {
    var root = getOrchRoot(bubble);
    if (!root) {
      return;
    }
    var tl = root.querySelector(".orch-plan-timeline");
    if (tl) {
      tl.innerHTML = "";
    }
    var intent = root.querySelector(".orc-plan-intent-line");
    if (intent) {
      intent.textContent = "";
      intent.style.display = "none";
    }
    root.style.display = "none";
  }

  function showOrchRoot(bubble) {
    var root = getOrchRoot(bubble);
    if (root) {
      root.style.display = "";
    }
  }

  function formatPlanStepCollapseTitle(st, idx) {
    if (st && st.input && typeof st.input === "object") {
      var d = st.input.description;
      if (typeof d === "string" && d.trim()) {
        return d.trim();
      }
    }
    var sn = st && st.step != null ? String(st.step) : String(idx + 1);
    return "步骤 " + sn;
  }

  function refreshLayuiCollapse(scopeEl) {
    try {
      if (typeof window.layui === "undefined" || !window.layui || !window.layui.use) {
        return;
      }
      window.layui.use(["element"], function () {
        var element = window.layui.element;
        var $ = window.layui.$;
        if (!$ || !element) {
          return;
        }
        var $root = scopeEl ? $(scopeEl) : $(document.body);
        $root.find(".layui-collapse").each(function () {
          try {
            element.render("collapse", $(this));
          } catch (_e) {}
        });
      });
    } catch (_e2) {}
  }

  /** 计划步骤：时间线标题为 agent，折叠标题为任务描述 */
  function buildPlanTimelineItems(steps, intent) {
    var html = "";
    for (var i = 0; i < steps.length; i++) {
      var st = steps[i] || {};
      var agent = st.agent != null ? String(st.agent) : "";
      var collapseTitle = escapeHtml(formatPlanStepCollapseTitle(st, i));
      var attrAgent = escapeAttr(agent);
      html +=
        '<li class="layui-timeline-item orch-plan-li" data-plan-agent="' +
        attrAgent +
        '" data-step-index="' +
        i +
        '">' +
        '<span class="layui-timeline-axis orch-tl-axis" aria-hidden="true"></span>' +
        '<div class="layui-timeline-content layui-text">' +
        '<div class="layui-timeline-title">' +
        escapeHtml(agent || "（未命名 agent）") +
        "</div>" +
        '<div class="layui-collapse orch-step-collapse" lay-filter="orch-colla">' +
        '<div class="layui-colla-item">' +
        '<h2 class="layui-colla-title">' +
        collapseTitle +
        "</h2>" +
        '<div class="layui-colla-content layui-show">' +
        '<div class="msg-bubble-md orch-sub-md"></div>' +
        "</div></div></div></div></li>";
    }
    return html;
  }

  /** 无计划时追加一条时间线：时间线标题为 subagent，折叠标题为 description */
  function appendStandaloneOrchestrationLi(bubble, subagentType, description, delegationId) {
    var tl = getOrchTimeline(bubble);
    if (!tl) {
      return null;
    }
    var li = document.createElement("li");
    li.className = "layui-timeline-item orch-plan-li orch-standalone-li";
    li.setAttribute("data-plan-agent", subagentType || "");
    li.setAttribute("data-delegation-id", String(delegationId));
    li.innerHTML =
      '<span class="layui-timeline-axis orch-tl-axis" aria-hidden="true"></span>' +
      '<div class="layui-timeline-content layui-text">' +
      '<div class="layui-timeline-title">' +
      escapeHtml(subagentType || "subagent") +
      "</div>" +
      '<div class="layui-collapse orch-step-collapse" lay-filter="orch-colla">' +
      '<div class="layui-colla-item">' +
      '<h2 class="layui-colla-title">' +
      escapeHtml((description || "子 Agent 输出").slice(0, 400)) +
      (description && description.length > 400 ? "…" : "") +
      "</h2>" +
      '<div class="layui-colla-content layui-show">' +
      '<div class="msg-bubble-md orch-sub-md" data-delegation-id="' +
      escapeAttr(String(delegationId)) +
      '"></div></div></div></div></li>';
    tl.appendChild(li);
    refreshLayuiCollapse(li);
    return li.querySelector(".orch-sub-md");
  }

  /** 将委派绑定到计划中第一个未占用的同 agent 步骤，或追加独立节点 */
  function bindSubagentToPlanOrAppend(bubble, subagentType, description, delegationId) {
    var tl = getOrchTimeline(bubble);
    if (!tl) {
      return null;
    }
    var items = tl.querySelectorAll(".orch-plan-li");
    var i;
    var targetMd = null;
    for (i = 0; i < items.length; i++) {
      var li = items[i];
      if (li.getAttribute("data-delegation-id")) {
        continue;
      }
      var pa = li.getAttribute("data-plan-agent") || "";
      if (planAgentKeysMatch(pa, subagentType)) {
        li.setAttribute("data-delegation-id", String(delegationId));
        var titleEl = li.querySelector(".layui-colla-title");
        if (titleEl && description) {
          titleEl.textContent = description.length > 400 ? description.slice(0, 400) + "…" : description;
        }
        var md = li.querySelector(".orch-sub-md");
        if (md) {
          md.setAttribute("data-delegation-id", String(delegationId));
        }
        targetMd = md;
        refreshLayuiCollapse(li);
        break;
      }
    }
    if (!targetMd) {
      targetMd = appendStandaloneOrchestrationLi(bubble, subagentType, description, delegationId);
    }
    return targetMd;
  }

  function renderMarkdownInto(mdEl, text) {
    if (!mdEl) {
      return;
    }
    if (!text) {
      mdEl.innerHTML = "";
      return;
    }
    try {
      var normalized = normalizeMarkdownForGfmTables(text);
      mdEl.innerHTML = marked.parse(normalized, { breaks: true, gfm: true });
      wrapMarkdownTablesCollapsible(mdEl);
    } catch (_e) {
      mdEl.textContent = text;
    }
  }

  /** 渲染主编排计划区（意图 + 时间线步骤）；steps 为空时显示「无步骤」占位 */
  function renderOrchestrationPlan(bubble, intent, steps) {
    showOrchRoot(bubble);
    var root = getOrchRoot(bubble);
    var intentEl = root ? root.querySelector(".orc-plan-intent-line") : null;
    if (intentEl) {
      intentEl.style.display = "";
      intentEl.textContent = "执行计划（主编排）· 意图：" + (intent || "（未填写）");
    }
    var tl = getOrchTimeline(bubble);
    if (!tl) {
      return;
    }
    if (Array.isArray(steps) && steps.length) {
      tl.innerHTML = buildPlanTimelineItems(steps, intent);
    } else {
      tl.innerHTML =
        '<li class="layui-timeline-item orch-plan-li">' +
        '<span class="layui-timeline-axis orch-tl-axis" aria-hidden="true"></span>' +
        '<div class="layui-timeline-content layui-text">' +
        '<div class="layui-timeline-title">（无步骤）</div>' +
        '<div class="layui-collapse orch-step-collapse" lay-filter="orch-colla">' +
        '<div class="layui-colla-item">' +
        '<h2 class="layui-colla-title">等待主编排</h2>' +
        '<div class="layui-colla-content layui-show">' +
        '<div class="msg-bubble-md orch-sub-md"></div></div></div></div></li>';
    }
    refreshLayuiCollapse(tl);
  }

  function renderSubagentDelegation(bubble, delegationId, text) {
    var root = getOrchRoot(bubble);
    if (!root) {
      return;
    }
    var idStr = String(delegationId);
    var md = root.querySelector('.orch-sub-md[data-delegation-id="' + idStr.replace(/"/g, '\\"') + '"]');
    if (md) {
      renderMarkdownInto(md, text);
    }
  }

  function updateTableList(tags) {
    var list = Array.isArray(tags) && tags.length > 0 ? tags : EMPTY_TABLE_HINT;
    try { chat.updateUserList(list); } catch (_e) {}
  }

  // --- 通知 Extension 就绪 ---
  vscode.postMessage({ command: "ready" });

  // --- 消息发送 ---
  function onSend() {
    if (streaming) return;
    var cur = getCurrentSession();
    if (!cur || !cur.dbId) return;
    var text = (chat.getText() || "").trim();
    if (!text) return;
    var html = chat.getHtml() || "";

    removeWelcome();
    appendUserBubble(text, html);
    history.push({ role: "user", content: text, html: html });
    syncHistoryToSession();
    updateCurrentTitleFromFirstUser();
    schedulePersist();

    chat.clear();

    streaming = true;
    currentStreamText = "";
    streamMainText = "";
    streamSubBuffers = {};
    streamPlanIntent = "";
    streamPlanSteps = [];
    streamSubMetaList = [];
    streamSubMetaMap = {};
    currentStreamBubble = appendAssistantBubble();
    showTyping(currentStreamBubble);

    vscode.postMessage({
      command: "send",
      text: text,
      dbId: cur.dbId,
      history: history.map(function (m) {
        return { role: m.role, content: m.content };
      }),
    });
  }

  // --- 接收 Extension 消息 ---
  window.addEventListener("message", function (event) {
    var msg = event.data;
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case "init":
        if (msg.config) {
          cfgApiKey.value = msg.config.apiKey || "";
          cfgBaseUrl.value = msg.config.baseUrl || "";
          cfgModel.value = msg.config.model || "";
        }
        dbOptions = Array.isArray(msg.dbOptions) ? msg.dbOptions : [];
        if (Array.isArray(msg.sessions) && msg.sessions.length) {
          sessions = msg.sessions.map(function (s) {
            return {
              id: s.id,
              title: s.title || "会话",
              dbId: s.dbId || "",
              history: Array.isArray(s.history)
                ? s.history.map(function (m) {
                    var hm = { role: m.role, content: m.content, html: m.html || "" };
                    if (m.role === "assistant") {
                      if (typeof m.intent === "string" && m.intent) { hm.intent = m.intent; }
                      if (Array.isArray(m.plan) && m.plan.length) { hm.plan = m.plan.slice(); }
                      if (Array.isArray(m.agents) && m.agents.length) { hm.agents = m.agents.slice(); }
                    }
                    return hm;
                  })
                : [],
            };
          });
          currentSessionId = msg.currentSessionId || sessions[0].id;
        } else {
          var nid = newSessionId();
          sessions = [{ id: nid, title: "新会话", dbId: "", history: [] }];
          currentSessionId = nid;
        }
        ensureCurrentSession();
        applySession(currentSessionId);
        break;

      case "refresh":
        dbOptions = Array.isArray(msg.dbOptions) ? msg.dbOptions : dbOptions;
        if (dbPickerScreen && !dbPickerScreen.classList.contains("hidden")) {
          populateDbPicker();
        }
        break;

      case "updateTableTags":
        updateTableList(msg.tableTags);
        break;

      case "stream-start":
        currentStreamText = "";
        streamMainText = "";
        streamSubBuffers = {};
        streamPlanIntent = "";
        streamPlanSteps = [];
        streamSubMetaList = [];
        streamSubMetaMap = {};
        if (currentStreamBubble) {
          hideTyping(currentStreamBubble);
          clearLayuiOrchestration(currentStreamBubble);
        }
        break;

      case "agent-trace":
        if (!currentStreamBubble) break;
        if (msg.kind === "plan") {
          var intent = typeof msg.intent === "string" ? msg.intent : "";
          var steps = Array.isArray(msg.plan) ? msg.plan : [];
          // 记录到流式缓存，供 stream-end 持久化
          streamPlanIntent = intent;
          streamPlanSteps = steps.slice();
          renderOrchestrationPlan(currentStreamBubble, intent, steps);
        } else if (msg.kind === "subagent") {
          var subName =
            typeof msg.subagentType === "string" ? msg.subagentType : "";
          var desc =
            typeof msg.description === "string" ? msg.description : "";
          var delegId =
            typeof msg.delegationId === "number" ? msg.delegationId : parseInt(msg.delegationId, 10);
          if (isNaN(delegId)) {
            delegId = 0;
          }
          // 登记 subagent 元数据；同 delegationId 只记录一次
          if (!streamSubMetaMap[delegId]) {
            var meta = { subagentType: subName, description: desc, delegationId: delegId };
            streamSubMetaMap[delegId] = meta;
            streamSubMetaList.push(meta);
          }
          showOrchRoot(currentStreamBubble);
          bindSubagentToPlanOrAppend(currentStreamBubble, subName, desc, delegId);
          if (streamSubBuffers[delegId]) {
            renderSubagentDelegation(currentStreamBubble, delegId, streamSubBuffers[delegId]);
          }
        }
        scrollToBottom();
        break;

      case "tool-start":
        if (currentStreamBubble) {
          hideTyping(currentStreamBubble);
          appendToolCallIndicator(currentStreamBubble, msg.toolName || "tool", msg.input || "", true);
        }
        break;

      case "tool-end":
        if (currentStreamBubble) {
          appendToolCallIndicator(currentStreamBubble, msg.toolName || "tool", msg.output || "", false);
        }
        scrollToBottom();
        break;

      case "stream-chunk":
        currentStreamText += msg.text || "";
        if (currentStreamBubble) {
          var st = msg.stream === "subagent" ? "subagent" : "main";
          if (st === "subagent" && msg.delegationId != null) {
            var did = msg.delegationId;
            streamSubBuffers[did] = (streamSubBuffers[did] || "") + (msg.text || "");
            renderSubagentDelegation(currentStreamBubble, did, streamSubBuffers[did]);
          } else {
            streamMainText += msg.text || "";
            renderMarkdown(currentStreamBubble, streamMainText);
          }
        }
        scrollToBottom();
        break;

      case "stream-end":
        streaming = false;
        if (currentStreamText || streamMainText || streamSubMetaList.length) {
          // 主文本优先用 streamMainText（仅 main agent token），缺失时回退到 currentStreamText
          var mainContent = streamMainText || currentStreamText || "";
          // agents 顺序按到达 task 工具委派的次序，与 UI 一致
          var agentSections = streamSubMetaList.map(function (meta) {
            return {
              subagentType: meta.subagentType,
              description: meta.description,
              delegationId: meta.delegationId,
              content: streamSubBuffers[meta.delegationId] || "",
            };
          });
          var record = { role: "assistant", content: mainContent };
          if (streamPlanIntent) { record.intent = streamPlanIntent; }
          if (streamPlanSteps.length) { record.plan = streamPlanSteps.slice(); }
          if (agentSections.length) { record.agents = agentSections; }
          history.push(record);
          syncHistoryToSession();
          schedulePersist();
        }
        if (currentStreamBubble) {
          renderMarkdown(currentStreamBubble, streamMainText);
          var orch = getOrchRoot(currentStreamBubble);
          if (orch) {
            var subs = orch.querySelectorAll(".orch-sub-md");
            for (var si = 0; si < subs.length; si++) {
              var sid = subs[si].getAttribute("data-delegation-id");
              if (sid != null && streamSubBuffers[sid] != null) {
                renderMarkdownInto(subs[si], streamSubBuffers[sid]);
              }
            }
          }
          addCopyButtons(getMdHost(currentStreamBubble));
          if (orch) {
            var subs2 = orch.querySelectorAll(".orch-sub-md");
            for (var sj = 0; sj < subs2.length; sj++) {
              addCopyButtons(subs2[sj]);
            }
          }
          refreshLayuiCollapse(currentStreamBubble);
        }
        currentStreamBubble = null;
        streamMainText = "";
        streamSubBuffers = {};
        streamPlanIntent = "";
        streamPlanSteps = [];
        streamSubMetaList = [];
        streamSubMetaMap = {};
        scrollToBottom();
        break;

      case "stream-error":
        streaming = false;
        if (currentStreamBubble) currentStreamBubble.closest(".msg-row")?.remove();
        currentStreamBubble = null;
        appendErrorBubble(msg.error || "请求失败");
        scrollToBottom();
        break;
    }
  });

  // --- 会话管理 ---
  sessionSelect.addEventListener("change", function () {
    syncHistoryToSession();
    applySession(sessionSelect.value);
    schedulePersist();
  });

  sessionNewBtn.addEventListener("click", function () {
    syncHistoryToSession();
    var id = newSessionId();
    sessions.unshift({ id: id, title: "新会话", dbId: "", history: [] });
    currentSessionId = id;
    history = [];
    streaming = false;
    currentStreamText = "";
    streamMainText = "";
    streamSubBuffers = {};
    streamPlanIntent = "";
    streamPlanSteps = [];
    streamSubMetaList = [];
    streamSubMetaMap = {};
    currentStreamBubble = null;
    refreshSessionSelect();
    showDbPicker();
    schedulePersist();
  });

  sessionDelBtn.addEventListener("click", function () {
    if (sessions.length <= 1) {
      if (!confirm("确定清空当前会话？聊天记录与数据库绑定将被重置，且无法恢复。")) {
        return;
      }
      var cur = getCurrentSession();
      if (cur) {
        cur.history = [];
        cur.dbId = "";
        cur.title = "新会话";
        history = [];
        streaming = false;
        currentStreamText = "";
        streamMainText = "";
        streamSubBuffers = {};
        streamPlanIntent = "";
        streamPlanSteps = [];
        streamSubMetaList = [];
        streamSubMetaMap = {};
        currentStreamBubble = null;
        refreshSessionSelect();
        showDbPicker();
        schedulePersist();
      }
      return;
    }
    if (!confirm("确定删除当前会话？删除后无法恢复。")) {
      return;
    }
    sessions = sessions.filter(function (s) { return s.id !== currentSessionId; });
    currentSessionId = sessions[0].id;
    applySession(currentSessionId);
    schedulePersist();
  });

  // --- DOM helpers ---
  function removeWelcome() {
    var w = chatMessages.querySelector(".welcome-msg");
    if (w) w.remove();
  }

  function appendUserBubble(text, html) {
    var row = document.createElement("div");
    row.className = "msg-row user";
    var bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    if (html) { bubble.innerHTML = html; } else { bubble.textContent = text; }
    var avatar = document.createElement("div");
    avatar.className = "msg-avatar";
    avatar.textContent = "U";
    row.appendChild(bubble);
    row.appendChild(avatar);
    chatMessages.appendChild(row);
    scrollToBottom();
    return row;
  }

  function appendAssistantBubble() {
    var row = document.createElement("div");
    row.className = "msg-row assistant";
    row.innerHTML =
      '<div class="msg-avatar">AI</div>' +
      '<div class="msg-bubble">' +
      '<div class="msg-bubble-tools"></div>' +
      '<div class="agent-layui-orchestration" style="display:none">' +
      '<div class="orc-plan-intent-line" style="display:none"></div>' +
      '<ul class="layui-timeline orch-plan-timeline"></ul>' +
      "</div>" +
      '<div class="msg-bubble-md msg-bubble-main-md"></div>' +
      "</div>";
    chatMessages.appendChild(row);
    scrollToBottom();
    return row.querySelector(".msg-bubble");
  }

  function appendErrorBubble(errText) {
    var row = document.createElement("div");
    row.className = "msg-row assistant";
    row.innerHTML = '<div class="msg-avatar">AI</div><div class="msg-bubble msg-error">' + escapeHtml(errText) + "</div>";
    chatMessages.appendChild(row);
  }

  function showTyping(bubble) {
    var md = getMdHost(bubble);
    md.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
  }

  function hideTyping(bubble) {
    var md = getMdHost(bubble);
    var dots = md.querySelector(".typing-dots");
    if (dots) dots.remove();
  }

  function appendToolCallIndicator(bubble, toolName, detail, isStart) {
    var TOOL_LABELS = {
      execute_sql: "执行 SQL",
      list_tables: "查询表列表",
      describe_table: "查看表结构",
      explain_sql: "EXPLAIN 诊断",
      publish_execution_plan: "同步执行计划",
      task: "委派 Subagent",
    };
    var TOOL_ICONS = {
      execute_sql: "&#9654;",
      list_tables: "&#128203;",
      describe_table: "&#128269;",
      explain_sql: "&#9889;",
      publish_execution_plan: "&#128203;",
      task: "&#128640;",
    };
    var label = TOOL_LABELS[toolName] || toolName;
    var icon = TOOL_ICONS[toolName] || "&#9881;";
    if (toolName === "task" && detail) {
      try {
        var targs = JSON.parse(detail);
        if (targs && targs.subagent_type) {
          label = "委派: " + targs.subagent_type;
        }
      } catch (_e) {}
    }

    var toolHost = getToolHost(bubble);

    if (isStart) {
      var wrapper = document.createElement("details");
      wrapper.className = "tool-panel tool-running";
      wrapper.setAttribute("data-tool", toolName);

      var summary = document.createElement("summary");
      summary.className = "tool-panel-header";
      summary.innerHTML =
        '<span class="tool-panel-icon">' + icon + '</span>' +
        '<span class="tool-panel-label">' + escapeHtml(label) + '</span>' +
        '<span class="tool-panel-status"><span class="tool-spinner"></span> 调用中</span>';
      wrapper.appendChild(summary);

      var inputSection = document.createElement("div");
      inputSection.className = "tool-panel-section";
      var inputTitle = document.createElement("div");
      inputTitle.className = "tool-panel-section-title";
      inputTitle.textContent = "参数";
      inputSection.appendChild(inputTitle);
      var inputPre = document.createElement("pre");
      inputPre.className = "tool-panel-code";
      try {
        var parsed = JSON.parse(detail);
        inputPre.textContent = JSON.stringify(parsed, null, 2);
      } catch (_e) {
        inputPre.textContent = detail || "(无)";
      }
      inputSection.appendChild(inputPre);
      wrapper.appendChild(inputSection);

      var resultSection = document.createElement("div");
      resultSection.className = "tool-panel-section tool-panel-result";
      resultSection.style.display = "none";
      wrapper.appendChild(resultSection);

      toolHost.appendChild(wrapper);
    } else {
      var panels = toolHost.querySelectorAll('.tool-panel.tool-running[data-tool="' + toolName + '"]');
      var target = panels.length > 0 ? panels[panels.length - 1] : null;
      if (target) {
        target.classList.remove("tool-running");
        target.classList.add("tool-done");

        var statusEl = target.querySelector(".tool-panel-status");
        if (statusEl) statusEl.innerHTML = '<span class="tool-panel-check">&#10003;</span> 完成';

        var resultSec = target.querySelector(".tool-panel-result");
        if (resultSec && detail) {
          resultSec.style.display = "";
          var resultTitle = document.createElement("div");
          resultTitle.className = "tool-panel-section-title";
          resultTitle.textContent = "结果";
          resultSec.appendChild(resultTitle);
          var resultPre = document.createElement("pre");
          resultPre.className = "tool-panel-code tool-panel-code-result";
          resultPre.textContent = detail.slice(0, 5000);
          resultSec.appendChild(resultPre);
        }

        target.setAttribute("open", "");
      }
    }
  }

  function scrollToBottom() {
    requestAnimationFrame(function () { chatMessages.scrollTop = chatMessages.scrollHeight; });
  }

  /** 将复制类按钮设为 codicon 图标（不依赖外部模板字符串） */
  function setBtnCodicon(btn, codiconName) {
    btn.innerHTML = '<i class="codicon codicon-' + codiconName + '" aria-hidden="true"></i>';
  }

  function resetCopyIconButton(btn, defaultCodicon) {
    setBtnCodicon(btn, defaultCodicon || "clippy");
  }

  function flashCopyIconButton(btn, ok, defaultCodicon) {
    var def = defaultCodicon || "clippy";
    setBtnCodicon(btn, ok ? "check" : "error");
    setTimeout(function () { setBtnCodicon(btn, def); }, 1500);
  }

  /** 是否为 GFM 表格分隔行（| --- | --- |） */
  function isMarkdownTableSeparatorLine(line) {
    var t = line.trim();
    return t.length >= 3 && /^\|[\s\-:|]+\|\s*$/.test(t);
  }

  /** 是否为 GFM 表格数据/表头行（整行以 | 包裹） */
  function isMarkdownTableRowLine(line) {
    var t = line.trim();
    if (t.length < 3 || t.charAt(0) !== "|") return false;
    if (t.charAt(t.length - 1) !== "|") return false;
    if (isMarkdownTableSeparatorLine(line)) return true;
    return /\|[^|]+\|/.test(t);
  }

  /**
   * 修复模型把「序号/项目符号」与表头粘在同一行导致 GFM 无法识别表格的问题。
   * 例如：`1.| 表名 |`、`• | 列名 |`、`- | 表名 |`（且该行含多个 |）。
   */
  function repairMarkdownTableLineGlue(chunk) {
    if (!chunk) {
      return chunk;
    }
    var lines = chunk.split("\n");
    var out = [];
    var i;
    var line;
    var m;
    for (i = 0; i < lines.length; i++) {
      line = lines[i];
      m = line.match(/^(\s*)(\d+\.)\s*(\|.+)$/);
      if (m) {
        out.push(m[1] + m[2]);
        out.push(m[1]);
        out.push(m[1] + m[3]);
        continue;
      }
      m = line.match(/^(\s*)([•·▪])\s*(\|.+)$/);
      if (m) {
        out.push(m[1]);
        out.push(m[1]);
        out.push(m[1] + m[3]);
        continue;
      }
      m = line.match(/^(\s*)([-*+])\s+(\|.+)$/);
      if (m && (m[3].match(/\|/g) || []).length >= 2) {
        out.push(m[1]);
        out.push(m[1]);
        out.push(m[1] + m[3]);
        continue;
      }
      m = line.match(/^(\s*)([（(]\d+[）)])\s*(\|.+)$/);
      if (m) {
        out.push(m[1] + m[2]);
        out.push(m[1]);
        out.push(m[1] + m[3]);
        continue;
      }
      out.push(line);
    }
    return out.join("\n");
  }

  /**
   * 修复模型常见输出：正文与表格之间只有单个换行，GFM 不会识别为表格，整段会变成「乱码」纯文本。
   * 在 ``` 围栏外：若上一行不是表格行且非空，下一行是表格行，则插入空行；并处理「共 N 行。|」粘在同一行的情况。
   */
  function normalizeMarkdownForGfmTables(src) {
    if (!src) return src;
    var parts = src.split(/(```[\s\S]*?```)/g);
    for (var p = 0; p < parts.length; p++) {
      if (p % 2 === 1) continue;
      var chunk = parts[p];
      chunk = chunk.replace(/([。！？…])\s*\|/g, "$1\n\n|");
      chunk = chunk.replace(/(共\s*\d+\s*行)([。.])\s*(\|)/g, "$1$2\n\n$3");
      chunk = repairMarkdownTableLineGlue(chunk);
      var lines = chunk.split("\n");
      var out = [];
      for (var i = 0; i < lines.length; i++) {
        if (i > 0) {
          var prevTrim = lines[i - 1].trim();
          var curTrim = lines[i].trim();
          var prevIsTable =
            prevTrim !== "" &&
            (isMarkdownTableRowLine(lines[i - 1]) || isMarkdownTableSeparatorLine(lines[i - 1]));
          var curIsTable =
            curTrim !== "" &&
            (isMarkdownTableRowLine(lines[i]) || isMarkdownTableSeparatorLine(lines[i]));
          if (curIsTable && !prevIsTable && prevTrim !== "") {
            if (out.length > 0 && out[out.length - 1] !== "") {
              out.push("");
            }
          }
        }
        out.push(lines[i]);
      }
      parts[p] = out.join("\n");
    }
    return parts.join("");
  }

  /** 将 HTML table 转为 TSV，便于粘贴到 Excel / 表格软件 */
  function htmlTableToTsv(table) {
    if (!table || !table.rows) return "";
    var rows = [];
    for (var r = 0; r < table.rows.length; r++) {
      var cells = table.rows[r].cells;
      var line = [];
      for (var c = 0; c < cells.length; c++) {
        var raw = (cells[c].textContent || "").replace(/\r?\n/g, " ").replace(/\t/g, " ");
        line.push(raw.trim());
      }
      rows.push(line.join("\t"));
    }
    return rows.join("\n");
  }

  /**
   * 将气泡内由 Markdown 渲染出的 table 包成可折叠区域，避免一条消息里多张表占满屏幕。
   * 默认折叠，用户点击摘要行展开。
   */
  function wrapMarkdownTablesCollapsible(root) {
    if (!root) return;
    const tables = root.querySelectorAll("table");
    // 关键：所有局部变量都用 let/const，避免 var 在 for 循环中函数作用域共享，
    // 否则点击时 closure 引用的 copyBtn 会指向最后一次迭代的按钮，导致总是复制最后一张表
    for (let i = 0; i < tables.length; i++) {
      const table = tables[i];
      if (table.closest(".md-table-fold")) continue;
      const parent = table.parentNode;
      if (!parent) continue;
      const rowHint = table.rows && table.rows.length ? table.rows.length + " 行" : "表格";
      const details = document.createElement("details");
      details.className = "md-table-fold";
      const summary = document.createElement("summary");
      summary.className = "md-table-fold-summary";
      const titleSpan = document.createElement("span");
      titleSpan.className = "md-table-fold-title";
      titleSpan.textContent = "数据表格（" + rowHint + "，点击展开）";
      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "md-table-copy-btn icon-btn-codicon";
      copyBtn.title = "复制表格（制表符分隔，可粘贴到 Excel）";
      copyBtn.setAttribute("aria-label", "复制表格");
      resetCopyIconButton(copyBtn, "table");
      copyBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        // 点击时取「事件源按钮」所在的折叠块，与闭包变量解耦
        const btn = ev.currentTarget;
        const fold = btn && btn.closest(".md-table-fold");
        const tbl = fold && fold.querySelector(".md-table-fold-body table");
        const tsv = tbl ? htmlTableToTsv(tbl) : "";
        if (!tsv) {
          flashCopyIconButton(btn, false, "table");
          return;
        }
        navigator.clipboard.writeText(tsv).then(function () {
          flashCopyIconButton(btn, true, "table");
        }).catch(function () {
          flashCopyIconButton(btn, false, "table");
        });
      });
      summary.appendChild(titleSpan);
      summary.appendChild(copyBtn);
      const body = document.createElement("div");
      body.className = "md-table-fold-body";
      parent.insertBefore(details, table);
      details.appendChild(summary);
      body.appendChild(table);
      details.appendChild(body);
    }
  }

  function renderMarkdown(bubble, text) {
    var md = getMdHost(bubble);
    if (!text) {
      md.innerHTML = "";
      return;
    }
    try {
      var normalized = normalizeMarkdownForGfmTables(text);
      md.innerHTML = marked.parse(normalized, { breaks: true, gfm: true });
      wrapMarkdownTablesCollapsible(md);
    } catch (_e) {
      md.textContent = text;
    }
  }

  function addCopyButtons(bubble) {
    var pres = bubble.querySelectorAll("pre");
    pres.forEach(function (pre) {
      var wrapper = document.createElement("div");
      wrapper.className = "code-block-wrapper";
      pre.parentNode.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "code-copy-btn icon-btn-codicon";
      btn.title = "复制";
      btn.setAttribute("aria-label", "复制代码");
      resetCopyIconButton(btn, "clippy");
      btn.addEventListener("click", function () {
        var code = pre.querySelector("code");
        navigator.clipboard.writeText((code || pre).textContent || "").then(function () {
          flashCopyIconButton(btn, true, "clippy");
        }).catch(function () {
          flashCopyIconButton(btn, false, "clippy");
        });
      });
      wrapper.appendChild(btn);
    });
  }

  // --- 设置面板 ---
  settingsBtn.addEventListener("click", function () { settingsOverlay.classList.add("visible"); });
  settingsCancelBtn.addEventListener("click", function () { settingsOverlay.classList.remove("visible"); });
  settingsOverlay.addEventListener("click", function (e) { if (e.target === settingsOverlay) settingsOverlay.classList.remove("visible"); });
  settingsSaveBtn.addEventListener("click", function () {
    vscode.postMessage({ command: "saveConfig", apiKey: cfgApiKey.value.trim(), baseUrl: cfgBaseUrl.value.trim(), model: cfgModel.value.trim() });
    settingsOverlay.classList.remove("visible");
  });
  toggleApiKeyBtn.addEventListener("click", function () { cfgApiKey.type = cfgApiKey.type === "password" ? "text" : "password"; });

  clearBtn.addEventListener("click", function () {
    history = [];
    streaming = false;
    currentStreamText = "";
    streamMainText = "";
    streamSubBuffers = {};
    streamPlanIntent = "";
    streamPlanSteps = [];
    streamSubMetaList = [];
    streamSubMetaMap = {};
    currentStreamBubble = null;
    var cur = getCurrentSession();
    if (cur) { cur.history = []; if (sessions.length === 1) cur.title = "新会话"; }
    rebuildMessagesFromHistory();
    schedulePersist();
  });

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /** HTML 属性值转义（含双引号） */
  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, "&quot;");
  }
})();
