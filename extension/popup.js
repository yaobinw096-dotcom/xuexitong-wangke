'use strict';
const label = document.getElementById('status'); let tabId;
async function command(type) { const r = await chrome.tabs.sendMessage(tabId, {type}, {frameId: 0}); if (!r?.ok) throw Error(r?.error || '页面未响应'); return r.data; }
async function refresh() { try { const s = await command('STATUS'); label.textContent = s.message; document.getElementById('start').disabled = s.running; document.getElementById('stop').disabled = !s.running; } catch { label.textContent = '请打开学习通的章节学习页面。首次安装后，请刷新课程页面。'; } }
for (const [id, type] of [['start', 'START'], ['stop', 'STOP']]) document.getElementById(id).onclick = async () => { try { await command(type); await refresh(); } catch(e) { label.textContent = e.message; } };
document.getElementById('settings').onclick = e => { e.preventDefault(); chrome.runtime.openOptionsPage(); };
chrome.tabs.query({active: true, currentWindow: true}).then(tabs => { tabId = tabs[0]?.id; refresh(); });
setInterval(() => { if (tabId) refresh(); }, 1200);
