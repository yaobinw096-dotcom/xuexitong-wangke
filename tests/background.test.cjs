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
  const sandbox={chrome,URL,AbortController,setTimeout,clearTimeout,crypto:webcrypto,console,
    fetch:async(url,init)=>{calls.push({url,init});return {ok:options.httpStatus===undefined,status:options.httpStatus,json:async()=>({choices:[{message:{content:JSON.stringify(options.answer || {answers:['A']})}}]})};}};
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
