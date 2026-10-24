const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const path = require('node:path');
const sandbox = {URL}; vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../extension/core.js'), 'utf8'), sandbox);
const K = sandbox.Keban;
const single = {type:'single', options:[{key:'A'}, {key:'B'}], slots:0};
test('base URL and complete endpoint are normalized consistently', () => {
  assert.equal(K.endpoint('https://api.example.com/v1/').href, 'https://api.example.com/v1/chat/completions');
  assert.equal(K.endpoint('https://api.example.com/v1/chat/completions').href, 'https://api.example.com/v1/chat/completions');
  assert.equal(K.originPattern(K.endpoint('http://127.0.0.1:1234/v1')), 'http://127.0.0.1/*');
});
test('unsafe API URL forms rejected', () => {
  for (const url of ['http://example.com/v1', 'https://user:pass@example.com/v1', 'https://example.com/v1?key=x', 'file:///v1']) assert.throws(() => K.endpoint(url));
});
test('valid fenced JSON accepted without a confidence field', () => assert.equal(K.answer('```json\n{"answers":["A"]}\n```', single).answers[0], 'A'));
test('valid answers do not depend on optional legacy confidence values', () => {
  for (const confidence of [undefined, 0, .2, .75, 'bad', null, -1, 2]) {
    const result = K.answer({answers:['A'], confidence, explanation:'test'}, single);
    assert.equal(result.answers[0], 'A'); assert.equal(result.explanation, 'test');
    assert.equal(Object.hasOwn(result, 'confidence'), false);
  }
});
test('invalid format, empty answers and invented options remain rejected', () => {
  for (const value of ['text', '{"answers":[]}', '{"answers":[""]}', '{"answers":["C"]}', '{"answers":["A","B"]}', '{"answers":[1]}']) assert.throws(() => K.answer(value, single));
});
test('multiple-choice duplicates rejected', () => assert.throws(() => K.answer({answers:['A','A']}, {...single,type:'multiple'})));
test('blank count must match all slots', () => assert.throws(() => K.answer({answers:['one']}, {type:'blank', slots:2})));
test('config validates speed and drops unknown properties', () => {
  assert.throws(() => K.config({rate:16}));
  assert.equal(K.config({unexpected:'x'}).unexpected, undefined);
});
test('old confidence settings are ignored without changing API or playback settings', () => {
  for (const minConfidence of [1, 'bad']) {
    const config = K.config({minConfidence, apiBase:'https://api.example.com/v1', apiKey:'unit-test-placeholder', model:'unit-model', rate:1.5, autoSubmit:false});
    assert.equal(Object.hasOwn(config, 'minConfidence'), false);
    assert.equal(config.apiBase, 'https://api.example.com/v1'); assert.equal(config.apiKey, 'unit-test-placeholder'); assert.equal(config.model, 'unit-model');
    assert.equal(config.rate, 1.5); assert.equal(config.autoSubmit, false);
  }
});
test('unknown question types and missing choices are rejected before requesting AI', () => {
  assert.throws(() => K.question({...single, text:'test', type:'unknown'}));
  assert.throws(() => K.question({...single, text:'test', options:[]}));
});
test('oversize stems are rejected instead of silently truncated', () => assert.throws(() => K.question({...single,text:'x'.repeat(18001)})));
test('question serializer keeps only the expected fields', () => {
  const q = K.question({type:'single',text:'test',options:[{key:'A',text:'one'},{key:'B',text:'two'}],slots:0,extra:'unused'});
  assert.equal(q.extra,undefined); assert.equal(q.options.length,2);
});
