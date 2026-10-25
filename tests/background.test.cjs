const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');

const ui = {id:'test-extension',url:'chrome-extension://test-extension/options.html',frameId:0};
const course = {id:'test-extension',url:'https://mooc1.chaoxing.com/mycourse/studentstudy?courseId=1',frameId:0,tab:{id:7,windowId:3}};
const question = {type:'single',text:'test',options:[{key:'A',text:'one'},{key:'B',text:'two'}],slots:0};
const config = {apiBase:'https://api.example.com/v1',apiKey:'unit-test-placeholder',model:'unit-model'};
function harness(options={}) {
  let handler, accessLevel;
  const local={}, session={}, calls=[];
  const storage = (data, beforeSet=async()=>{}) => ({get:async key=>({[key]:data[key]}),set:async value=>{await beforeSet(value);Object.assign(data,value);},remove:async key=>{delete data[key];},setAccessLevel:async value=>{accessLevel=value.accessLevel;}});
  const chrome={runtime:{id:ui.id,getURL:p=>`chrome-extension://${ui.id}/${p}`,onMessage:{addListener:fn=>{handler=fn;}},openOptionsPage:async()=>{}},
    tabs:{onActivated:{addListener(){}},onRemoved:{addListener(){}},query:async()=>[{id:7}]},
    permissions:{contains:options.permission|| (async()=>true)},
    storage:{local:storage(local),session:storage(session,options.beforeSessionSet)}};
  const sandbox={chrome,URL,AbortController,setTimeout:options.setTimeout||setTimeout,clearTimeout,crypto:webcrypto,console,
    fetch:async(url,init)=>{calls.push({url,init});if(options.fetch)return options.fetch(url,init);const status=options.httpStatus??200;return {ok:status>=200&&status<300,status,
      headers:{get:name=>name.toLowerCase()==='retry-after'?(options.retryAfter??null):null},
      json:async()=>Object.hasOwn(options,'payload')?options.payload:{choices:[{message:{content:JSON.stringify(options.answer || {answers:['A']})}}]}};}};
  vm.createContext(sandbox);
  sandbox.importScripts=name=>vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension',name),'utf8'),sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/background.js'),'utf8'),sandbox);
  const send=(m,sender=course)=>new Promise(resolve=>{const pending=handler(m,sender,resolve);if(!pending)resolve(undefined);});
  return {send,calls,local,session,get accessLevel(){return accessLevel;}};
}
async function ready(h) {await h.send({type:'SAVE_CONFIG',config},ui);await h.send({type:'SET_RUN',enabled:true,courseId:'course'});}
test('course configuration does not expose the API key, model or endpoint',async()=>{
  const h=harness();await ready(h);const r=await h.send({type:'GET_CONFIG'});
  assert.equal(h.accessLevel,'TRUSTED_CONTEXTS');assert.equal(r.data.hasAI,true);
  for(const key of ['apiKey','apiBase','model'])assert.equal(r.data[key],undefined);
  assert.equal((await h.send({type:'GET_CONFIG'},ui)).data.apiKey,config.apiKey);
});
test('foreign extensions, deceptive domains and independent exam pages cannot call the worker',async()=>{
  const h=harness();await ready(h);
  for(const sender of [{...course,id:'other'}, {...course,url:'https://chaoxing.com.example.com/mycourse/studentstudy'}, {...course,url:'https://mooc1.chaoxing.com/exam/test'}, {...course,url:'https://mooc1.chaoxing.com/mycourse/studentstudy-other'}])assert.equal(await h.send({type:'GET_CONFIG'},sender),undefined);
});
test('course scripts cannot replace the stored API configuration',async()=>{
  const h=harness();await ready(h);const r=await h.send({type:'SAVE_CONFIG',config:{...config,apiBase:'https://other.example.com'}});
  assert.equal(r.ok,false);assert.equal(h.local.settings.apiBase,config.apiBase);
});
test('paused sessions cannot issue a paid AI request',async()=>{
  const h=harness();await h.send({type:'SAVE_CONFIG',config},ui);assert.equal((await h.send({type:'SOLVE',question})).ok,false);assert.equal(h.calls.length,0);
});
test('unsupported question payloads are rejected before fetch',async()=>{
  const h=harness();await ready(h);assert.equal((await h.send({type:'SOLVE',question:{...question,type:'unknown'}})).ok,false);assert.equal(h.calls.length,0);
});
test('cancellation during permission checking prevents the later fetch',async()=>{
  let release;const gate=new Promise(r=>{release=r;});const h=harness({permission:()=>gate});await ready(h);
  const solve=h.send({type:'SOLVE',question});await new Promise(r=>setImmediate(r));await h.send({type:'CANCEL'});release(true);
  assert.equal((await solve).ok,false);assert.equal(h.calls.length,0);
});
test('API fetch omits cookies and refuses redirects',async()=>{
  const h=harness();await ready(h);assert.equal((await h.send({type:'SOLVE',question})).ok,true);
  assert.equal(h.calls[0].url,'https://api.example.com/v1/chat/completions');
  assert.equal(h.calls[0].init.credentials,'omit');assert.equal(h.calls[0].init.redirect,'error');
  const body=JSON.parse(h.calls[0].init.body);assert.equal(body.model,'unit-model');assert.equal(h.calls[0].init.headers.Authorization,`Bearer ${config.apiKey}`);
});
test('stored legacy thresholds cannot block valid AI answers',async()=>{
  for(const answer of [{answers:['A']},{answers:['A'],confidence:0},{answers:['A'],confidence:.75}]){
    const h=harness({answer});await ready(h);h.local.settings.minConfidence=1;
    const r=await h.send({type:'SOLVE',question});assert.equal(r.ok,true,r.error);assert.equal(r.data.answers[0],'A');
    assert.equal((await h.send({type:'GET_CONFIG'},ui)).data.minConfidence,undefined);
    assert.doesNotMatch(JSON.parse(h.calls[0].init.body).messages[0].content,/confidence|置信度/);
  }
});
test('a slow start storage write cannot overwrite a later stop',async()=>{
  const h=harness({beforeSessionSet:async value=>{if(Object.values(value)[0].enabled)await new Promise(r=>setTimeout(r,25));}});
  const start=h.send({type:'SET_RUN',enabled:true,courseId:'course'});const stop=h.send({type:'SET_RUN',enabled:false,courseId:'course'});await Promise.all([start,stop]);
  assert.equal((await h.send({type:'GET_RUN'})).data.enabled,false);assert.equal((await h.send({type:'SOLVE',question})).ok,false);assert.equal(h.calls.length,0);
});
test('HTTP errors report status without including response bodies or credentials',async()=>{
  const h=harness({httpStatus:401});await ready(h);const r=await h.send({type:'SOLVE',question});assert.match(r.error,/HTTP 401/);assert.equal(r.error.includes(config.apiKey),false);
});

