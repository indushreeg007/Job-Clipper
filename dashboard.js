let jobs = [], S = { ...DEFAULTS }, view = 'board';
const F = { q: '', status: '', type: '', location: '', source: '', dl: '', sort: 'saved' };
const FIELDS = [['title', 'Job title', 'text'], ['company', 'Company', 'text'], ['url', 'Application URL', 'url'], ['location', 'Location', 'text'], ['type', 'Job type', 'text'], ['salary', 'Salary / Stipend', 'text'], ['deadline', 'Deadline', 'date'], ['source', 'Source website', 'text'], ['status', 'Status', 'select'], ['dateApplied', 'Date applied', 'date'], ['interviewDate', 'Interview date', 'date'], ['recruiterName', 'Recruiter name', 'text'], ['recruiterEmail', 'Recruiter email', 'email'], ['recruiterPhone', 'Recruiter phone', 'tel']];

async function load() { jobs = await store.jobs(); S = await store.settings(); render(); }
chrome.storage.onChanged.addListener(c => { if (c.jobs || c.settings) load(); });

// ---------- filtering ----------
function visible() {
  const q = F.q.toLowerCase();
  const list = jobs.filter(j => {
    if (q && ![j.company, j.title, j.source, j.status, j.location].join(' ').toLowerCase().includes(q)) return false;
    if (F.status && j.status !== F.status) return false;
    if (F.type && j.type !== F.type) return false;
    if (F.location && j.location !== F.location) return false;
    if (F.source && j.source !== F.source) return false;
    const n = daysLeft(j.deadline);
    if (F.dl === 'overdue' && !(n != null && n < 0)) return false;
    if (F.dl === 'soon' && !(n != null && n >= 0 && n <= 3)) return false;
    if (F.dl === 'week' && !(n != null && n >= 0 && n <= 7)) return false;
    if (F.dl === 'has' && n == null) return false;
    if (F.dl === 'none' && n != null) return false;
    return true;
  });
  const by = { saved: (a, b) => (b.dateSaved || '').localeCompare(a.dateSaved || ''), deadline: (a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'), company: (a, b) => (a.company || '').localeCompare(b.company || ''), title: (a, b) => (a.title || '').localeCompare(b.title || '') };
  return list.sort(by[F.sort]);
}
function fillSel(name, label, key) {
  const el = $(`[name=${name}]`), vals = [...new Set(jobs.map(j => j[key]).filter(Boolean))].sort();
  el.innerHTML = `<option value="">${label}</option>` + vals.map(v => `<option>${esc(v)}</option>`).join('');
  el.value = vals.includes(F[name]) ? F[name] : (F[name] = '');
}

// ---------- rendering ----------
function render() {
  const c = s => jobs.filter(j => j.status === s).length;
  $('#stats').innerHTML = [['Total saved', jobs.length, ''], ['Saved', c('Saved'), 'Saved'], ['Applied', c('Applied'), 'Applied'], ['Interview', c('Interview'), 'Interview'], ['Offers', c('Offer'), 'Offer'], ['Rejected', c('Rejected'), 'Rejected']].map(([l, n, s]) => `<div class="stat" data-s="${s}"><b>${n}</b><span>${l}</span></div>`).join('');
  fillSel('type', 'All job types', 'type'); fillSel('location', 'All locations', 'location'); fillSel('source', 'All websites', 'source');
  $('#bar').hidden = view !== 'board';
  const urgent = jobs.filter(j => j.status === 'Saved' && j.deadline && daysLeft(j.deadline) <= 3).length;
  $('#remBadge').textContent = urgent; $('#remBadge').hidden = !urgent;
  view === 'board' ? board() : reminders();
}
function card(j) {
  const n = daysLeft(j.deadline), cls = j.status !== 'Saved' || n == null ? '' : n < 0 ? 'bad' : n <= 3 ? 'warn' : '';
  return `<article class="card" draggable="true" data-id="${j.id}"><b>${esc(j.title)}</b><div class="co">${esc(j.company) || '<i>No company</i>'}</div>
  <div class="meta">${j.deadline ? `<span class="pill ${cls}">Deadline ${esc(j.deadline)} · ${countdown(n)}</span>` : ''}${j.source ? `<span class="pill">${esc(j.source)}</span>` : ''}<span class="pill st" data-s="${j.status}">${j.status}</span></div>
  ${safeUrl(j.url) ? `<a href="${esc(j.url)}" target="_blank" rel="noopener">Open application ↗</a>` : ''}</article>`;
}
function board() {
  const list = visible();
  $('#main').innerHTML = `<div class="board">${STATUSES.map(s => { const c = list.filter(j => j.status === s); return `<section class="col" data-s="${s}"><h3>${s}<span>${c.length}</span></h3><div class="cards">${c.map(card).join('') || '<p class="empty">Drag a job here</p>'}</div></section>`; }).join('')}</div>`;
}
function reminders() {
  const sv = jobs.filter(j => j.status === 'Saved' && j.deadline).map(j => ({ j, n: daysLeft(j.deadline) })).sort((a, b) => a.n - b.n);
  const grp = (t, items, cls) => items.length ? `<h3 class="rh">${t} <span>${items.length}</span></h3>${items.map(({ j, n }) => `<div class="row ${cls}" data-id="${j.id}"><div><b>${esc(j.title)}</b><small>${esc(j.company)}${j.source ? ' · ' + esc(j.source) : ''}</small></div><span class="due">${esc(j.deadline)}</span><span class="pill ${cls}">${countdown(n)}</span>${safeUrl(j.url) ? `<a class="btn" href="${esc(j.url)}" target="_blank" rel="noopener">Apply ↗</a>` : ''}</div>`).join('')}` : '';
  const html = grp('Overdue', sv.filter(x => x.n < 0), 'bad') + grp('Due within 3 days', sv.filter(x => x.n >= 0 && x.n <= 3), 'warn') + grp('Upcoming', sv.filter(x => x.n > 3), '');
  $('#main').innerHTML = `<div class="rem"><p class="hint">Reminders run in the background — ${S.notify ? `you’ll be notified ${S.reminderDays.join(', ')} day(s) before a deadline and once when it passes.` : 'notifications are turned off in Settings.'} Only jobs still in <b>Saved</b> are tracked.</p>${html || '<p class="empty">No upcoming deadlines. Add a deadline to a saved job to get reminders.</p>'}</div>`;
}

// ---------- board interactions ----------
async function move(id, status) {
  const j = jobs.find(x => x.id === id); if (!j || j.status === status) return;
  j.status = status; if (status === 'Applied' && !j.dateApplied) j.dateApplied = todayISO();
  await store.setJobs(jobs); render();
}
const main = $('#main');
main.addEventListener('click', e => {
  if (e.target.closest('a')) return;
  const el = e.target.closest('[data-id]'); if (el) openModal(jobs.find(j => j.id === el.dataset.id));
});
main.addEventListener('dragstart', e => { const c = e.target.closest('.card'); if (c) { e.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('drag'); } });
main.addEventListener('dragend', e => e.target.classList && e.target.classList.remove('drag'));
main.addEventListener('dragover', e => { const c = e.target.closest('.col'); if (c) { e.preventDefault(); c.classList.add('over'); } });
main.addEventListener('dragleave', e => { const c = e.target.closest('.col'); if (c && !c.contains(e.relatedTarget)) c.classList.remove('over'); });
main.addEventListener('drop', e => { const c = e.target.closest('.col'); if (c) { e.preventDefault(); move(e.dataTransfer.getData('text/plain'), c.dataset.s); } });
$('#bar').addEventListener('input', e => { F[e.target.name] = e.target.value; board(); });
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { view = b.dataset.v; document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b)); render(); });
fillStatus();
function fillStatus() { $('[name=status]').innerHTML += STATUSES.map(s => `<option>${s}</option>`).join(''); }

