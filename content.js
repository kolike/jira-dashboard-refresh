let refreshTimer = null;
let scanTimer = null;
let refreshInterval = 5000;
let knownIssues = new Set();
let knownIssuesQueue = [];
let initialized = false;
let customSelectors = [];
let isPickerActive = false;
const ISSUE_KEY_RE = /^[A-Z][A-Z0-9_]+-\d+$/;
const MAX_KNOWN_ISSUES = 2000;
const ENABLE_NATIVE_GADGET_REFRESH = false;
let lastHardRefreshAt = 0;
let nextFrameRefreshIndex = 0;

chrome.storage.local.get(["enabled", "interval", "customSelectors"], (data) => {
  refreshInterval = data.interval || 5000;
  customSelectors = data.customSelectors || [];
  const isEnabled = data.enabled !== false;
  if (isEnabled) {
    start();
    setTimeout(scanAllFrames, Math.min(1200, Math.max(400, Math.floor(refreshInterval * 0.25))));
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;

  if (changes.customSelectors) {
    customSelectors = Array.isArray(changes.customSelectors.newValue) ? changes.customSelectors.newValue : [];
  }

  if (changes.interval) {
    const nextInterval = Number(changes.interval.newValue);
    if (Number.isFinite(nextInterval) && nextInterval > 0) {
      refreshInterval = nextInterval;
      if (refreshTimer) start();
    }
  }

  if (changes.enabled) {
    changes.enabled.newValue === false ? stop() : start();
  }
});

function getAllFrames() {
  if (customSelectors && customSelectors.length > 0) {
    return customSelectors.map(s => document.querySelector(s)).filter(el => el !== null);
  }
  return [];
}

function rememberIssue(key) {
  if (!key || knownIssues.has(key)) return;
  knownIssues.add(key);
  knownIssuesQueue.push(key);
  if (knownIssuesQueue.length > MAX_KNOWN_ISSUES) {
    const removed = knownIssuesQueue.shift();
    if (removed) knownIssues.delete(removed);
  }
}

// НОВАЯ ФУНКЦИЯ: определяет тип виджета (Ковров или остальные)
function getWidgetType(frameElement) {
  if (!frameElement) return 'unknown';
  
  // Ищем родительский виджет-контейнер
  const widget = frameElement.closest('.gadget, .dashboard-item, .js-dashboard-item');
  if (!widget) return 'unknown';
  
  // Ищем заголовок виджета
  const header = widget.querySelector('.gadget-header, .dashboard-item-header, .gadget-title, .item-title');
  const title = header ? header.textContent.toLowerCase() : '';
  
  // Также проверяем ID виджета
  const widgetId = widget.id ? widget.id.toLowerCase() : '';
  
  // КОВРОВ (красное окно) - приоритетные, не исчезают
  if (title.includes('ковров') || title.includes('kover') || 
      widgetId.includes('kovrov') || widgetId.includes('kover')) {
    return 'priority';
  }
  
  // Остальные регионы (синее окно) - НЗ, Влд, НН, МСК
  if (title.includes('нз') || title.includes('влд') || title.includes('нн') || 
      title.includes('мск') || title.includes('регион') || title.includes('очередь')) {
    return 'transient';
  }
  
  // Если не определили по заголовку, проверяем по содержимому таблицы
  try {
    const doc = frameElement.contentDocument || frameElement.contentWindow.document;
    if (doc) {
      const tableText = doc.body.innerText.toLowerCase();
      if (tableText.includes('ковров')) return 'priority';
      if (tableText.includes('нз') || tableText.includes('влд') || 
          tableText.includes('нн') || tableText.includes('мск')) {
        return 'transient';
      }
    }
  } catch(e) {}
  
  return 'unknown';
}

function scanAllFrames() {
  const frames = getAllFrames();
  if (frames.length === 0) return;

  let newIssuesFound = [];
  const frameTypeCache = new WeakMap();
  
  frames.forEach(frame => {
    try {
      const doc = frame.contentDocument || frame.contentWindow.document;
      if (!doc) return;

      doc.querySelectorAll("tr").forEach(row => {
        const links = Array.from(row.querySelectorAll('a[href*="/browse/"]'));
        if (links.length === 0) return;

        const keyLink = links[0];
        const key = keyLink.textContent.trim();

        if (knownIssues.has(key)) return;

        // Поиск названия (Summary)
        let summary = "";
        const summaryLink = links[1] || links[0]; 
        
        if (summaryLink) {
          summary = summaryLink.getAttribute('title') || summaryLink.textContent.trim();
        }

        if (!summary || summary === key) {
           const cell = row.querySelector('.summary, td:nth-child(2), td:nth-child(3)');
           summary = cell ? cell.textContent.trim() : "";
        }

        summary = summary.replace(/\s+/g, ' ').replace(key, '').trim();

        if (ISSUE_KEY_RE.test(key)) {
          // ОПРЕДЕЛЯЕМ ТИП ВИДЖЕТА для этого тикета
          let widgetType = frameTypeCache.get(frame);
          if (!widgetType) {
            widgetType = getWidgetType(frame);
            frameTypeCache.set(frame, widgetType);
          }
          
          newIssuesFound.push({ 
            key, 
            url: keyLink.href, 
            summary: summary || "Новая задача",
            notificationType: widgetType  // 'priority' или 'transient'
          });
        }
      });
    } catch(e) {}
  });

  if (!initialized) {
    frames.forEach(f => {
      try { 
        f.contentDocument?.querySelectorAll('a[href*="/browse/"]').forEach(l => {
          const key = l.textContent.trim();
          if (ISSUE_KEY_RE.test(key)) rememberIssue(key);
        }); 
      } catch(e) {}
    });
    initialized = true;
    return;
  }

  newIssuesFound.forEach(issue => {
    rememberIssue(issue.key);
    // Отправляем с типом уведомления
    chrome.runtime.sendMessage({ type: "NEW_ISSUE", ...issue });
  });
}

function tryClickNativeRefresh(frame) {
  if (!ENABLE_NATIVE_GADGET_REFRESH) return false;
  try {
    const doc = frame.contentDocument || frame.contentWindow.document;
    if (!doc) return false;

    // Кнопка меню "три точки" в custom-charts gadget.
    const menuButton = doc.querySelector('button.ossa-export-button');
    if (!menuButton) return false;
    menuButton.click();

    // Пункт "Refresh data" появляется в выпадающем меню.
    setTimeout(() => {
      try {
        const refreshIcon = doc.querySelector('[aria-label="Refresh data"]');
        const refreshAction = refreshIcon?.closest('[role="button"], .Item-z6qfkt-2');
        if (refreshAction) refreshAction.click();
      } catch(e) {}
    }, 60);

    return true;
  } catch(e) {
    return false;
  }
}

function getHardRefreshEveryMs() {
  // Разгружаем вкладку: тяжелый reload не чаще, чем раз в 30 сек
  // (или реже, если пользователь выбрал большой интервал).
  return Math.max(30000, refreshInterval * 6);
}

function startPickingSession() {
  if (isPickerActive || document.getElementById("watcher-picker-panel")) return;
  isPickerActive = true;

  let tempSelectors = [...customSelectors];
  const gadgets = document.querySelectorAll('div.gadget, div.dashboard-item, div.js-dashboard-item');
  let panel = null;

  panel = document.createElement('div');
  panel.id = "watcher-picker-panel";
  panel.style = "position:fixed; bottom:20px; left:50%; transform:translateX(-50%); z-index:999999; background:#18181b; border:2px solid #3b82f6; border-radius:12px; padding:12px 20px; display:flex; align-items:center; gap:15px; box-shadow:0 10px 40px #000; color:#fff; font-family:sans-serif;";
  panel.innerHTML = `
    <span>Выбрано: <b id="picker-count">${tempSelectors.length}</b></span>
    <button id="picker-done" style="background:#3b82f6; color:#fff; border:none; border-radius:6px; padding:8px 16px; cursor:pointer; font-weight:bold;">Готово</button>
    <button id="picker-cancel" style="background:none; border:none; color:#94a3b8; cursor:pointer;">Отмена</button>
  `;
  document.body.appendChild(panel);

  const highlight = () => {
    gadgets.forEach(g => {
      const s = `#${g.id} iframe`;
      const nextOutline = tempSelectors.includes(s) ? "4px solid #3b82f6" : "2px dashed #3f3f46";
      if (g.style.outline !== nextOutline) g.style.outline = nextOutline;
    });
  };
  highlight();

  const clickHandler = (e) => {
    if (e.target.closest('#watcher-picker-panel')) return;
    e.preventDefault(); e.stopPropagation();
    const g = e.target.closest('div.gadget, div.dashboard-item, div.js-dashboard-item');
    if (g && g.id) {
      const s = `#${g.id} iframe`;
      tempSelectors = tempSelectors.includes(s) ? tempSelectors.filter(i => i !== s) : [...tempSelectors, s];
      document.getElementById('picker-count').textContent = tempSelectors.length;
      highlight();
    }
  };

  document.addEventListener("click", clickHandler, true);

  const cleanupPicker = () => {
    document.removeEventListener("click", clickHandler, true);
    if (panel) panel.remove();
    gadgets.forEach(g => g.style.outline = "");
    isPickerActive = false;
  };

  document.getElementById('picker-done').onclick = () => {
    cleanupPicker();
    chrome.storage.local.set({ customSelectors: tempSelectors }, () => location.reload());
  };
  document.getElementById('picker-cancel').onclick = () => {
    cleanupPicker();
  };
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "START_PICKING") startPickingSession();
  if (msg.action === "RESET_FRAMES") chrome.storage.local.set({ customSelectors: [] }, () => location.reload());
  if (msg.enabled !== undefined) msg.enabled ? start() : stop();
  if (msg.interval) { refreshInterval = msg.interval; if (refreshTimer) start(); }
});

