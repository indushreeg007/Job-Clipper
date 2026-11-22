// Injected into the active tab on demand (activeTab + scripting); must be self-contained.
function extractJob() {
  const host = location.hostname.replace(/^www\./, '');
  const NAMES = { 'linkedin.com': 'LinkedIn', 'internshala.com': 'Internshala', 'indeed.com': 'Indeed', 'naukri.com': 'Naukri', 'wellfound.com': 'Wellfound', 'glassdoor.com': 'Glassdoor', 'glassdoor.co.in': 'Glassdoor' };
  const key = Object.keys(NAMES).find(k => host === k || host.endsWith('.' + k));
  // Configurable per-site selectors (first match wins). Update here if a site changes its markup.
  const SEL = {
    'linkedin.com': { title: ['.job-details-jobs-unified-top-card__job-title h1', '.top-card-layout__title', 'h1'], company: ['.job-details-jobs-unified-top-card__company-name', '.topcard__org-name-link', '.top-card-layout__card a[href*="/company/"]'], location: ['.job-details-jobs-unified-top-card__primary-description-container .tvm__text', '.topcard__flavor--bullet'], description: ['.jobs-description__content', '.show-more-less-html__markup'] },
    'internshala.com': { title: ['.profile', '.heading_4_5.profile', 'h1'], company: ['.company_name a', '.company-name', '.company_and_premium a'], location: ['#location_names', '.location_link'], description: ['.text-container', '.internship_details'], salary: ['.stipend', '.item_body .stipend'] },
    'indeed.com': { title: ['.jobsearch-JobInfoHeader-title', 'h1'], company: ['[data-testid="inlineHeader-companyName"]', '[data-company-name="true"]'], location: ['[data-testid="inlineHeader-companyLocation"]', '[data-testid="job-location"]'], description: ['#jobDescriptionText'], salary: ['#salaryInfoAndJobType', '[data-testid="attribute_snippet_testid"]'] },
    'naukri.com': { title: ['h1.styles_jd-header-title__rZwM1', '.jd-header-title', 'h1'], company: ['.styles_jd-header-comp-name__MvqAI a', '.jd-header-comp-name a'], location: ['.styles_jhc__location__W_pVs', '.location'], description: ['.styles_JDC__dang-inner-html__h0K4t', '.dang-inner-html'], salary: ['.styles_jhc__salary__jdfEC', '.salary'] },
    'wellfound.com': { title: ['h1'], company: ['a[href^="/company/"]'], location: ['[class*="location"]'], description: ['[class*="description"]'] },
    'glassdoor.com': { title: ['[data-test="job-title"]', 'h1'], company: ['[data-test="employer-name"]'], location: ['[data-test="location"]'], description: ['[class*="JobDetails_jobDescription"]', '#JobDescriptionContainer'], salary: ['[data-test="detailSalary"]'] }
  };
  SEL['glassdoor.co.in'] = SEL['glassdoor.com'];
  const S = SEL[key] || {};
  const txt = l => { for (const s of l || []) { try { const e = document.querySelector(s); const t = e && (e.innerText || e.textContent || '').trim(); if (t) return t.replace(/[ \t]+/g, ' '); } catch (e) {} } return ''; };
  const out = { title: '', company: '', url: location.href, description: '', location: '', type: '', salary: '', deadline: '', source: NAMES[key] || host };
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const plain = h => new DOMParser().parseFromString(String(h || '').replace(/<\/(p|li|div|h\d)>|<br\s*\/?>/gi, '\n'), 'text/html').body.textContent.trim();

  // 1) schema.org JobPosting (used by many career sites)
  const nodes = [];
  document.querySelectorAll('script[type="application/ld+json"]').forEach(s => { try { const j = JSON.parse(s.textContent); (Array.isArray(j) ? j : [j]).forEach(x => { nodes.push(x); (x && x['@graph'] || []).forEach(y => nodes.push(y)); }); } catch (e) {} });
  const jp = nodes.find(n => n && [].concat(n['@type'] || []).includes('JobPosting'));
  if (jp) {
    out.title = jp.title || '';
    const o = jp.hiringOrganization; out.company = (typeof o === 'string' ? o : o && o.name) || '';
    const a = ([].concat(jp.jobLocation || [])[0] || {}).address;
    out.location = a ? (typeof a === 'string' ? a : [a.addressLocality, a.addressRegion, a.addressCountry && (a.addressCountry.name || a.addressCountry)].filter(Boolean).join(', ')) : '';
    if (!out.location && jp.jobLocationType === 'TELECOMMUTE') out.location = 'Remote';
    const et = [].concat(jp.employmentType || [])[0] || '';
    out.type = ({ FULL_TIME: 'Full-time', PART_TIME: 'Part-time', CONTRACTOR: 'Contract', INTERN: 'Internship', TEMPORARY: 'Temporary' })[et] || et;
    const b = jp.baseSalary, v = b && b.value;
    if (v != null) { const o2 = typeof v === 'object' ? v : { value: v }; const lo = o2.minValue != null ? o2.minValue : o2.value; out.salary = ([lo, o2.maxValue].filter(x => x != null && x !== '').join(' – ') + ' ' + (b.currency || '') + (o2.unitText ? ' / ' + String(o2.unitText).toLowerCase() : '')).trim(); }
    if (/^\d{4}-\d{2}-\d{2}/.test(jp.validThrough || '')) out.deadline = jp.validThrough.slice(0, 10);
    out.description = plain(jp.description);
  }
  // 2) site-specific selectors fill whatever is still empty
  for (const f of ['title', 'company', 'location', 'description', 'salary']) if (!out[f]) out[f] = txt(S[f]);
  if (!out.type && key === 'internshala' && /\/internship\//.test(location.pathname)) out.type = 'Internship';
  // 3) deadline from visible text, e.g. "Apply by 12 Dec' 26"
  if (!out.deadline) {
    const m = document.body.innerText.match(/(?:apply by|application deadline|last date(?: to apply)?|closing date|deadline)\s*[:\-]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}(?:st|nd|rd|th)?[ \-][A-Za-z]{3,9}[ ,'’\-]+\d{2,4}|[A-Za-z]{3,9} \d{1,2}(?:st|nd|rd|th)?,? \d{4})/i);
    if (m) {
      if (/^\d{4}-/.test(m[1])) out.deadline = m[1];
      else { const t = new Date(m[1].replace(/(\d)(st|nd|rd|th)/, '$1').replace(/['’]\s*(\d{2})\b/, ' 20$1').replace(/-/g, ' ')); if (!isNaN(t)) out.deadline = iso(t); }
    }
  }
  // 4) canonical URLs so the same job is never saved twice
  const p = new URLSearchParams(location.search);
  if (key === 'linkedin.com') { const id = p.get('currentJobId') || (location.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)/) || [])[1]; if (id) out.url = `https://www.linkedin.com/jobs/view/${id}/`; }
  if (key === 'indeed.com' && (p.get('jk') || p.get('vjk'))) out.url = `${location.origin}/viewjob?jk=${p.get('jk') || p.get('vjk')}`;
  out.description = out.description.slice(0, 6000);
  return out;
}

const FIELDS = ['title', 'company', 'url', 'deadline', 'location', 'type', 'salary', 'source', 'description'];
const msg = (t, cls) => { const m = $('#msg'); m.textContent = t; m.className = 'msg ' + cls; m.hidden = false; };

(async () => {
  $('#dash').onclick = () => { openDashboard(); window.close(); };
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  $('#page').textContent = tab.title || tab.url || '';
  let d = {};
  try { [{ result: d }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractJob }); }
  catch (e) { $('#hint').textContent = 'This page can’t be read automatically. Fill in the details below.'; $('#hint').hidden = false; }
  d = d || {};
  if (!d.url) d.url = tab.url || '';
  if (!d.source) { try { d.source = new URL(tab.url).hostname.replace(/^www\./, ''); } catch (e) {} }
  FIELDS.forEach(f => $('#' + f).value = d[f] || '');
  if (!d.title && $('#hint').hidden) { $('#hint').textContent = 'No job details detected on this page. The URL and site are filled in; add the rest by hand.'; $('#hint').hidden = false; }

  const jobs = await store.jobs();
  const isDup = () => jobs.some(j => j.url && normUrl(j.url) === normUrl($('#url').value));
  const markDup = () => { if (isDup()) { msg('You’ve already saved this job.', 'warn'); $('#save').disabled = true; } else { $('#msg').hidden = true; $('#save').disabled = false; } };
  $('#url').oninput = markDup; markDup();

  $('#save').onclick = async () => {
    const job = { id: crypto.randomUUID(), status: 'Saved', dateSaved: new Date().toISOString(), notes: '', dateApplied: '', interviewDate: '', recruiterName: '', recruiterEmail: '', recruiterPhone: '' };
    FIELDS.forEach(f => job[f] = $('#' + f).value.trim());
    if (!job.title) { msg('Add a job title to save this job.', 'warn'); $('#title').focus(); return; }
    const fresh = await store.jobs();
    if (job.url && fresh.some(j => normUrl(j.url) === normUrl(job.url))) { markDup(); return; }
    fresh.push(job); await store.setJobs(fresh);
    msg('Saved! Find it in your tracker.', 'ok'); $('#save').disabled = true; $('#save').textContent = 'Saved ✓';
  };
})();
