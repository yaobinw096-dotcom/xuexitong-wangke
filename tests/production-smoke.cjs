const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),extension=path.join(root,'extension');
const artifacts=path.join(root,'artifacts');fs.mkdirSync(artifacts,{recursive:true});
let context;
(async()=>{
  const option=process.env.KEBAN_BROWSER_PATH?{executablePath:process.env.KEBAN_BROWSER_PATH}:{channel:'chromium'};
  context=await chromium.launchPersistentContext(path.join(artifacts,`production-profile-${Date.now()}`),{...option,headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  const page=await context.newPage();await page.goto(worker.url().replace('background.js','options.html'));
  const config=await page.evaluate(()=>chrome.runtime.sendMessage({type:'GET_CONFIG'}));assert.equal(config.ok,true);assert.equal(config.data.apiKey,'');
  await page.evaluate(()=>chrome.runtime.sendMessage({type:'SAVE_CONFIG',config:{apiBase:'https://api.example.com/v1',model:'smoke-model'}}));
  const result=await page.evaluate(()=>chrome.runtime.sendMessage({type:'TEST_API'}));assert.equal(result.ok,false);assert.match(result.error,/尚未授权/);
  const permissions=await worker.evaluate(()=>chrome.permissions.getAll());assert.ok(!permissions.origins.includes('<all_urls>'));assert.ok(!permissions.origins.includes('https://api.example.com/*'));
  const report={completed:true,browser:context.browser().version(),manifestModified:false,passed:['Production manifest loads and settings are readable','API without optional host permission is blocked','No all-URLs or API permission was granted']};
  fs.writeFileSync(path.join(artifacts,'production-results.json'),JSON.stringify(report,null,2));console.log('PASS production manifest: load, configuration and denied optional API permission');
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(()=>context?.close());
