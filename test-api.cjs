const assert=require('node:assert/strict');
const endpoint='https://vxizqupmvtaxdnwvzmyd.supabase.co/functions/v1/shared-game';
(async()=>{
  const preflight=await fetch(endpoint,{method:'OPTIONS',headers:{Origin:'https://xwesty1.github.io','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}});
  assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),'*');
  const before=await (await fetch(endpoint)).json();
  const publish=async body=>fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  // Re-save identical live content to verify persistence without changing the game.
  const saved=await publish({pack:before.pack,revision:before.revision});assert.equal(saved.status,200);
  const row=await saved.json();assert.equal(row.revision,before.revision+1);
  const fresh=await (await fetch(endpoint)).json();assert.deepEqual(fresh.pack,before.pack);assert.equal(fresh.revision,row.revision);
  const conflict=await publish({pack:before.pack,revision:before.revision});assert.equal(conflict.status,409);
  const invalid=await publish({pack:{...before.pack,title:''},revision:row.revision});assert.equal(invalid.status,400);
  const after=await (await fetch(endpoint)).json();assert.equal(after.revision,row.revision);
  console.log('PASS: deployed anonymous GET/POST, CORS, persisted fresh read, stale save 409, invalid pack 400; revision '+row.revision);
})().catch(e=>{console.error(e);process.exitCode=1;});

