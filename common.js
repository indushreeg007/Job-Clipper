const STATUSES = ['Saved', 'Applied', 'Interview', 'Offer', 'Rejected'];
const DEFAULTS = { reminderDays: [7, 3, 1], notify: true };
const $ = (s, r = document) => r.querySelector(s);
const store = {
  async jobs() { return (await chrome.storage.local.get('jobs')).jobs || []; },
  setJobs(jobs) { return chrome.storage.local.set({ jobs }); },
  async settings() { return { ...DEFAULTS, ...(await chrome.storage.local.get('settings')).settings }; }
};
const pad = n => String(n).padStart(2, '0');
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
function normUrl(u) {
  try {
    const x = new URL(u); x.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'trackingId', 'refId'].forEach(k => x.searchParams.delete(k));
    return (x.origin + x.pathname.replace(/\/$/, '') + x.search).toLowerCase();
  } catch { return (u || '').trim().toLowerCase(); }
}
function daysLeft(d) {
  if (!d) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((new Date(d + 'T00:00:00') - t) / 864e5);
}
function countdown(n) {
  if (n == null) return '';
  if (n < 0) return `Overdue by ${-n} day${n === -1 ? '' : 's'}`;
  if (n === 0) return 'Due today';
  if (n === 1) return 'Due tomorrow';
  return `${n} days left`;
}
const safeUrl = u => (/^https?:\/\//i.test(u || '') ? u : '');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const openDashboard = () => chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