function start() { 
  if (refreshTimer) clearInterval(refreshTimer); 
  if (scanTimer) {
    clearTimeout(scanTimer);
    scanTimer = null;
  }
  lastHardRefreshAt = 0;
  nextFrameRefreshIndex = 0;
  refreshTimer = setInterval(() => { 
    const frames = getAllFrames();
    if (frames.length === 0) return;

    let refreshedFrame = false;
    const now = Date.now();
    if (now - lastHardRefreshAt >= getHardRefreshEveryMs()) {
      lastHardRefreshAt = now;
      const frame = frames[nextFrameRefreshIndex % frames.length];
      nextFrameRefreshIndex = (nextFrameRefreshIndex + 1) % Math.max(frames.length, 1);
      if (frame) {
        const refreshedByNativeButton = tryClickNativeRefresh(frame);
        if (!refreshedByNativeButton) {
          try { frame.src = frame.src; } catch(e){}
        }
        refreshedFrame = true;
      }
    }

    if (!refreshedFrame) {
      scanAllFrames();
      return;
    }

    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scanAllFrames();
    }, 700);
  }, refreshInterval); 
}
function stop() {
  clearInterval(refreshTimer);
  refreshTimer = null;
  if (scanTimer) {
    clearTimeout(scanTimer);
    scanTimer = null;
  }
}
