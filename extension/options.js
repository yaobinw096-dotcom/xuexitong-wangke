'use strict';
const fields = Object.keys(Keban.defaults), statusEl = document.getElementById('status');
function status(text, error = false) { statusEl.textContent = text; statusEl.classList.toggle('error', error); }
async function send(m) { const r = await chrome.runtime.sendMessage(m); if (!r?.ok) throw Error(r?.error || '插件后台没有响应'); return r.data; }
function values() { return Keban.config(Object.fromEntries(fields.map(k => { const el = document.getElementById(k); return [k, el.type === 'checkbox' ? el.checked : el.value]; }))); }
async function save(test = false) {
  const c = values();
  // Request permission within the click handler before any awaited operation.
  if (c.apiBase) { const u = Keban.endpoint(c.apiBase); const allowed = await chrome.permissions.request({origins: [Keban.originPattern(u)]}); if (!allowed) throw Error('未授权 API 站点，设置尚未保存'); }
  await send({type: 'SAVE_CONFIG', config: c}); status('已保存。运行中的课程请暂停再开始，以使用新设置。');
  if (test) { status('正在测试 AI 连接…'); const answer = await send({type: 'TEST_API'}); if (answer.answers[0] !== 'A') throw Error('接口可连接，但基础测试答案不正确，请检查模型'); status('连接成功，模型已返回符合格式的答案。'); }
}
function run(test) { document.getElementById('save').disabled = document.getElementById('test').disabled = true; save(test).catch(e => status(e.message, true)).finally(() => { document.getElementById('save').disabled = document.getElementById('test').disabled = false; }); }
document.getElementById('form').addEventListener('submit', e => { e.preventDefault(); run(false); });
document.getElementById('test').addEventListener('click', () => run(true));
send({type: 'GET_CONFIG'}).then(c => { for (const k of fields) { const el = document.getElementById(k); if (el.type === 'checkbox') el.checked = c[k]; else el.value = c[k]; } status('设置仅保存于当前浏览器。'); }).catch(e => status(e.message, true));
