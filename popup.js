const toggleCard = document.getElementById("toggle");
const btnText = document.getElementById("btnText");
const mainIcon = document.getElementById("mainIcon");
const pickBtn = document.getElementById("pickFrame");
const resetBtn = document.getElementById("resetFrames");
const intervalSelect = document.getElementById("interval");
const container = document.getElementById("mainContainer");
const frameCounter = document.getElementById("frameCounter");
const openTutBtn = document.getElementById('openTutorial');

// 1. Функция обновления внешнего вида (Вкл/Выкл)
function updateUI(enabled) {
    if (enabled) {
        container.classList.add("active");
        btnText.textContent = "Мониторинг активен";
        mainIcon.textContent = "🛡️";
    } else {
        container.classList.remove("active");
        btnText.textContent = "Мониторинг выключен";
        mainIcon.textContent = "⚡";
    }
}

// 2. Инициализация при открытии поп-апа
chrome.storage.local.get(["enabled", "interval", "customSelectors"], (data) => {
    const isEnabled = data.enabled !== false;
    updateUI(isEnabled);
    if (data.interval) intervalSelect.value = data.interval;
    
    frameCounter.textContent = "API-режим: выбор блоков не требуется";
    pickBtn.style.opacity = "0.55";
    resetBtn.style.opacity = "0.55";
});

// 3. Клик по главной карточке (Вкл/Выкл)
toggleCard.addEventListener("click", () => {
    chrome.storage.local.get(["enabled"], (data) => {
        const currentState = data.enabled !== false;
        const newState = !currentState;
        chrome.storage.local.set({ enabled: newState }, () => {
            updateUI(newState);
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]?.id) {
                    chrome.tabs.sendMessage(tabs[0].id, { enabled: newState }, () => {
                        void chrome.runtime.lastError;
                    });
                }
            });
        });
    });
});

// 4. Клик по кнопке Прицел
pickBtn.addEventListener("click", () => {
    alert("API-режим активен: выбор iframe больше не используется.");
});

// 5. Клик по кнопке Сброс
resetBtn.addEventListener("click", () => {
    alert("API-режим активен: сброс iframe не требуется.");
});

// 6. Изменение интервала
intervalSelect.addEventListener("change", () => {
    const val = Number(intervalSelect.value);
    chrome.storage.local.set({ interval: val });
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, { interval: val }, () => {
                void chrome.runtime.lastError;
            });
        }
    });
});

// 7. ЛОГИКА ТУТОРИАЛА (Создаем окно на лету)
if (openTutBtn) {
    openTutBtn.onclick = (e) => {
        e.preventDefault();
        const overlay = document.createElement('div');
        overlay.id = "tutOverlay";
        overlay.style = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
            background: rgba(9, 9, 11, 0.98); z-index: 9999; padding: 20px; 
            display: flex; flex-direction: column; gap: 15px; box-sizing: border-box;
            color: white; font-family: sans-serif;
        `;
        overlay.innerHTML = `
            <h2 style="color: #3b82f6; margin: 0; font-size: 20px;">📖 Как пользоваться?</h2>
            <div style="font-size: 14px; line-height: 1.6; color: #cbd5e1;">
                <p>1. 🎯 <b>Прицел</b>: Нажми и выбери блоки в Jira, которые хочешь отслеживать.</p>
                <p>2. 🛡️ <b>Запуск</b>: Нажми на верхнюю большую карточку. Когда она мигает зеленым — слежка идет.</p>
                <p>3. ⏱️ <b>Интервал</b>: Выбери время обновления. 5 секунд — оптимально.</p>
                <p>4. 🧹 <b>Сброс</b>: Нажми, если хочешь выбрать другие очереди.</p>
            </div>
            <button id="closeTut" style="
                background: #3b82f6; color: white; border: none; 
                padding: 14px; border-radius: 12px; font-weight: bold; 
                cursor: pointer; margin-top: auto; font-size: 14px;
            ">ВСЁ ПОНЯТНО</button>
        `;
        document.body.appendChild(overlay);
        document.getElementById('closeTut').onclick = () => overlay.remove();
    };
}

// 8. Слушатель изменений в хранилище (обновляет счетчик сам)
chrome.storage.onChanged.addListener((changes) => {
    if (changes.customSelectors) {
        frameCounter.textContent = "API-режим: выбор блоков не требуется";
    }
    if (changes.enabled) {
        updateUI(changes.enabled.newValue);
    }
});
