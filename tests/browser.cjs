// Synthetic integration tests only. No real course or external AI service is accessed.
const {chromium} = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
const runDir = path.join(artifacts, `browser-run-${Date.now()}`), extension = path.join(runDir, 'extension');
function copyTree(source, target) { fs.mkdirSync(target,{recursive:true}); for(const entry of fs.readdirSync(source,{withFileTypes:true})){const a=path.join(source,entry.name),b=path.join(target,entry.name);if(entry.isDirectory())copyTree(a,b);else fs.writeFileSync(b,fs.readFileSync(a));} }
fs.mkdirSync(runDir, {recursive:true}); copyTree(path.join(root,'extension'), extension);
const manifest = JSON.parse(fs.readFileSync(path.join(extension,'manifest.json')));
// Test copy only: pre-grant capture and loopback access because the headless browser has no permission dialog UI.
manifest.host_permissions = ['<all_urls>']; fs.writeFileSync(path.join(extension,'manifest.json'), JSON.stringify(manifest,null,2));
let apiMode = 'normal', delayMs = 0, requests = [], context, worker, options, server, browserVersion;
const results = [], errors = [];
const origin = 'http://mooc1.chaoxing.com';
const css = 'body{font:16px sans-serif;margin:16px;color:#253f35}iframe{width:100%;border:0;height:700px}button{padding:8px 20px;margin:8px}.singleQuesId{padding:14px;border-bottom:1px solid #ddd}.before-after,.before-after-checkbox{padding:6px;cursor:pointer}.check_answer,.check_answer_dx{background:#b8e4c7}textarea{width:90%;height:55px}';
const html = body => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`;
function questions(mode) {
  const kinds = mode === 'full' || mode === 'manual' ? ['single','multiple','boolean','blank','short'] : mode.startsWith('boolean-')?['boolean']:['single'];
  return kinds.map((kind, i) => {
    const id=i+101, type=mode==='unknown-type'?9:{single:0,multiple:1,boolean:3,blank:2,short:4}[kind];
    let answerArea='';
    if (['single','multiple','boolean'].includes(kind)) {
      answerArea=`<input type="hidden" id="answer${id}" value="">` + (kind === 'boolean' ? ['正确','错误'] : ['选项一','选项二','选项三']).map((text,j) => `<div class="${kind==='multiple'?'before-after-checkbox':'before-after'}" data-key="${String.fromCharCode(65+j)}"><span name="${kind==='multiple'?'answercheck':'answer'}${id}">${String.fromCharCode(65+j)}</span> ${text}</div>`).join('');
    } else if (kind==='blank') answerArea='<div class="blankItemDiv"><textarea></textarea></div><div class="blankItemDiv"><textarea></textarea></div>';
    else answerArea='<ul class="Zy_ulTk"><li><textarea hidden></textarea><iframe style="height:100px" src="/editor"></iframe></li></ul>';
    // Second question deliberately has no stable DOM id: catches fallback-id drift.
    return `<article class="singleQuesId" ${i===1?'':`data="${kind}"`}><input type="hidden" id="answertype${id}" value="${type}"><h3 class="Zy_TItle">${kind} ${i+1}: ${mode==='unknown-type'?'单选关键词不应覆盖未知题型':'测试题目'}${mode==='image'?'<img src="/question.svg" width="120" height="50" alt="图形题">':''}</h3>${answerArea}</article>`;
  }).join('');
}
function quiz(mode) {
  return html(`<div id="ZyBottom">${questions(mode)}</div><button class="btnSubmit workBtnIndex">提交</button><script>
  window.submissions=0;window.submitClicks=0;
  document.querySelectorAll('.before-after,.before-after-checkbox').forEach(row => row.onclick=()=>{
    const q=row.closest('.singleQuesId'),multiple=row.matches('.before-after-checkbox'),control=row.firstElementChild;
    if(!multiple)q.querySelectorAll('[name^=answer]').forEach(x=>x.classList.remove('check_answer'));
    control.classList.toggle(multiple?'check_answer_dx':'check_answer');
    if(!['bad-hidden','boolean-hidden'].includes(${JSON.stringify(mode)}))q.querySelector('input[id^=answer]:not([id^=answertype])').value=[...q.querySelectorAll('.check_answer,.check_answer_dx')].map(x=>x.parentElement.dataset.key).join('');
    if(${JSON.stringify(mode)}==='boolean-true')q.querySelector('input[id^=answer]:not([id^=answertype])').value=row.dataset.key==='A'?'true':'false';
  });
  document.querySelector('.btnSubmit').onclick=()=>{
    window.submitClicks++;const dialog=top.document.querySelector('#workpop');dialog.style.display='block';
    top.document.querySelector('#popcontent').textContent=${JSON.stringify(mode)}==='incomplete'?'尚有题目未作答':'确认提交章节测验？';
    top.document.querySelector('#popok').onclick=()=>{dialog.style.display='none';window.submissions++;top.totalSubmissions++;if(${JSON.stringify(mode)}.startsWith('submit-navigation'))location.href='/quiz-result?case='+${JSON.stringify(mode)};else document.querySelector('#ZyBottom').insertAdjacentHTML('beforeend','<div class="newAnswerBx">已提交</div>')};
  };
  </script>`);
}
function wav() {
  const count=8000, b=Buffer.alloc(44+count*2); b.write('RIFF');b.writeUInt32LE(36+count*2,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(count*2,40);return b;
}
async function fixture(route) {
  const url=new URL(route.request().url()), mode=url.searchParams.get('case')||'full';
  if(url.hostname!=='mooc1.chaoxing.com') return route.abort();
  let body, contentType='text/html; charset=utf-8';
  if(url.pathname==='/mycourse/studentstudy') {
    body=html(`<h1>课伴隔离测试课程</h1><iframe id="iframe" src="/chapter?case=${mode}&part=${mode.startsWith('video')?'video':'quiz'}"></iframe>${mode==='video'||mode.startsWith('submit-navigation')?'<button id="prevNextFocusNext">下一节</button>':''}<div id="workpop" style="display:none"><p id="popcontent"></p><button id="popno">取消</button><button id="popok">确定</button></div><script>
    window.nextClicks=0;window.totalSubmissions=0;document.querySelector('#popno').onclick=()=>document.querySelector('#workpop').style.display='none';
    const next=document.querySelector('#prevNextFocusNext');if(next)next.onclick=()=>{window.nextClicks++;document.querySelector('#iframe').src='/chapter?case=video&part=quiz';next.remove()};
    </script>`);
  } else if(url.pathname==='/chapter') {
    const video=url.searchParams.get('part')==='video';
    body=html(`<div class="ans-attach-ct"><span class="ans-job-icon"></span><iframe src="/ananas/modules/${video?'video':'work'}/index.html?case=${mode}"></iframe></div>`);
  } else if(url.pathname.includes('/ananas/modules/video/')) {
    const popup=mode==='video'?'':`<div class="ans-videoquiz"><p class="tkTopic">单选题：测试弹题</p><label class="ans-videoquiz-opt"><input type="radio" name="ans-videoquiz-opt">选项一</label><label class="ans-videoquiz-opt"><input type="radio" name="ans-videoquiz-opt">选项二</label><button id="videoquiz-submit">提交</button><span id="spanNot" style="display:none">错误</span><span id="spanNotBackPoint" style="display:none">错误</span><button id="videoquiz-continue" style="display:none">继续</button></div><script>window.popupSubmits=0;window.popupContinues=0;document.querySelector('#videoquiz-submit').onclick=()=>{window.popupSubmits++;if(${JSON.stringify(mode)}==='video-error'){document.querySelector('#spanNotBackPoint').style.display='block';document.querySelector('#videoquiz-continue').style.display='block'}};document.querySelector('#videoquiz-continue').onclick=()=>{window.popupContinues++;document.querySelector('.ans-videoquiz').style.display='none'};</script>`;
    body=html('<video controls src="/one-second.wav"></video>'+popup+'<script>window.played=0;const v=document.querySelector("video");v.onplay=()=>window.played++;v.onended=()=>frameElement.parentElement.classList.add("ans-job-finished")</script>');
  } else if(url.pathname.includes('/ananas/modules/work/')) body=quiz(mode);
  else if(url.pathname==='/quiz-result') body=html(mode==='submit-navigation-unconfirmed'?'<p>结果尚未确认</p>':'<div class="testTit_status_complete">已提交</div>');
  else if(url.pathname==='/editor') body=html('<div></div><script>document.body.contentEditable="true"</script>');
  else if(url.pathname==='/one-second.wav') {body=wav();contentType='audio/wav';}
  else if(url.pathname==='/question.svg') {body='<svg xmlns="http://www.w3.org/2000/svg" width="120" height="50"><rect width="120" height="50" fill="#174d3e"/></svg>';contentType='image/svg+xml';}
  else body=html('<p>empty</p>');
  await route.fulfill({status:200,contentType,body});
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn, timeout=18000) {const start=Date.now();while(Date.now()-start<timeout){const v=await fn();if(v)return v;await wait(100);}throw Error('condition timeout');}
async function configure(overrides={}) {
  const config={apiBase:`http://127.0.0.1:${server.address().port}/v1`,apiKey:'synthetic-key-not-a-secret',model:'fixture-model',rate:1,muted:true,autoNext:true,autoAnswer:true,autoSubmit:true,images:true,...overrides};
  const reply=await options.evaluate(c=>chrome.runtime.sendMessage({type:'SAVE_CONFIG',config:c}),config);assert.equal(reply.ok,true,reply.error);
}
async function openCourse(mode, overrides={}) {
  await configure(overrides); const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));await page.goto(`${origin}/mycourse/studentstudy?courseId=fixture&clazzid=class&case=${mode}`);
  await page.locator('#keban-assistant').waitFor();
  const id=await worker.evaluate(async url=>(await chrome.tabs.query({})).find(t=>t.url===url)?.id,page.url());assert.ok(id);
  const command=type=>worker.evaluate(async ({id,type})=>chrome.tabs.sendMessage(id,{type},{frameId:0}),{id,type});
  const status=async()=>(await command('STATUS')).data;
  const stopped=()=>until(async()=>{const s=await status();return !s.running?s:false;},23000);
  const started=await command('START');assert.equal(started.ok,true,started.error);
  const quizFrame=()=>page.frames().find(f=>f.url().includes('/modules/work/'));
  return {page,id,command,status,stopped,quizFrame};
}
function report(completed=false) {fs.writeFileSync(path.join(artifacts,'browser-results.json'),JSON.stringify({completed,browser:browserVersion,results,errors},null,2));}
async function record(name, fn) {const t=Date.now();await fn();results.push({name,passed:true,ms:Date.now()-t});console.log(`PASS ${name}`);report();}
(async()=>{
  server=http.createServer(async(req,res)=>{
    let text='';for await(const chunk of req)text+=chunk;const data=JSON.parse(text);const user=data.messages.at(-1).content;
    const textPart=typeof user==='string'?user:user[0].text;const q=JSON.parse(textPart.slice(textPart.indexOf('{')));
    const call={q,body:data,headers:req.headers,aborted:false};requests.push(call);res.on('close',()=>{if(!res.writableEnded)call.aborted=true;});
    const mode=apiMode;await wait(delayMs);
    const answers=q.type==='multiple'?['A','C']:q.type==='blank'?['第一空','第二空']:q.type==='short'?['合成简答内容 <安全文本>']:['A'];
    const reply=mode==='malformed'?'not JSON':JSON.stringify({answers:mode==='invalid-option'?['Z']:answers,...(mode==='low'?{confidence:.2}:{}),explanation:'本地固定测试答案'});
    if(!res.destroyed){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:reply}}]}));}
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browserOption=process.env.KEBAN_BROWSER_PATH?{executablePath:process.env.KEBAN_BROWSER_PATH}:{channel:'chromium'};
  context=await chromium.launchPersistentContext(path.join(runDir,'profile'),{...browserOption,headless:true,viewport:{width:1360,height:1000},ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  browserVersion=context.browser().version();
  await context.route(`${origin}/**`,fixture);
  worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  options=await context.newPage();await options.goto(worker.url().replace('background.js','options.html'));
  await record('Settings page reads, saves and tests the configured API',async()=>{
    await until(async()=> (await options.locator('#status').innerText()).includes('设置仅保存'));
    await options.locator('#apiBase').fill(`http://127.0.0.1:${server.address().port}/v1`);
    await options.locator('#apiKey').fill('synthetic-key-not-a-secret');await options.locator('#model').fill('fixture-model');
    await options.locator('#test').click();await until(async()=>(await options.locator('#status').innerText()).includes('连接成功'));
    await options.reload();await until(async()=>(await options.locator('#model').inputValue())==='fixture-model');
    await options.screenshot({path:path.join(artifacts,'settings.png'),fullPage:true});
    assert.equal(requests[0].headers.authorization,'Bearer synthetic-key-not-a-secret');assert.equal(requests[0].headers.cookie,undefined);
  });
  await record('Legacy confidence settings are removed while API settings survive an upgrade',async()=>{
    const before=await worker.evaluate(async()=>(await chrome.storage.local.get('settings')).settings);
    await worker.evaluate(saved=>chrome.storage.local.set({settings:{...saved,minConfidence:1}}),before);
    await options.reload();await until(async()=>(await options.locator('#model').inputValue())===before.model);
    assert.equal(await options.locator('#minConfidence').count(),0);assert.doesNotMatch(await options.locator('body').innerText(),/置信度/);
    assert.equal(await options.locator('#apiBase').inputValue(),before.apiBase);assert.equal(await options.locator('#apiKey').inputValue(),before.apiKey);
    await options.locator('#save').click();await until(async()=>(await options.locator('#status').innerText()).startsWith('已保存'));
    assert.deepEqual(await worker.evaluate(async()=>(await chrome.storage.local.get('settings')).settings),before);
  });
  await record('Quiz result navigation proceeds to the next chapter without pausing or resubmitting',async()=>{
    requests=[];const c=await openCourse('submit-navigation');const s=await c.stopped();assert.match(s.message,/没有下一节/);
    assert.equal(await c.page.evaluate(()=>window.nextClicks),1);assert.equal(await c.page.evaluate(()=>window.totalSubmissions),2);assert.equal(requests.length,2);await c.page.close();
  });
  await record('Quiz result navigation without a completion marker never advances or resubmits',async()=>{
    requests=[];const c=await openCourse('submit-navigation-unconfirmed');const s=await c.stopped();assert.match(s.message,/尚未确认测验提交成功/);
    assert.equal(await c.page.evaluate(()=>window.nextClicks),0);assert.equal(await c.page.evaluate(()=>window.totalSubmissions),1);assert.equal(requests.length,1);await c.page.close();
  });
  await record('All five question types including rich text fill and submit once',async()=>{
    requests=[];const c=await openCourse('full');const s=await c.stopped();assert.match(s.message,/没有下一节/);
    const f=c.quizFrame();assert.equal(await f.evaluate(()=>window.submissions),1);assert.equal(requests.length,5);
    assert.equal(await f.locator('textarea').nth(0).inputValue(),'第一空');assert.equal(await f.locator('textarea').nth(1).inputValue(),'第二空');
    assert.equal(await f.locator('.check_answer_dx').count(),2);
    const editor=c.page.frames().find(f=>f.url().endsWith('/editor'));assert.equal(await editor.locator('body').innerText(),'合成简答内容 <安全文本>');
    await c.page.screenshot({path:path.join(artifacts,'course.png'),fullPage:true});await c.page.close();
  });
  await record('Manual-submit mode fills answers but never clicks submit',async()=>{
    const c=await openCourse('manual',{autoSubmit:false});const s=await c.stopped();assert.match(s.message,/手动提交/);assert.equal(await c.quizFrame().evaluate(()=>window.submitClicks),0);await c.page.close();
  });
  await record('Low-confidence answers still fill and submit exactly once',async()=>{
    apiMode='low';requests=[];const c=await openCourse('low',{minConfidence:1});const s=await c.stopped();assert.match(s.message,/没有下一节/);
    const f=c.quizFrame();assert.equal(await f.locator('.check_answer').count(),1);assert.equal(await f.evaluate(()=>window.submitClicks),1);assert.equal(await f.evaluate(()=>window.submissions),1);assert.equal(requests.length,1);
    await c.page.close();apiMode='normal';
  });
  for(const mode of ['invalid-option','malformed'])await record(`${mode} AI response stops without filling or submitting`,async()=>{
    apiMode=mode;const c=await openCourse(mode);await c.stopped();const f=c.quizFrame();assert.equal(await f.locator('.check_answer').count(),0);assert.equal(await f.evaluate(()=>window.submitClicks),0);await c.page.close();apiMode='normal';
  });
  await record('Stopping an in-flight request aborts it and leaves answers empty',async()=>{
    requests=[];delayMs=2000;const c=await openCourse('stop');await until(()=>requests.length===1);await c.command('STOP');await wait(2400);
    assert.equal((await c.status()).running,false);assert.equal(await c.quizFrame().locator('.check_answer').count(),0);assert.equal(await c.quizFrame().evaluate(()=>window.submitClicks),0);assert.equal(requests[0].aborted,true);delayMs=0;await c.page.close();
  });
  await record('A question changed during the AI request rejects the stale answer',async()=>{
    requests=[];delayMs=700;const c=await openCourse('stale');await until(()=>requests.length===1);await c.quizFrame().locator('.Zy_TItle').evaluate(el=>el.textContent='换题后的新题干');const s=await c.stopped();assert.match(s.message,/题目内容已变化/);assert.equal(await c.quizFrame().locator('.check_answer').count(),0);delayMs=0;await c.page.close();
  });
  await record('Reloading the nested quiz iframe abandons its in-flight answer',async()=>{
    requests=[];delayMs=700;const c=await openCourse('frame-reload');await until(()=>requests.length===1);await c.quizFrame().evaluate(()=>location.reload());const s=await c.stopped();assert.match(s.message,/页面已变化/);assert.equal(await c.quizFrame().locator('.check_answer').count(),0);assert.equal(await c.quizFrame().evaluate(()=>window.submitClicks),0);delayMs=0;await c.page.close();
  });
  await record('A hidden boolean answer that fails to update prevents submission',async()=>{
    const c=await openCourse('boolean-hidden');const s=await c.stopped();assert.match(s.message,/回读与答案不一致/);assert.equal(await c.quizFrame().evaluate(()=>window.submitClicks),0);await c.page.close();
  });
  await record('Boolean true/false encoding is checked against the visible option',async()=>{
    const c=await openCourse('boolean-true');const s=await c.stopped();assert.match(s.message,/没有下一节/);assert.equal(await c.quizFrame().evaluate(()=>window.submissions),1);await c.page.close();
  });
  await record('A hidden field that fails to update prevents submission',async()=>{
    const c=await openCourse('bad-hidden');const s=await c.stopped();assert.match(s.message,/回读与答案不一致/);assert.equal(await c.quizFrame().evaluate(()=>window.submitClicks),0);await c.page.close();
  });
  await record('The platform incomplete-answer dialog is cancelled',async()=>{
    const c=await openCourse('incomplete');const s=await c.stopped();assert.match(s.message,/有未答题/);assert.equal(await c.quizFrame().evaluate(()=>window.submissions),0);assert.equal(await c.page.locator('#workpop').isVisible(),false);await c.page.close();
  });
  await record('A real HTML media end triggers next chapter then quiz submission',async()=>{
    const c=await openCourse('video');const s=await c.stopped();assert.match(s.message,/没有下一节/);assert.equal(await c.page.evaluate(()=>window.nextClicks),1);assert.equal(await c.quizFrame().evaluate(()=>window.submissions),1);await c.page.close();
  });
  await record('Visible image question is cropped and sent as image content',async()=>{
    requests=[];const c=await openCourse('image');await c.page.bringToFront();const s=await c.stopped();assert.match(s.message,/没有下一节/);assert.match(requests[0].body.messages.at(-1).content[1].image_url.url,/^data:image\/jpeg;base64,/);await c.page.close();
  });
  await record('Changing courses while awaiting an answer stops the session',async()=>{
    requests=[];delayMs=700;const c=await openCourse('course-switch');await until(()=>requests.length===1);await c.page.evaluate(()=>history.pushState({},'',location.href.replace('courseId=fixture','courseId=another')));const s=await c.stopped();assert.match(s.message,/另一门课程/);assert.equal(await c.quizFrame().locator('.check_answer').count(),0);delayMs=0;await c.page.close();
  });
  await record('Switching tabs during capture discards the image before any AI request',async()=>{
    requests=[];const other=await context.newPage();await other.goto('about:blank');
    const otherId=await worker.evaluate(async()=>(await chrome.tabs.query({active:true}))[0].id);
    await worker.evaluate(id=>{globalThis.originalCaptureForTest=chrome.tabs.captureVisibleTab;chrome.tabs.captureVisibleTab=async(...args)=>{const image=await originalCaptureForTest(...args);await chrome.tabs.update(id,{active:true});await new Promise(r=>setTimeout(r,100));return image;};},otherId);
    try {const c=await openCourse('image');await c.page.bringToFront();const s=await c.stopped();assert.match(s.message,/截图期间切换/);assert.equal(requests.length,0);await c.page.close();}
    finally {await worker.evaluate(()=>{chrome.tabs.captureVisibleTab=originalCaptureForTest;delete globalThis.originalCaptureForTest;});await other.close();}
  });
  await record('Unknown platform type cannot be inferred as single choice from its text',async()=>{
    requests=[];const c=await openCourse('unknown-type');const s=await c.stopped();assert.match(s.message,/题型编码不支持/);assert.equal(requests.length,0);assert.equal(await c.quizFrame().evaluate(()=>window.submitClicks),0);await c.page.close();
  });
  for(const mode of ['video-manual','video-error','video-unconfirmed'])await record(`${mode} popup stops without unintended submit or continue`,async()=>{
    const c=await openCourse(mode,{autoSubmit:mode!=='video-manual'});const s=await c.stopped();
    assert.match(s.message,mode==='video-manual'?/手动提交/:mode==='video-error'?/弹题未通过/:/避免重复提交/);
    const f=c.page.frames().find(f=>f.url().includes('/modules/video/'));assert.equal(await f.evaluate(()=>window.popupSubmits),mode==='video-manual'?0:1);assert.equal(await f.evaluate(()=>window.popupContinues),0);await c.page.close();
  });
  assert.deepEqual(errors,[]);report(true);console.log(JSON.stringify({passed:results.length,errors}));
})().catch(e=>{console.error(e.stack);fs.writeFileSync(path.join(artifacts,'browser-failure.txt'),e.stack);process.exitCode=1;}).finally(async()=>{await context?.close();await new Promise(r=>server?server.close(r):r());});
