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
  - инициализация дефолтных значений storage (`enabled`, `interval`, `customSelectors`) на install/startup
- `content.js`:
  - безопасный старт мониторинга: включено по умолчанию, если `enabled` отсутствует
- `popup.js`:
  - безопасная отправка сообщений в tab + обработка `chrome.runtime.lastError`

## Storage ключи

- `enabled` (boolean, default `true`)
- `interval` (number, default `5000`)
- `customSelectors` (string[], default `[]`)
