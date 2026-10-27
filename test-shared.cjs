const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const gameHtml = fs.readFileSync(__dirname+'/index.html','utf8');
const source = gameHtml.slice(gameHtml.indexOf('// Shared game transport.'),gameHtml.indexOf('const originalHTML='));
const seed = JSON.parse(gameHtml.match(/<script id="embedded-pack" type="application\/json">([\s\S]*?)<\/script>/)[1]);
function session(fetch) {
  const elements = new Map();
  const element = id => { if (!elements.has(id)) elements.set(id,{ disabled:false, textContent:'' }); return elements.get(id); };
  const ctx = vm.createContext({
    location:{protocol:'https:'}, fetch, AbortSignal, console,
    pack:structuredClone(seed), draft:structuredClone(seed), dirty:true, screen:'home',
    validate:p=>structuredClone(p), app:{querySelectorAll:()=>[]},
    $:element, localStorage:{setItem(){}}, window:{addEventListener(){}},
    document:{hidden:false}, setInterval(){}, home(){ctx.screen='home';}, toast:s=>{ctx.lastToast=s;}
  });
  vm.runInContext(source,ctx);
  return {ctx, run:s=>vm.runInContext(s,ctx),element};
}
(async()=>{
  let row={pack:structuredClone(seed),revision:1};
  const transport=async(url,opts)=>{
    if(opts.method==='POST'){
      const body=JSON.parse(opts.body);
      if(body.revision!==row.revision)return {ok:false,status:409,json:async()=>({error:'Conflict'})};
      row={pack:body.pack,revision:row.revision+1};
    }
    return {ok:true,json:async()=>structuredClone(row)};
  };
  const a=session(transport),b=session(transport);
  await a.run('loadSharedGame()');await b.run('loadSharedGame()');
  a.ctx.screen='editor';a.ctx.draft.title='Published across browsers';
  await a.run('saveGame()');
  assert.equal(row.pack.title,'Published across browsers');
  const fresh=session(transport);await fresh.run('loadSharedGame()');
  assert.equal(fresh.ctx.pack.title,'Published across browsers');
  b.ctx.screen='editor';b.ctx.draft.title='Stale edit';await b.run('saveGame()');
  assert.equal(row.pack.title,'Published across browsers');
  assert.equal(b.ctx.dirty,true);assert.match(b.element('#saveState').textContent,/Someone else saved first/);
  const offline=session(async()=>{throw Error('Network down');});
  await offline.run('loadSharedGame()');
  assert.equal(offline.element('#start').disabled,true);
  assert.equal(offline.element('#edit').disabled,true);
  a.ctx.screen='editor';a.ctx.dirty=true;a.ctx.draft.title='Kept on failure';
  a.ctx.fetch=async()=>{throw Error('Network down');};await a.run('saveGame()');
  assert.equal(a.ctx.dirty,true);assert.equal(a.ctx.draft.title,'Kept on failure');
  assert.match(a.element('#saveState').textContent,/Publish failed/);
  assert.equal(a.element('#homeBtn').disabled,false);
  const validator=fs.readFileSync(__dirname+'/supabase/functions/shared-game/index.ts','utf8').split('// This endpoint')[0];
  const v=vm.createContext({input:seed});vm.runInContext(validator,v);
  assert.equal(vm.runInContext('validate(input).title',v),seed.title);
  v.input={...seed,title:''};assert.throws(()=>vm.runInContext('validate(input)',v));
  const html=fs.readFileSync(__dirname+'/index.html','utf8');
  const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].filter(m=>!m[0].startsWith('<script id="embedded-pack"'));
  for(const s of scripts)new vm.Script(s[1]);
  console.log('PASS: shared save, fresh-session load, conflicting editors, load failure, save failure, server validation, HTML syntax');
})().catch(e=>{console.error(e);process.exitCode=1;});

