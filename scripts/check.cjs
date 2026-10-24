const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname,'..');
const topFiles=['README.md','LICENSE','NOTICE.md','PRIVACY.md','SECURITY.md','CONTRIBUTING.md','CHANGELOG.md','package.json','package-lock.json','.gitignore','.gitattributes'];
const directories=['extension','tests','scripts','docs','.github'];
const files=[...topFiles];
function collect(folder) {for(const e of fs.readdirSync(path.join(root,folder),{withFileTypes:true})){const p=`${folder}/${e.name}`;assert.ok(!e.isSymbolicLink(),`Symlink is not permitted in release source: ${p}`);if(e.isDirectory())collect(p);else files.push(p);}}
directories.forEach(collect);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'extension/manifest.json')));
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
assert.equal(manifest.manifest_version,3);assert.equal(manifest.version_name,pkg.version);
assert.deepEqual(manifest.permissions,['storage','activeTab']);assert.equal(manifest.host_permissions,undefined);
assert.ok(manifest.content_scripts.every(s=>s.all_frames===false && s.matches.every(p=>p.includes('/mycourse/studentstudy'))));
assert.ok(fs.readFileSync(path.join(root,'LICENSE'),'utf8').startsWith('MIT License'));
const blocked=[/[A-Za-z]:[\\/]Users[\\/][^\s"'<>]+/i,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\b(?:ghp_|github_pat_)[A-Za-z0-9_]{30,}\b/,/\bsk-[A-Za-z0-9_-]{25,}\b/];
for(const file of files){
  const data=fs.readFileSync(path.join(root,file));
  if(/\.(png|zip)$/.test(file))continue;
  const text=data.toString('utf8');for(const pattern of blocked)assert.ok(!pattern.test(text),`Potential private path/credential in ${file}`);
  if(file.endsWith('.js')||file.endsWith('.cjs')){const r=spawnSync(process.execPath,['--check',path.join(root,file)],{encoding:'utf8'});assert.equal(r.status,0,`${file}: ${r.stderr}`);}
  if(file.endsWith('.md'))for(const match of text.matchAll(/\]\(([^)]+)\)/g)){
    const target=match[1];if(/^(?:https?:|#)/.test(target))continue;
    const resolved=path.resolve(root,path.dirname(file),target.split('#')[0]);assert.ok(resolved.startsWith(root+path.sep),`Out-of-repo link: ${file}`);assert.ok(fs.existsSync(resolved),`Broken link ${file}: ${target}`);
  }
  if(file.startsWith('extension/'))assert.ok(!/synthetic-key-not-a-secret|fixture-model|daxuesoutijiang\.com/.test(text),`Test data or original backend in ${file}`);
}
const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json')));
assert.equal(lock.packages['node_modules/playwright'].version,pkg.devDependencies.playwright);
assert.ok(Object.values(lock.packages).filter(p=>p.resolved).every(p=>p.resolved.startsWith('https://registry.npmjs.org/')&&p.integrity));
console.log(`PASS ${files.length} public files: syntax, private-pattern scan, local links, manifest permissions, version and locked dependencies`);
