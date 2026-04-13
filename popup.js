const enabledEl = document.getElementById("enabled");
const baseUrlEl = document.getElementById("baseUrl");
const tokenEl = document.getElementById("token");
const intervalEl = document.getElementById("interval");
const jqlPriorityEl = document.getElementById("jqlPriority");
const jqlTransientEl = document.getElementById("jqlTransient");
const saveBtn = document.getElementById("save");
const runNowBtn = document.getElementById("runNow");

const DEFAULT_PRIORITY_JQL =
  'project = SUPPORT AND text ~ "Ковров" ORDER BY created DESC';

const DEFAULT_TRANSIENT_JQL =
  'project = SUPPORT AND (text ~ "НЗ" OR text ~ "Влд" OR text ~ "НН" OR text ~ "МСК") ORDER BY created DESC';

function getWatchers() {
  return [
    {
      id: "kovrov",
      name: "Ковров",
      type: "priority",
      jql: jqlPriorityEl.value.trim()
    },
    {
      id: "regions",
      name: "Регионы",
      type: "transient",
      jql: jqlTransientEl.value.trim()
    }
  ];
}

chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (res) => {
  if (!res) return;

  enabledEl.checked = !!res.enabled;
  baseUrlEl.value = res.baseUrl || "https://jira.vseinstrumenti.ru";
  tokenEl.value = res.token || "";
  intervalEl.value = String(res.interval || 30);

  const priority = (res.watchers || []).find(w => w.id === "kovrov");
  const transient = (res.watchers || []).find(w => w.id === "regions");

  jqlPriorityEl.value = priority?.jql || DEFAULT_PRIORITY_JQL;
  jqlTransientEl.value = transient?.jql || DEFAULT_TRANSIENT_JQL;
});

saveBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({
    type: "SAVE_SETTINGS",
    enabled: enabledEl.checked,
    baseUrl: baseUrlEl.value.trim(),
    token: tokenEl.value.trim(),
    interval: Number(intervalEl.value),
    watchers: getWatchers()
  }, () => {
    window.close();
  });
});

runNowBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({
    type: "SAVE_SETTINGS",
    enabled: enabledEl.checked,
    baseUrl: baseUrlEl.value.trim(),
    token: tokenEl.value.trim(),
    interval: Number(intervalEl.value),
    watchers: getWatchers()
  }, () => {
    chrome.runtime.sendMessage({ type: "RUN_NOW" }, () => {
      window.close();
    });
  });
});