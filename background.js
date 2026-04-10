// background.js

const DEFAULT_SETTINGS = {
  enabled: true,
  interval: 5000,
  customSelectors: []
};

function ensureDefaultSettings() {
  chrome.storage.local.get(["enabled", "interval", "customSelectors"], (res) => {
    const next = {};
    if (typeof res.enabled !== "boolean") next.enabled = DEFAULT_SETTINGS.enabled;
    if (typeof res.interval !== "number") next.interval = DEFAULT_SETTINGS.interval;
    if (!Array.isArray(res.customSelectors)) next.customSelectors = DEFAULT_SETTINGS.customSelectors;
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

        // Авто-закрытие для обычных уведомлений
        if (!isPriority && msg.notificationType !== 'unknown') {
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