// ---------- add / edit / details ----------
const formHtml = j => FIELDS.map(([k, l, t]) => `<label>${l}${t === 'select' ? `<select name="${k}">${STATUSES.map(s => `<option ${j[k] === s ? 'selected' : ''}>${s}</option>`).join('')}</select>` : `<input name="${k}" type="${t}" value="${esc(j[k])}" ${k === 'type' ? 'list="types"' : ''} ${k === 'title' ? 'required' : ''}>`}</label>`).join('') +
  `<label class="wide">Notes<textarea name="notes" rows="3">${esc(j.notes)}</textarea></label><label class="wide">Job description<textarea name="description" rows="5">${esc(j.description)}</textarea></label>`;
function openModal(existing) {
  const isNew = !existing, j = existing || { status: 'Saved' }, dlg = $('#dlg');
  dlg.innerHTML = `<form id="jf"><h2>${isNew ? 'Add a job' : 'Job details'}</h2><div class="fgrid">${formHtml(j)}</div><p id="err" class="err"></p>
  <div class="foot">${isNew ? '' : '<button type="button" class="btn danger" id="del">Delete</button>'}${safeUrl(j.url) ? `<a class="btn" href="${esc(j.url)}" target="_blank" rel="noopener">Open application ↗</a>` : ''}<span class="sp"></span><button type="button" class="btn" id="cancel">Cancel</button><button class="btn pri">Save changes</button></div></form>`;
  dlg.showModal();
  $('#cancel').onclick = () => dlg.close();
  if (!isNew) $('#del').onclick = async () => { if (confirm('Delete this job? This can’t be undone.')) { jobs = jobs.filter(x => x.id !== j.id); await store.setJobs(jobs); dlg.close(); render(); } };
  $('#jf').onsubmit = async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target)); Object.keys(d).forEach(k => d[k] = d[k].trim());
    if (d.url && jobs.some(x => x.id !== j.id && x.url && normUrl(x.url) === normUrl(d.url))) { $('#err').textContent = 'Another job with this application URL is already saved.'; return; }
    if (d.status === 'Applied' && !d.dateApplied) d.dateApplied = todayISO();
    if (isNew) jobs.push({ id: crypto.randomUUID(), dateSaved: new Date().toISOString(), ...d }); else Object.assign(j, d);
    await store.setJobs(jobs); dlg.close(); render();
  };
}
$('#add').onclick = () => openModal();
document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

