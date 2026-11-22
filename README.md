# Job Clipper — Clip it. Track it. Never lose an opportunity.
Install: chrome://extensions → enable Developer mode → Load unpacked → select this folder.
Open a job posting, click the Job Clipper icon, review the form, Save job.
Site selectors live in `extractJob()` in popup.js; edit them if a site changes its markup.
Data is stored locally (chrome.storage.local). Permissions: storage, activeTab, scripting, alarms, notifications.
