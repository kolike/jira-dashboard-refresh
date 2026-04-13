# Jira Fast Watcher Pro (Chrome Extension, MV3)

## Запуск как Unpacked Extension (Chrome)

1. Откройте `chrome://extensions`.
2. Включите **Developer mode**.
3. Нажмите **Load unpacked**.
4. Выберите папку проекта `jira-dashboard-refresh`.
5. Перейдите на `https://jira.vseinstrumenti.ru/` и откройте popup расширения.

## Что проверено для старта

- `manifest.json`:
  - `manifest_version: 3`
  - service worker: `background.js`
  - content script: `content.js` для `*://jira.vseinstrumenti.ru/*`
  - popup: `popup.html`
- `background.js`:
  - инициализация дефолтных значений storage (`enabled`, `interval`, `customSelectors`, `jiraPat`, `redJql`, `blueJql`) на install/startup
- `content.js`:
  - API polling Jira (`/rest/api/2/search`) по двум JQL-веткам (красная/синяя)
  - безопасный старт мониторинга: включено по умолчанию, если `enabled` отсутствует
- `popup.js`:
  - безопасная отправка сообщений в tab + обработка `chrome.runtime.lastError`
  - работа в API-режиме (выбор iframe больше не требуется)

## Storage ключи

- `enabled` (boolean, default `true`)
- `interval` (number, default `5000`)
- `customSelectors` (string[], default `[]`)
- `jiraPat` (string, default `""`) — персональный токен Jira (Bearer), опционально
- `redJql` (string) — JQL для красной ветки
- `blueJql` (string) — JQL для синей ветки