// ---------- settings ----------
$('#set').onclick = () => {
  const d = $('#setDlg');
  d.innerHTML = `<form id="sf"><h2>Reminder settings</h2><label class="wide">Remind me this many days before a deadline<input name="days" value="${S.reminderDays.join(', ')}" placeholder="7, 3, 1"></label>
  <label class="chk"><input type="checkbox" name="notify" ${S.notify ? 'checked' : ''}> Send Chrome notifications</label>
  <p class="hint">Use comma-separated numbers. A notification also fires once when a deadline passes. Checks run hourly in the background, even when this page is closed.</p><p id="perm" class="err"></p>
  <div class="foot"><button type="button" class="btn" id="test">Send test notification</button><span class="sp"></span><button type="button" class="btn" id="sc">Cancel</button><button class="btn pri">Save settings</button></div></form>`;
  d.showModal();
  chrome.notifications.getPermissionLevel(l => { if (l !== 'granted') $('#perm').textContent = 'Notifications are blocked for Chrome or this extension. Allow them in your system and Chrome settings.'; });
  $('#sc').onclick = () => d.close();
  $('#test').onclick = () => chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon128.png', title: 'Job Clipper', message: 'Notifications are working.' });
  $('#sf').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const days = [...new Set(String(f.get('days')).split(/[ ,]+/).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 365))].sort((a, b) => b - a);
    await chrome.storage.local.set({ settings: { reminderDays: days, notify: f.get('notify') === 'on' }, notified: {} });
    chrome.runtime.sendMessage({ type: 'check' }); d.close();
  };
};

// ---------- CSV ----------
$('#csv').onclick = () => {
  const cols = [['Role', 'title'], ['Company', 'company'], ['Application URL', 'url'], ['Deadline', 'deadline'], ['Date saved', j => (j.dateSaved || '').slice(0, 10)], ['Date applied', 'dateApplied'], ['Interview date', 'interviewDate'], ['Job type', 'type'], ['Location', 'location'], ['Salary', 'salary'], ['Source', 'source'], ['Status', 'status'], ['Recruiter name', 'recruiterName'], ['Recruiter email', 'recruiterEmail'], ['Recruiter phone', 'recruiterPhone'], ['Notes', 'notes']];
  const cell = v => { v = String(v ?? ''); if (/^[=+\-@]/.test(v)) v = "'" + v; return `"${v.replace(/"/g, '""')}"`; };
  const rows = [cols.map(c => cell(c[0])).join(',')].concat(jobs.map(j => cols.map(([, k]) => cell(typeof k === 'function' ? k(j) : j[k])).join(',')));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = `job-clipper-${todayISO()}.csv`; a.click(); URL.revokeObjectURL(a.href);
};
load();
