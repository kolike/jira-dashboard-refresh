let refreshTimer = null;
let scanTimer = null;
let refreshInterval = 5000;
let knownIssues = new Set();
let initialized = false;
let customSelectors = [];
let isPickerActive = false;

chrome.storage.local.get(["enabled", "interval", "customSelectors"], (data) => {
  refreshInterval = data.interval || 5000;
  customSelectors = data.customSelectors || [];
  const isEnabled = data.enabled !== false;
  if (isEnabled) start();
  setTimeout(scanAllFrames, 2000);
});

function getAllFrames() {
  if (customSelectors && customSelectors.length > 0) {
    return customSelectors.map(s => document.querySelector(s)).filter(el => el !== null);
  }
  return [];
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

        if (key && key.includes('-')) {
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
          knownIssues.add(l.textContent.trim());
        }); 
      } catch(e) {}
    });
    initialized = true;
    return;
  }

  newIssuesFound.forEach(issue => {
    knownIssues.add(issue.key);
    // Отправляем с типом уведомления
    chrome.runtime.sendMessage({ type: "NEW_ISSUE", ...issue });
  });
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
  refreshTimer = setInterval(() => { 
    if (document.hidden) return;

    const frames = getAllFrames();
    if (frames.length === 0) return;

    frames.forEach(f => { try { f.src = f.src; } catch(e){} });
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scanAllFrames();
    }, 1500);
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
