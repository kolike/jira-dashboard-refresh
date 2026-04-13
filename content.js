let pollTimer = null;
let pollInterval = 5000;
let enabled = true;
let initialized = false;
let jiraPat = "";

const DEFAULT_RED_JQL = 'project = "Рабочее место" AND (Регион = Ковров OR "Регион портал" = "Ковров(офис)") AND resolution = Unresolved AND assignee in (EMPTY)';
const DEFAULT_BLUE_JQL = 'project = "Рабочее место" AND ( Регион = Владимир OR  Регион = "Не заполнено" OR Регион = Нижний-Новгород  OR Регион = Москва  OR "Регион портал" = "Владимир(офис)"      OR "Регион портал" = "Москва(офис)") AND resolution = Unresolved AND assignee in (EMPTY)';

let redJql = DEFAULT_RED_JQL;
let blueJql = DEFAULT_BLUE_JQL;

let seenRed = new Set();
let seenBlue = new Set();

function getHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (jiraPat) headers.Authorization = `Bearer ${jiraPat}`;
  return headers;
}

async function fetchIssues(jql) {
  const res = await fetch("https://jira.vseinstrumenti.ru/rest/api/2/search", {
    method: "POST",
    credentials: "include",
    headers: getHeaders(),
    body: JSON.stringify({
      jql,
      fields: ["key", "summary", "updated"],
      maxResults: 200,
      startAt: 0
    })
  });

  if (!res.ok) throw new Error(`Jira API ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.issues) ? data.issues : [];
}

function notifyNewIssues(issues, seenSet, notificationType) {
  const currentKeys = new Set();

  issues.forEach((issue) => {
    const key = issue?.key;
    if (!key) return;
    currentKeys.add(key);

    if (!initialized) return;
    if (seenSet.has(key)) return;

    chrome.runtime.sendMessage({
      type: "NEW_ISSUE",
      key,
      url: `https://jira.vseinstrumenti.ru/browse/${key}`,
      summary: issue?.fields?.summary || "Новая задача",
      notificationType
    });
  });

  return currentKeys;
}

async function pollOnce() {
  if (!enabled) return;

  try {
    const [redIssues, blueIssues] = await Promise.all([
      fetchIssues(redJql),
      fetchIssues(blueJql)
    ]);

    const nextRed = notifyNewIssues(redIssues, seenRed, "priority") || new Set();
    const nextBlue = notifyNewIssues(blueIssues, seenBlue, "transient") || new Set();

    seenRed = nextRed;
    seenBlue = nextBlue;
    initialized = true;
  } catch (e) {
    // Тихо, чтобы не спамить консоль пользователю.
  }
}

function restartPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  if (!enabled) return;

  pollOnce();
  pollTimer = setInterval(pollOnce, pollInterval);
}

chrome.storage.local.get(["enabled", "interval", "jiraPat", "redJql", "blueJql"], (data) => {
  enabled = data.enabled !== false;
  pollInterval = Number(data.interval) || 5000;
  jiraPat = typeof data.jiraPat === "string" ? data.jiraPat.trim() : "";
  redJql = typeof data.redJql === "string" && data.redJql.trim() ? data.redJql.trim() : DEFAULT_RED_JQL;
  blueJql = typeof data.blueJql === "string" && data.blueJql.trim() ? data.blueJql.trim() : DEFAULT_BLUE_JQL;
  restartPolling();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;

  let shouldRestart = false;

  if (changes.enabled) {
    enabled = changes.enabled.newValue !== false;
    shouldRestart = true;
  }

  if (changes.interval) {
    const nextInterval = Number(changes.interval.newValue);
    if (Number.isFinite(nextInterval) && nextInterval > 0) {
      pollInterval = nextInterval;
      shouldRestart = true;
    }
  }

  if (changes.jiraPat) {
    jiraPat = typeof changes.jiraPat.newValue === "string" ? changes.jiraPat.newValue.trim() : "";
    shouldRestart = true;
  }

  if (changes.redJql) {
    redJql = typeof changes.redJql.newValue === "string" && changes.redJql.newValue.trim()
      ? changes.redJql.newValue.trim()
      : DEFAULT_RED_JQL;
    shouldRestart = true;
  }

  if (changes.blueJql) {
    blueJql = typeof changes.blueJql.newValue === "string" && changes.blueJql.newValue.trim()
      ? changes.blueJql.newValue.trim()
      : DEFAULT_BLUE_JQL;
    shouldRestart = true;
  }

  if (shouldRestart) {
    initialized = false;
    restartPolling();
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.enabled !== undefined) {
    enabled = msg.enabled !== false;
    initialized = false;
    restartPolling();
  }

  if (msg.interval) {
    const nextInterval = Number(msg.interval);
    if (Number.isFinite(nextInterval) && nextInterval > 0) {
      pollInterval = nextInterval;
      initialized = false;
      restartPolling();
    }
  }

  if (msg.action === "START_PICKING" || msg.action === "RESET_FRAMES") {
    // API-режим: выбор iframe больше не нужен.
  }
});
