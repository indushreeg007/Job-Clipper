importScripts('common.js');

function setup() { chrome.alarms.create('check', { delayInMinutes: 1, periodInMinutes: 60 }); check(); }
chrome.runtime.onInstalled.addListener(setup);
chrome.runtime.onStartup.addListener(setup);
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'check') check(); });
chrome.runtime.onMessage.addListener(m => { if (m && m.type === 'check') check(); });
chrome.storage.onChanged.addListener(c => { if (c.jobs) check(); });
chrome.notifications.onClicked.addListener(id => { chrome.notifications.clear(id); openDashboard(); });

async function check() {
  const [jobs, S] = [await store.jobs(), await store.settings()];
  const { notified = {} } = await chrome.storage.local.get('notified');
  let urgent = 0;
  for (const j of jobs) {
    if (j.status !== 'Saved' || !j.deadline) continue;
    const n = daysLeft(j.deadline);
    if (n <= 3) urgent++;
    const hit = n < 0 ? 'overdue' : S.reminderDays.includes(n) ? String(n) : null;
    if (hit === null) continue;
    const key = `${j.id}:${hit}:${j.deadline}`;
    if (notified[key]) continue;
    notified[key] = Date.now();
    if (S.notify) {
      chrome.notifications.create(key, {
        type: 'basic', iconUrl: 'icons/icon128.png',
        title: n < 0 ? 'Deadline passed' : 'Application deadline: ' + countdown(n).toLowerCase(),
        message: `${j.title}${j.company ? ' at ' + j.company : ''} (${j.deadline})`
      });
    }
  }
  await chrome.storage.local.set({ notified });
  chrome.action.setBadgeBackgroundColor({ color: '#d92d20' });
  chrome.action.setBadgeText({ text: urgent ? String(urgent) : '' });
}
