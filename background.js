const DEFAULT_SETTINGS = {
  enabled: true,
  interval: 10,
  token: "",
  baseUrl: "https://jira.vseinstrumenti.ru",
  watchers: [
    {
      id: "kovrov",
      name: "Ковров",
      type: "priority",
      jql: 'project = SUPPORT AND text ~ "Ковров" ORDER BY created DESC'
    },
    {
      id: "regions",
      name: "Регионы",
      type: "transient",
      jql: 'project = SUPPORT AND (text ~ "НЗ" OR text ~ "Влд" OR text ~ "НН" OR text ~ "МСК") ORDER BY created DESC'
    }
  ]
};

let knownIssuesByWatcher = {};
let pollTimer = null;

// --- STORAGE HELPERS ---
const storageGet = (keys) => chrome.storage.local.get(keys);
const storageSet = (obj) => chrome.storage.local.set(obj);

// --- INIT ---
async function init() {
  const res = await storageGet([
    "enabled",
    "interval",
    "token",
    "baseUrl",
    "watchers",
    "knownIssuesByWatcher"
  ]);

  const next = {};

  if (typeof res.enabled !== "boolean") next.enabled = DEFAULT_SETTINGS.enabled;
  if (typeof res.interval !== "number") next.interval = DEFAULT_SETTINGS.interval;
  if (typeof res.token !== "string") next.token = DEFAULT_SETTINGS.token;
  if (typeof res.baseUrl !== "string") next.baseUrl = DEFAULT_SETTINGS.baseUrl;
  if (!Array.isArray(res.watchers)) next.watchers = DEFAULT_SETTINGS.watchers;
  if (typeof res.knownIssuesByWatcher !== "object") next.knownIssuesByWatcher = {};

  if (Object.keys(next).length > 0) {
    await storageSet(next);
  }

  const finalState = await storageGet([
    "enabled",
    "interval",
    "token",
    "baseUrl",
    "watchers",
    "knownIssuesByWatcher"
  ]);

  knownIssuesByWatcher = finalState.knownIssuesByWatcher || {};

  if (finalState.enabled) {
    startPolling(finalState.interval || 10);
  }
}

// --- POLLING ---
function startPolling(interval) {
  if (pollTimer) clearInterval(pollTimer);

  pollTimer = setInterval(() => {
    pollWatchers();
  }, interval * 1000);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// --- API ---
async function fetchIssues(baseUrl, token, jql) {
  const url = `${baseUrl}/rest/api/2/search?jql=${encodeURIComponent(jql)}&maxResults=50&fields=summary`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[JFW] Jira API ERROR:", res.status, text);
    throw new Error(`Jira API error ${res.status}`);
  }

  const json = await res.json();
  console.log("[JFW] Jira API OK, total:", json.total, "returned:", json.issues?.length || 0);
  return json;
}

// --- MAIN LOGIC ---
async function pollWatchers(forceNotify = false) {
  const { enabled, token, baseUrl, watchers } = await storageGet([
    "enabled",
    "token",
    "baseUrl",
    "watchers"
  ]);

  if (!enabled || !token) {
    console.warn("[JFW] disabled or token missing");
    return;
  }

  let changed = false;

  for (const watcher of watchers) {
    try {
      const data = await fetchIssues(baseUrl, token, watcher.jql);
      const issues = Array.isArray(data.issues) ? data.issues : [];

      console.log(`[JFW] watcher=${watcher.id}, issues=${issues.length}`);

      const currentKeys = issues.map(i => i.key).filter(Boolean);
      const known = new Set(knownIssuesByWatcher[watcher.id] || []);

      // Тестовый режим: показать всё, что нашлось
      if (forceNotify) {
        for (const issue of issues) {
          notify(issue, watcher);
        }
        knownIssuesByWatcher[watcher.id] = currentKeys;
        changed = true;
        continue;
      }

      // Первый запуск: просто запоминаем, без спама
      if (!knownIssuesByWatcher[watcher.id]) {
        knownIssuesByWatcher[watcher.id] = currentKeys;
        changed = true;
        console.log(`[JFW] watcher=${watcher.id} initialized with ${currentKeys.length} issues`);
        continue;
      }

      // Обычный режим: уведомляем только о новых
      for (const issue of issues) {
        if (!known.has(issue.key)) {
          console.log(`[JFW] NEW issue ${issue.key} in ${watcher.id}`);
          notify(issue, watcher);
        }
      }

      knownIssuesByWatcher[watcher.id] = currentKeys;
      changed = true;

    } catch (e) {
      console.error(`[JFW] watcher=${watcher?.id} failed`, e);
    }
  }

  if (changed) {
    await storageSet({ knownIssuesByWatcher });
  }
}

// --- NOTIFICATIONS ---
function notify(issue, watcher) {
  const isPriority = watcher.type === "priority";

  chrome.notifications.create(`${watcher.id}:${issue.key}`, {
    type: "basic",
    iconUrl: isPriority ? "icon128_red.png" : "icon128.png",
    title: `${issue.key} · ${watcher.name}`,
    message: issue.fields?.summary || "Новая задача",
    priority: isPriority ? 2 : 1,
    requireInteraction: isPriority
  });

  if (!isPriority) {
    setTimeout(() => {
      chrome.notifications.clear(`${watcher.id}:${issue.key}`);
    }, 5000);
  }
}

// --- EVENTS ---
chrome.runtime.onInstalled.addListener(init);
chrome.runtime.onStartup.addListener(init);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {

    if (msg.type === "SAVE_SETTINGS") {
      await storageSet({
        enabled: msg.enabled,
        interval: msg.interval,
        token: msg.token,
        baseUrl: msg.baseUrl,
        watchers: msg.watchers
      });

      knownIssuesByWatcher = {};
      await storageSet({ knownIssuesByWatcher });

      if (msg.enabled) {
        startPolling(msg.interval);
      } else {
        stopPolling();
      }

      sendResponse({ ok: true });
    }

    if (msg.type === "RUN_NOW") {
  await pollWatchers();
  sendResponse({ ok: true });
}

    if (msg.type === "GET_SETTINGS") {
      const data = await storageGet([
        "enabled",
        "interval",
        "token",
        "baseUrl",
        "watchers"
      ]);
      sendResponse(data);
    }

  })();

  return true;
});

// --- CLICK ---
chrome.notifications.onClicked.addListener((id) => {
  const issueKey = id.split(":")[1];
  chrome.tabs.create({
    url: `https://jira.vseinstrumenti.ru/browse/${issueKey}`
  });
});