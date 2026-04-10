// background.js

// Устанавливаем статус "Включено" при первой установке
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ enabled: true });
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