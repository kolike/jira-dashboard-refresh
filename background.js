// background.js

const DEFAULT_SETTINGS = {
  enabled: true,
  interval: 5000,
  customSelectors: [],
  jiraPat: "",
  redJql: 'project = "Рабочее место" AND (Регион = Ковров OR "Регион портал" = "Ковров(офис)") AND resolution = Unresolved AND assignee in (EMPTY)',
  blueJql: 'project = "Рабочее место" AND ( Регион = Владимир OR  Регион = "Не заполнено" OR Регион = Нижний-Новгород  OR Регион = Москва  OR "Регион портал" = "Владимир(офис)"      OR "Регион портал" = "Москва(офис)") AND resolution = Unresolved AND assignee in (EMPTY)'
};
const recentNotifications = new Map();
const DEDUPE_WINDOW_MS = 15000;

function ensureDefaultSettings() {
  chrome.storage.local.get(["enabled", "interval", "customSelectors", "jiraPat", "redJql", "blueJql"], (res) => {
    const next = {};
    if (typeof res.enabled !== "boolean") next.enabled = DEFAULT_SETTINGS.enabled;
    if (typeof res.interval !== "number") next.interval = DEFAULT_SETTINGS.interval;
    if (!Array.isArray(res.customSelectors)) next.customSelectors = DEFAULT_SETTINGS.customSelectors;
    if (typeof res.jiraPat !== "string") next.jiraPat = DEFAULT_SETTINGS.jiraPat;
    if (typeof res.redJql !== "string" || !res.redJql.trim()) next.redJql = DEFAULT_SETTINGS.redJql;
    if (typeof res.blueJql !== "string" || !res.blueJql.trim()) next.blueJql = DEFAULT_SETTINGS.blueJql;
    if (Object.keys(next).length > 0) chrome.storage.local.set(next);
  });
}

// Устанавливаем дефолтные настройки при установке/обновлении и запуске браузера
chrome.runtime.onInstalled.addListener(() => {
  ensureDefaultSettings();
});

chrome.runtime.onStartup.addListener(() => {
  ensureDefaultSettings();
});

// background.js

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "NEW_ISSUE") {
    const now = Date.now();
    const prev = recentNotifications.get(msg.key);
    if (prev && now - prev < DEDUPE_WINDOW_MS) return true;
    recentNotifications.set(msg.key, now);
    if (recentNotifications.size > 1000) {
      for (const [key, ts] of recentNotifications.entries()) {
        if (now - ts > DEDUPE_WINDOW_MS) recentNotifications.delete(key);
      }
    }

    chrome.storage.local.get(["enabled"], (res) => {
      if (res.enabled) {
        const isPriority = msg.notificationType === 'priority';

        // Выбираем иконку в зависимости от типа
        const iconPath = isPriority ? "icon128_red.png" : "icon128.png";

        chrome.notifications.create(msg.key, {
          type: "basic",
          iconUrl: iconPath,                    // ← здесь меняется иконка
          title: msg.key,
          message: msg.summary,
          priority: isPriority ? 2 : 1,
          requireInteraction: isPriority
        });

        // Авто-закрытие: обычные и unknown, priority остаются до клика
        if (!isPriority) {
          setTimeout(() => {
            chrome.notifications.clear(msg.key);
          }, 5000);
        }
      }
    });
  }
  return true;
});

// Открытие задачи по клику (работает для обоих типов)
chrome.notifications.onClicked.addListener((notificationId) => {
  const url = `https://jira.vseinstrumenti.ru/browse/${notificationId}`;
  chrome.tabs.create({ url: url });
  chrome.notifications.clear(notificationId);
});
