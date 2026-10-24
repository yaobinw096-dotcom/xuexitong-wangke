(() => {
  'use strict';
  if (window !== window.top || !/^\/mycourse\/studentstudy(?:[/.]|$)/.test(location.pathname) || document.getElementById('keban-assistant')) return;
  const K = Keban, $ = (s, d = document) => d.querySelector(s), $$ = (s, d = document) => [...d.querySelectorAll(s)];
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const state = {running: false, starting: false, busy: false, epoch: 0, route: '', doc: null, course: '', message: '准备就绪', logs: [], answers: [], completed: 0};
  let cfg = {...K.defaults}, activeMedia = null, done = new WeakSet(), endWait = new WeakMap(), emptySince = 0;
  async function send(message) { const r = await chrome.runtime.sendMessage(message); if (!r?.ok) throw Error(r?.error || '插件后台未响应，请刷新页面'); return r.data; }
  function courseId() { const p = new URL(location.href).searchParams; return `${location.origin}:${p.get('courseId') || p.get('courseid') || ''}:${p.get('clazzid') || ''}`; }
  function visible(el) {
    if (!el?.isConnected) return false;
    const w = el.ownerDocument.defaultView, style = w.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && el.getClientRects().length > 0;
  }
  function base() { const f = $('#iframe'); return f ? f.contentDocument : document; }
  function route() { try { const f = $('#iframe'); return [location.href, f?.src || '', base()?.URL || ''].join('|'); } catch { return location.href + '|inaccessible'; } }
  function token() { return {epoch: state.epoch, route: route(), doc: base()}; }
  function check(t, element) {
    const changedFrame = t.frames?.some(({frame, doc}) => !frame.isConnected || frame.contentDocument !== doc);
    if (!state.running || t.epoch !== state.epoch || t.route !== route() || t.doc !== base() || changedFrame || (element && !element.isConnected)) throw Error('任务已暂停或页面已变化');
  }
  function note(text) { state.message = text; if (state.logs.at(-1)?.text !== text) state.logs.push({time: new Date().toLocaleTimeString(), text}); state.logs = state.logs.slice(-35); render(); }
  async function stop(message = '已暂停') {
    state.running = false; state.epoch++; if (activeMedia && !activeMedia.paused) activeMedia.pause();
    note(message); send({type: 'CANCEL'}).catch(() => {}); await send({type: 'SET_RUN', enabled: false, courseId: courseId()}).catch(() => {});
  }
  async function start() {
    if (state.running || state.starting) return;
    if (state.busy) { note('正在结束上一次任务，请稍候再开始'); return; }
    state.starting = true; const epoch = ++state.epoch; note('正在启动');
    try {
      cfg = await send({type: 'GET_CONFIG'}); if (epoch !== state.epoch) return;
      state.route = route(); state.doc = base(); state.course = courseId();
      await send({type: 'SET_RUN', enabled: true, courseId: state.course});
      if (epoch !== state.epoch) { await send({type: 'SET_RUN', enabled: false, courseId: state.course}); return; }
      waitStarted = emptySince = 0; state.running = true; note('正在识别当前章节');
    } finally { state.starting = false; render(); }
  }
  function docs(root, chain = [], out = []) {
    if (!root || chain.length > 6) return out;
    out.push({doc: root, chain});
    for (const f of $$('iframe', root)) { try { if (f.contentDocument) docs(f.contentDocument, [...chain, f], out); } catch {} }
    return out;
  }
  function taskDone(frame) {
    const container = frame?.closest('.ans-attach-ct') || frame?.parentElement;
    return Boolean(container?.classList.contains('ans-job-finished'));
  }
  function isSubmitted(doc) { return Boolean($('.testTit_status_complete, #ZyBottom .newAnswerBx, #ZyBottom .correctAnswerBx, #ZyBottom .myAllAnswerBx', doc)); }
  function tasks() {
    const root = base(); if (!root || root.readyState === 'loading' || root.URL === 'about:blank') return null;
    const first = $('#iframe'), outerChain = first ? [first] : [];
    const frames = $$('iframe', root).filter(f => /\/ananas\/modules\//.test(f.src) && !f.parentElement?.closest('.keban-ignore'));
    const jobs = frames.length ? frames.map(frame => ({frame, chain: [...outerChain, frame], root: frame.contentDocument})) : [{frame: null, chain: outerChain, root}];
    return jobs.map(job => {
      if (job.frame && taskDone(job.frame)) return {...job, kind: 'done'};
      if (!job.root) return {...job, kind: 'waiting', reason: '任务 iframe 尚未加载，或跨域无法读取'};
      const scope = docs(job.root, job.chain);
      for (const item of scope) {
        const media = $('video, audio', item.doc);
        if (media) return {...job, ...item, media, kind: 'media'};
        if ($('#ZyBottom .singleQuesId, .TiMu', item.doc)) return {...job, ...item, kind: isSubmitted(item.doc) ? 'done' : 'quiz'};
        if (isSubmitted(item.doc)) return {...job, ...item, kind: 'done'};
      }
      return {...job, kind: job.frame ? (/\/modules\/(video|audio|work)\//.test(job.frame.src) ? 'waiting' : 'unsupported') : 'text'};
    });
  }
  function selected(option) {
    if (option.control.matches('input[type=radio],input[type=checkbox]')) return option.control.checked;
    return option.control.classList.contains('check_answer') || option.control.classList.contains('check_answer_dx') || option.control.getAttribute('aria-checked') === 'true';
  }
  function parseQuestion(el, index, video = false) {
    const stem = $('.Zy_TItle, .mark_name, .question-title, .tkTopic_title', el);
    const typeInput = $('input[id^=answertype], input[name^=answertype]', el);
    const rawType = typeInput?.value;
    const stemCopy = (stem || el).cloneNode(true);
    $$('textarea,input,.blankItemDiv,.Zy_ulTk,.edui-editor,.InpDIV,[contenteditable],.before-after,.before-after-checkbox,.ans-videoquiz-opt,button', stemCopy).forEach(n => n.remove());
    const text = K.normalize(stemCopy.textContent);
    let type = ({0: 'single', 1: 'multiple', 2: 'blank', 3: 'boolean', 4: 'short', 5: 'short', 6: 'short', 7: 'short'})[rawType];
    if (rawType !== undefined && !type) throw Error(`第 ${index + 1} 题的题型编码不支持，请手动处理`);
    if (!type) type = /多选/.test(text) ? 'multiple' : /判断/.test(text) ? 'boolean' : /单选/.test(text) ? 'single' : /填空/.test(text) ? 'blank' : /简答|论述|计算|名词解释/.test(text) ? 'short' : '';
    let rows = video ? $$('.ans-videoquiz-opt', el) : $$('.before-after-checkbox, .before-after', el);
    if (!rows.length) rows = $$('input[type=radio],input[type=checkbox]', el).map(c => c.closest('label,li') || c.parentElement);
    rows = [...new Set(rows)];
    if (!type && rows.length) type = $('input[type=checkbox]', el) ? 'multiple' : 'single';
    const options = rows.map((row, i) => ({row, control: $('[name^=answer], [name=ans-videoquiz-opt], input[type=radio], input[type=checkbox]', row) || row,
      key: String.fromCharCode(65 + i), text: K.normalize(row.innerText)}));
    const groups = $$(type === 'short' ? '.Zy_ulTk li' : '.blankItemDiv', el);
    let fields = groups.length ? groups : $$('textarea', el).filter(n => !n.closest('.edui-editor'));
    if (!fields.length && !rows.length) fields = $$('.InpDIV, [contenteditable=true]', el);
    if (type === 'short' && fields.length > 1) fields = [fields[0]];
    const id = el.getAttribute('data') || el.id || `q-${index}`;
    const visualNodes = [stemCopy, ...rows];
    const visuals = visualNodes.flatMap(node => $$('img', node).map(img => `${img.getAttribute('src')}|${img.getAttribute('alt') || ''}`));
    const needsImage = visuals.length > 0 || visualNodes.some(node => node.matches('.font-cxsecret') || $('.font-cxsecret', node));
    if (!['single', 'multiple', 'boolean', 'blank', 'short'].includes(type)) throw Error(`第 ${index + 1} 题的题型暂不支持，请手动处理`);
    if (['single', 'multiple', 'boolean'].includes(type) && options.length < 2) throw Error(`第 ${index + 1} 题无法读取完整选项`);
    if (['blank', 'short'].includes(type) && !fields.length) throw Error(`第 ${index + 1} 题无法定位输入框`);
    const data = K.question({id, type, text, options: options.map(({key, text}) => ({key, text})), slots: fields.length});
    return {el, index, video, data, options, fields, needsImage, signature: JSON.stringify([data, visuals, Boolean(needsImage)])};
  }
  function questions(doc) { let q = $$('#ZyBottom .singleQuesId', doc); if (!q.length) q = $$('.TiMu', doc); return q.map((el, i) => parseQuestion(el, i)); }
  function fieldParts(group) {
    const input = group.matches('textarea,input') ? group : $('textarea,input[type=text]', group);
    const editable = group.matches('[contenteditable=true],.InpDIV') ? group : $('.InpDIV,[contenteditable=true]', group);
    const frames = $$('iframe', group), bodies = [];
    for (const frame of frames) {
      const doc = frame.contentDocument, body = doc?.body;
      if (!body || !(body.isContentEditable || doc.designMode.toLowerCase() === 'on')) throw Error('此题的富文本编辑器无法可靠读取，请手动填写');
      bodies.push(body);
    }
    if (!input && !editable && !bodies.length) throw Error('此题无法定位可写输入框');
    return {input, editable, bodies};
  }
  function fieldMatches(group, answer) {
    const {input, editable, bodies} = fieldParts(group), values = [];
    if (input) {
      if (bodies.length) { const template = input.ownerDocument.createElement('template'); template.innerHTML = input.value; values.push(template.content.textContent); }
      else values.push(input.value);
    }
    if (editable) values.push(editable.textContent);
    values.push(...bodies.map(body => body.textContent));
    return values.length > 0 && values.every(v => K.normalize(v) === K.normalize(answer));
  }
  function setValue(el, value) {
    const win = el.ownerDocument.defaultView;
    const proto = el.tagName === 'TEXTAREA' ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new win.Event('input', {bubbles: true})); el.dispatchEvent(new win.Event('change', {bubbles: true}));
  }
  function fill(q, result) {
    if (q.options.length) {
      for (const o of q.options) {
        const want = result.answers.includes(o.key);
        if (selected(o) !== want && (want || q.data.type === 'multiple')) {
          if (o.control.matches('input[type=radio],input[type=checkbox]')) o.control.click(); else o.row.click();
        }
      }
    } else {
      const parts = q.fields.map(fieldParts);
      parts.forEach(({input, editable, bodies}, i) => {
        for (const edit of [...bodies, ...(editable ? [editable] : [])]) {
          edit.textContent = result.answers[i];
          for (const type of ['input', 'change', 'blur']) edit.dispatchEvent(new edit.ownerDocument.defaultView.Event(type, {bubbles: true}));
        }
        if (input) setValue(input, bodies.length ? bodies[0].innerHTML : result.answers[i]);
      });
    }
  }
  function verify(q, result) {
    if (!q.el.isConnected) return false;
    if (q.options.length) {
      const actual = q.options.filter(selected).map(o => o.key).sort().join(',');
      if (actual !== [...result.answers].sort().join(',')) return false;
      const hidden = $$('input[type=hidden][id^=answer]', q.el).find(e => /^answer\d+$/.test(e.id));
      if (hidden && q.data.type === 'boolean') {
        const wanted = q.options.find(o => o.key === result.answers[0]), stored = hidden.value.trim().toLowerCase();
        const mapped = [wanted.control.getAttribute('value'), wanted.control.getAttribute('data-value'), wanted.row.getAttribute('data-value')].filter(v => v !== null && v !== '');
        if (mapped.length) { if (!mapped.some(v => v.toLowerCase() === stored)) return false; }
        else if (/^[a-z]$/.test(stored)) { if (stored.toUpperCase() !== wanted.key) return false; }
        else {
          const label = wanted.text.replace(/^[A-Z]\s*[.、．:]?\s*/i, '').trim().toLowerCase();
          const truth = /^(正确|对|是|true|√|✔)$/.test(label) ? 'true' : /^(错误|错|否|false|×|✕)$/.test(label) ? 'false' : null;
          if (!truth || stored !== truth) return false;
        }
      } else if (hidden) {
        const stored = hidden.value.toUpperCase().replace(/[^A-Z]/g, '').split('').sort().join(',');
        if (stored !== [...result.answers].sort().join(',')) return false;
      }
      return true;
    }
    return q.fields.every((f, i) => fieldMatches(f, result.answers[i]));
  }
  async function imageFor(q, chain, t) {
    if (!q.needsImage) return null;
    if (!cfg.images) throw Error('本题含图片或特殊字体，请开启图片题并使用支持视觉的模型');
    chain.forEach(f => f.scrollIntoView({block: 'center', inline: 'nearest'})); q.el.scrollIntoView({block: 'center'});
    await pause(450); check(t, q.el);
    const rect = q.el.getBoundingClientRect(); let x = rect.x, y = rect.y;
    const frameRects = chain.map(frame => frame.getBoundingClientRect()), viewport = [innerWidth, innerHeight];
    for (const f of [...chain].reverse()) {
      if (x < 0 || y < 0 || x + rect.width > f.clientWidth + 1 || y + rect.height > f.clientHeight + 1) throw Error('题目在 iframe 内显示不全，请缩小网页或手动处理');
      const r = f.getBoundingClientRect(); x += r.left + f.clientLeft; y += r.top + f.clientTop;
    }
    host.style.visibility = 'hidden';
    try {
      await pause(80); check(t, q.el);
      const response = await send({type: 'CAPTURE_QUESTION', rect: {x, y, width: rect.width, height: rect.height, viewportWidth: innerWidth, viewportHeight: innerHeight}});
      check(t, q.el);
      const current = q.el.getBoundingClientRect();
      const moved = (a, b) => ['x', 'y', 'width', 'height'].some(key => Math.abs(a[key] - b[key]) > 1);
      if (moved(current, rect) || chain.some((frame, i) => moved(frame.getBoundingClientRect(), frameRects[i])) || viewport[0] !== innerWidth || viewport[1] !== innerHeight) throw Error('截图期间题目位置变化，已丢弃截图，请重新开始');
      return response.image;
    } finally { host.style.visibility = ''; }
  }
  async function solve(q, chain, t) {
    if (!cfg.hasAI) throw Error('先打开设置，填写 AI 接口和模型名称');
    const image = await imageFor(q, chain, t);
    const result = K.answer(await send({type: 'SOLVE', question: q.data, image}), q.data);
    check(t, q.el);
    if (parseQuestion(q.el, q.index, q.video).signature !== q.signature) throw Error('题目内容已变化，已丢弃旧答案');
    fill(q, result); await pause(250); check(t, q.el);
    if (!verify(q, result)) throw Error('页面回读与答案不一致，已暂停，未提交');
    state.answers.push({question: q.data.text.slice(0, 120), answer: result.answers.join(' / '), explanation: result.explanation});
    state.answers = state.answers.slice(-25); render(); return result;
  }
  async function submitQuiz(job, answered, t) {
    function recheck() {
      const refreshed = questions(job.doc);
      if (refreshed.length !== answered.length || answered.some((a, i) => a.q.signature !== refreshed[i].signature || !verify(refreshed[i], a.result)))
        throw Error('提交前复核未通过，请检查题目是否变化或填写完整');
    }
    recheck();
    const button = $('.btnSubmit.workBtnIndex, #btnBlueSubmit, .btnBlueSubmit', job.doc);
    if (!visible(button)) throw Error('没有找到可用的章节测验提交按钮');
    check(t, button); button.click(); note('已填写，正在等待页面确认提交');
    // Only the submitted quiz frame may navigate to a result document.
    // Keep the course, parent frames and cancellation guards active.
    const resultFrame = job.chain.at(-1);
    const parentToken = {...t, frames: t.frames?.filter(({frame}) => frame !== resultFrame)};
    const start = Date.now(); let confirmed = false;
    while (Date.now() - start < 15000) {
      await pause(300); check(parentToken);
      const resultDoc = resultFrame ? resultFrame.contentDocument : job.doc;
      if ((resultDoc && isSubmitted(resultDoc)) || taskDone(job.frame)) {
        t.frames = parentToken.frames;
        return;
      }
      for (const {doc} of docs(document)) {
        const dialog = $('#workpop', doc);
        if (!visible(dialog)) continue;
        if (/未做完|未完成|未作答|还有.*空/.test(dialog.innerText)) { $('#popno', doc)?.click(); throw Error('页面提示有未答题，已取消提交'); }
        const ok = $('#popok', doc);
        if (!confirmed && visible(ok) && /提交|确认|确定/.test(dialog.innerText)) { check(t); recheck(); ok.click(); confirmed = true; }
      }
    }
    throw Error('尚未确认测验提交成功，已暂停；请检查页面，避免重复提交');
  }
  async function quiz(job, t) {
    if (!cfg.autoAnswer) throw Error('遇到章节测验：自动答题已关闭，请手动完成后继续');
    const qs = questions(job.doc); if (!qs.length) throw Error('尚未读取到章节测验题目');
    const answered = [];
    for (let i = 0; i < qs.length; i++) { check(t, qs[i].el); note(`正在处理章节测验 ${i + 1}/${qs.length}`); const result = await solve(qs[i], job.chain, t); answered.push({q: qs[i], result}); }
    if (!cfg.autoSubmit) { await stop('已填写全部答案，请检查后手动提交'); return; }
    await submitQuiz(job, answered, t); check(t); done.add(job.frame || job.doc); state.completed++; note('章节测验已确认提交');
  }
  async function media(job, t) {
    const el = job.media; activeMedia = el;
    const videoQuiz = $('.ans-videoquiz', job.doc);
    if (visible(videoQuiz) && $('.tkTopic', videoQuiz)) {
      if (!cfg.autoAnswer) throw Error('视频出现题目，请手动回答后继续');
      note('正在处理视频弹题'); const q = parseQuestion(videoQuiz, 0, true);
      await solve(q, job.chain, t); check(t);
      if (!cfg.autoSubmit) { await stop('视频弹题已填写，请检查后手动提交'); return; }
      const button = $('#videoquiz-submit', job.doc); if (!visible(button)) throw Error('未找到视频弹题提交按钮');
      button.click(); await pause(2000); check(t);
      if ($$('#spanNot, #spanNotBackPoint', job.doc).some(visible)) throw Error('视频弹题未通过，请手动处理');
      const next = $('#videoquiz-continue', job.doc);
      if (visible(next)) next.click();
      else if (visible(videoQuiz)) throw Error('尚未确认视频弹题提交成功，已暂停；请检查页面，避免重复提交');
      return;
    }
    if (taskDone(job.frame)) { done.add(el); return; }
    if (el.ended) {
      const container = job.frame?.closest('.ans-attach-ct') || job.frame?.parentElement;
      if (container?.querySelector('.ans-job-icon') && !taskDone(job.frame)) {
        if (!endWait.has(el)) endWait.set(el, Date.now());
        if (Date.now() - endWait.get(el) > 45000) throw Error('视频已结束，但平台任务点未确认；请检查进度');
        note('视频已结束，等待平台确认任务点'); return;
      }
      done.add(el); state.completed++; note('视频播放结束'); return;
    }
    el.muted = cfg.muted; if (Math.abs(el.playbackRate - cfg.rate) > 0.01) el.playbackRate = cfg.rate;
    if (el.error) throw Error('视频加载出错，请先在页面重试');
    if (el.paused) { check(t); try { await el.play(); } catch { throw Error('浏览器阻止自动播放，请点击页面播放按钮后继续'); } }
    check(t); note(`播放中 · ${Math.floor(el.currentTime)} / ${Number.isFinite(el.duration) ? Math.floor(el.duration) : '--'} 秒`);
  }
  async function next(t) {
    if (!cfg.autoNext) { await stop('本节已处理，自动切章已关闭'); return; }
    const nextButton = $('#prevNextFocusNext');
    if (!visible(nextButton)) { await stop('当前页面没有下一节，任务已停止'); return; }
    note('本节已处理，准备进入下一节'); await pause(1800); check(t); nextButton.click();
    for (let i = 0; i < 40; i++) {
      await pause(300); if (!state.running || state.epoch !== t.epoch) return;
      if (route() !== t.route) { note('正在加载下一节'); return; }
      if (visible($('.jobFinishTip'))) throw Error('平台提示本节任务未完成，请检查后继续');
    }
    throw Error('点击下一节后页面未切换，请手动检查');
  }
  let waitStarted = 0;
  async function tick() {
    if (!state.running || state.busy) return;
    state.busy = true;
    const t = token();
    try {
      if (state.course !== courseId()) { await stop('已切换到另一门课程，请手动开始'); return; }
      if (state.route !== t.route || state.doc !== t.doc) { state.route = t.route; state.doc = t.doc; state.epoch++; done = new WeakSet(); endWait = new WeakMap(); waitStarted = 0; emptySince = 0; return; }
      const jobs = tasks();
      if (!jobs) { if (!waitStarted) waitStarted = Date.now(); if (Date.now() - waitStarted > 30000) throw Error('课程 iframe 加载超时或跨域无法读取，请手动检查'); note('等待课程 iframe 加载'); return; }
      const job = jobs.find(j => j.kind !== 'done' && !done.has(j.media || j.frame || j.doc || j.root));
      if (!job) return await next(t);
      if (job.kind === 'waiting') { if (!waitStarted) waitStarted = Date.now(); if (Date.now() - waitStarted > 30000) throw Error(job.reason || '等待任务加载超时'); note('等待任务加载'); return; }
      waitStarted = 0;
      if (job.kind === 'unsupported') throw Error('当前为文档或其他任务，请手动完成后继续');
      if (job.kind === 'text') { if (!emptySince) emptySince = Date.now(); if (Date.now() - emptySince > 4000) await next(t); return; }
      emptySince = 0;
      t.frames = job.chain.map(frame => ({frame, doc: frame.contentDocument}));
      if (job.kind === 'media') await media(job, t); else if (job.kind === 'quiz') await quiz(job, t);
    } catch (e) {
      if (state.running && t.epoch === state.epoch && t.route === route()) await stop(e.message);
    } finally { state.busy = false; }
  }
  const host = document.createElement('div'); host.id = 'keban-assistant';
  host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:calc(100vw - 36px)';
  const shadow = host.attachShadow({mode: 'closed'});
  const manifest = chrome.runtime.getManifest();
  shadow.innerHTML = `<style>:host{all:initial}*{box-sizing:border-box}section{font:14px/1.55 system-ui,"Microsoft YaHei",sans-serif;background:#fffdf8;color:#183c33;border:1px solid #d8e3d8;border-radius:16px;box-shadow:0 6px 30px #193e3222;padding:16px;width:300px}header{display:flex;justify-content:space-between;align-items:center}strong{font-size:18px}small{color:#607369;font-size:11px}p{min-height:42px;margin:12px 0;color:#304c43;overflow-wrap:anywhere}nav{display:flex;gap:8px}button{font:inherit;cursor:pointer;border:1px solid #d8e3d8;padding:8px 14px;border-radius:8px;background:white;color:#164b3d}button.primary{background:#164b3d;color:white;border-color:#164b3d}details{margin-top:12px}summary{cursor:pointer;color:#607369;font-size:12px}ol{max-height:220px;overflow:auto;padding-left:18px;font-size:12px;color:#52665d}li{padding:5px 0;overflow-wrap:anywhere}</style><section><header><strong>课伴</strong><small>学习通助手 · ${manifest.version_name || manifest.version}</small></header><p id="status" role="status"></p><nav><button id="toggle" class="primary">开始</button><button id="settings">设置</button><button id="fold" aria-label="收起面板">收起</button></nav><div id="detail"><details><summary>查看答案与运行记录</summary><ol id="history"></ol></details></div></section>`;
  document.documentElement.appendChild(host);
  function render() {
    shadow.getElementById('status').textContent = state.message;
    shadow.getElementById('toggle').textContent = state.running || state.starting ? '暂停' : '开始';
    const history = shadow.getElementById('history'); history.replaceChildren();
    for (const item of [...state.answers.map(a => `${a.question} → ${a.answer} ${a.explanation}`), ...state.logs.slice(-10).map(l => `${l.time} ${l.text}`)]) { const li = document.createElement('li'); li.textContent = item; history.appendChild(li); }
  }
  shadow.getElementById('toggle').onclick = () => (state.running || state.starting ? stop() : start()).catch(e => note(e.message));
  shadow.getElementById('settings').onclick = () => send({type: 'OPEN_OPTIONS'}).catch(e => note(e.message));
  shadow.getElementById('fold').onclick = e => { const p = shadow.getElementById('status'), d = shadow.getElementById('detail'); const hide = !p.hidden; p.hidden = d.hidden = hide; e.target.textContent = hide ? '展开' : '收起'; };
  chrome.runtime.onMessage.addListener((m, _sender, reply) => {
    if (m.type === 'STATUS') { reply({ok: true, data: {running: state.running, message: state.message, completed: state.completed}}); return; }
    if (m.type === 'START' || m.type === 'STOP') { (m.type === 'START' ? start() : stop()).then(() => reply({ok: true}), e => reply({ok: false, error: e.message})); return true; }
  });
  render(); setInterval(tick, 1000);
  send({type: 'GET_RUN'}).then(run => { if (run.enabled && run.courseId === courseId()) start().catch(e => note(e.message)); }).catch(e => note(e.message));
})();
