(() => {
  'use strict';
  const defaults = Object.freeze({apiBase: '', apiKey: '', model: '', rate: 1, muted: true,
    autoNext: true, autoAnswer: true, autoSubmit: true, images: true});
  const normalize = v => String(v ?? '').replace(/\s+/g, ' ').trim();
  function endpoint(base) {
    const u = new URL(base.trim());
    if (u.username || u.password || u.search || u.hash) throw Error('API 地址不能含账号、查询参数或片段');
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)))
      throw Error('请使用 HTTPS API，或本机 localhost / 127.0.0.1 地址');
    u.pathname = u.pathname.replace(/\/+$/, '');
    if (!u.pathname.endsWith('/chat/completions')) u.pathname += '/chat/completions';
    return u;
  }
  const originPattern = url => `${url.protocol}//${url.hostname}/*`;
  function question(raw) {
    if (!raw || !['single', 'multiple', 'boolean', 'blank', 'short'].includes(raw.type) || typeof raw.text !== 'string' || raw.text.length > 18000)
      throw Error('题目内容或题型不支持');
    if (!Array.isArray(raw.options) || raw.options.length > 26 || !Number.isInteger(raw.slots) || raw.slots < 0 || raw.slots > 30) throw Error('题目结构不完整');
    const options = raw.options.map(o => {
      if (!o || !/^[A-Z]$/.test(o.key) || typeof o.text !== 'string' || o.text.length > 12000) throw Error('选项格式不支持');
      return {key: o.key, text: o.text};
    });
    if (new Set(options.map(o => o.key)).size !== options.length) throw Error('题目选项重复');
    const choice = ['single', 'multiple', 'boolean'].includes(raw.type);
    if (choice ? (options.length < 2 || raw.slots !== 0) : (options.length !== 0 || raw.slots < 1 || (raw.type === 'short' && raw.slots !== 1))) throw Error('题目输入数量不支持');
    return {id: String(raw.id || '').slice(0, 200), type: raw.type, text: raw.text, options, slots: raw.slots};
  }
  function config(raw = {}) {
    const c = {...defaults};
    for (const k of Object.keys(c)) if (Object.hasOwn(raw, k)) c[k] = raw[k];
    for (const k of ['apiBase', 'apiKey', 'model']) c[k] = String(c[k] || '').trim();
    c.rate = Number(c.rate);
    if (![1, 1.25, 1.5, 1.75, 2].includes(c.rate)) throw Error('播放速度应在 1–2 倍之间');
    for (const k of ['muted', 'autoNext', 'autoAnswer', 'autoSubmit', 'images']) c[k] = Boolean(c[k]);
    if (c.apiBase) endpoint(c.apiBase);
    return c;
  }
  function answer(raw, question) {
    let obj;
    if (typeof raw === 'string') {
      const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      try { obj = JSON.parse(text); } catch { throw Error('AI 未返回有效 JSON；本题未填写'); }
    } else obj = raw;
    if (!obj || !Array.isArray(obj.answers) || !obj.answers.length || obj.answers.length > 30)
      throw Error('AI 答案格式不完整');
    const a = obj.answers.map(v => { if (typeof v !== 'string' || !v.trim() || v.length > 12000) throw Error('AI 返回了空答案或不支持的格式'); return v.trim(); });
    if (['single', 'multiple', 'boolean'].includes(question.type)) {
      const allowed = new Set(question.options.map(o => o.key));
      if (a.some(v => !allowed.has(v)) || new Set(a).size !== a.length || (question.type !== 'multiple' && a.length !== 1))
        throw Error('AI 答案与页面选项不一致；本题未填写');
    } else if (a.length !== question.slots) throw Error('AI 答案数量与填空数量不一致');
    return {answers: a, explanation: String(obj.explanation || '').slice(0, 4000)};
  }
  globalThis.Keban = Object.freeze({defaults, normalize, endpoint, originPattern, question, config, answer});
})();