test('only transient HTTP failures are eligible for a course retry',async()=>{
  for(const status of [408,429,500,502,503,504,400,401,403,404,422,501,505]){
    const h=harness({httpStatus:status});await ready(h);const r=await h.send({type:'SOLVE',question});
    assert.equal(r.ok,false);assert.equal(r.retryable,[408,429,500,502,503,504].includes(status),`HTTP ${status}`);assert.equal(h.calls.length,1);
  }
});

test('retry metadata respects seconds and HTTP-date Retry-After values',async()=>{
  for(const [header,min,max] of [['12',12000,12000],[new Date(Date.now()+120000).toUTCString(),118000,120000],['invalid',0,0],['-1',0,0]]){
    const h=harness({httpStatus:429,retryAfter:header});await ready(h);const r=await h.send({type:'SOLVE',question});
    assert.equal(r.retryable,true);assert.ok(r.retryAfterMs>=min&&r.retryAfterMs<=max,`${header}: ${r.retryAfterMs}`);
  }
});

test('server waits longer than five minutes stop instead of retrying early',async()=>{
  const h=harness({httpStatus:429,retryAfter:'3600'});await ready(h);const r=await h.send({type:'SOLVE',question});
  assert.equal(r.retryable,false);assert.match(r.error,/5 分钟/);assert.equal(h.calls.length,1);
});

test('fetch connection failures are retryable without exposing the raw error',async()=>{
  const h=harness({fetch:async()=>{throw new TypeError('private-transport-detail');}});await ready(h);const r=await h.send({type:'SOLVE',question});
  assert.equal(r.retryable,true);assert.match(r.error,/网络/);assert.doesNotMatch(r.error,/private-transport-detail/);
});

test('an interrupted response can retry but invalid response JSON cannot',async()=>{
  for(const [failure,retryable] of [[new TypeError('private-body-detail'),true],[new SyntaxError('private-body-detail'),false]]){
    const h=harness({fetch:async()=>({ok:true,json:async()=>{throw failure;}})});await ready(h);const r=await h.send({type:'SOLVE',question});
    assert.equal(r.retryable,retryable);assert.doesNotMatch(r.error,/private-body-detail/);
  }
});

const interruptedFetch=(_url,init)=>new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));
test('a request timeout is retryable',async()=>{
  const h=harness({fetch:interruptedFetch,setTimeout:(fn,ms)=>setTimeout(fn,ms===25000?5:ms)});await ready(h);const r=await h.send({type:'SOLVE',question});
  assert.equal(r.retryable,true);assert.match(r.error,/25 秒/);assert.equal(h.calls[0].init.signal.aborted,true);
});

test('a manually cancelled request is never retryable',async()=>{
  const h=harness({fetch:interruptedFetch});await ready(h);const solve=h.send({type:'SOLVE',question});
  await new Promise(r=>setImmediate(r));assert.equal(h.calls.length,1);await h.send({type:'CANCEL'});const r=await solve;
  assert.equal(r.retryable,false);assert.match(r.error,/取消/);assert.equal(h.calls[0].init.signal.aborted,true);
});

test('invalid response data and invalid answers are not network retries',async()=>{
  for(const options of [{payload:null},{payload:{}},{payload:{choices:[{message:{content:'not JSON'}}]}},{answer:{answers:['Z']}}]){
    const h=harness(options);await ready(h);const r=await h.send({type:'SOLVE',question});assert.equal(r.ok,false);assert.equal(r.retryable,false);assert.equal(h.calls.length,1);
  }
});
