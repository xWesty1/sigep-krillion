const clone=x=>JSON.parse(JSON.stringify(x));
const DEFAULT_CATEGORIES=[{id:'plankton',name:'Plankton',points:10,color:'#afbdcb'},{id:'too-clever',name:'Too Clever',points:15,color:'#ffb16b'},{id:'schooler',name:'Schooler',points:30,color:'#79cfdf'},{id:'rare',name:'Rare',points:60,color:'#6af0bb'},{id:'deep-cut',name:'Deep Cut',points:85,color:'#c49aff'},{id:'krillion',name:'One in a Krillion',points:100,color:'#ff5896'}];
function normalize(s){return s.normalize('NFKC').toLowerCase().trim().replace(/\s+/g,' ')}
function migrate(p){if(!p||p.format!=='deep-dive'||![1,2].includes(p.version))throw Error('This is not a supported Deep Dive pack.');p=clone(p);if(p.version===1){p.categories=clone(DEFAULT_CATEGORIES);if(!Array.isArray(p.questions))throw Error('Questions must be a list.');for(const q of p.questions){if(!Array.isArray(q.answers))throw Error('Answers must be a list.');for(const a of q.answers){if(!Number.isInteger(a.points)||a.points<0||a.points>100)throw Error('Invalid points in the older pack.');let cat=p.categories.find(c=>c.points===a.points);if(!cat){cat={id:'legacy-'+a.points,name:a.points+' points',points:a.points,color:'#9bacc5'};p.categories.push(cat)}a.category=cat.id;delete a.points}}p.version=2}return p}
function validate(input){const p=migrate(input);if(typeof p.title!=='string'||!p.title.trim()||p.title.length>120)throw Error('Add a title (up to 120 characters).');if(typeof p.description!=='string'||p.description.length>2000)throw Error('Keep the description under 2,000 characters.');if(!Number.isInteger(p.seconds)||p.seconds<5||p.seconds>180)throw Error('Set a whole-number time limit from 5 to 180 seconds.');if(!Array.isArray(p.categories)||p.categories.length<1||p.categories.length>50)throw Error('Include 1–50 scoring categories.');let ids=new Set(),names=new Set();const categories=p.categories.map(c=>{if(typeof c.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(c.id)||ids.has(c.id))throw Error('Category IDs must be unique.');if(typeof c.name!=='string'||!c.name.trim()||c.name.length>60||names.has(normalize(c.name)))throw Error('Give each category a unique name, up to 60 characters.');if(!Number.isInteger(c.points)||c.points<0||c.points>10000)throw Error('Category points must be whole numbers from 0 to 10,000.');ids.add(c.id);names.add(normalize(c.name));return{id:c.id,name:c.name.trim(),points:c.points,color:/^#[0-9a-f]{6}$/i.test(c.color)?c.color:'#8dc8e5'}});if(!Array.isArray(p.questions)||p.questions.length<1||p.questions.length>100)throw Error('Include 1–100 questions.');return {format:'deep-dive',version:2,title:p.title.trim(),description:p.description,seconds:p.seconds,categories,questions:p.questions.map((q,i)=>{if(typeof q.prompt!=='string'||!q.prompt.trim()||q.prompt.length>500)throw Error(`Question ${i+1}: add a prompt under 500 characters.`);if(!Array.isArray(q.answers)||q.answers.length<1||q.answers.length>1000)throw Error(`Question ${i+1}: include 1–1,000 answers.`);const seen=new Set();return{prompt:q.prompt.trim(),answers:q.answers.map(a=>{if(typeof a.text!=='string'||!a.text.trim()||a.text.length>150)throw Error(`Question ${i+1}: each answer needs a name under 150 characters.`);if(!ids.has(a.category))throw Error(`Question ${i+1}: choose a category for every answer.`);if(!Array.isArray(a.aliases)||a.aliases.length>30||a.aliases.some(s=>typeof s!=='string'||!s.trim()||s.length>150))throw Error(`Question ${i+1}: invalid alternate spellings.`);for(const s of new Set([a.text,...a.aliases].map(normalize))){if(seen.has(s))throw Error(`Question ${i+1}: “${s}” belongs to more than one answer.`);seen.add(s)}return{text:a.text.trim(),category:a.category,aliases:a.aliases.map(s=>s.trim())}})}})}}
// This endpoint intentionally allows anonymous publishing, as requested.
// Privileged credentials remain in the Supabase function environment.
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store'
};
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: cors });
async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (!['GET', 'POST'].includes(req.method)) return reply({ error: 'Method not allowed.' }, 405);
  try {
    const endpoint = Deno.env.get('SUPABASE_URL') + '/rest/v1/shared_games?id=eq.main';
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const headers = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
    let response;
    if (req.method === 'GET') {
      response = await fetch(endpoint + '&select=pack,revision,updated_at', { headers });
    } else {
      if (!req.headers.get('content-type')?.includes('application/json')) return reply({ error: 'Send JSON.' }, 415);
      if (Number(req.headers.get('content-length')) > 5242880) return reply({ error: 'Game is too large (maximum 5 MB).' }, 413);
      const text = await req.text();
      if (new TextEncoder().encode(text).length > 5242880) return reply({ error: 'Game is too large (maximum 5 MB).' }, 413);
      let body, pack;
      try {
        body = JSON.parse(text);
        if (!Number.isSafeInteger(body.revision) || body.revision < 1 || body.revision >= 2147483647) throw Error('Invalid game version.');
        pack = validate(body.pack);
      } catch (error) { return reply({ error: error.message || 'Invalid game.' }, 400); }
      response = await fetch(endpoint + '&revision=eq.' + body.revision + '&select=pack,revision,updated_at', {
        method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({ pack, revision: body.revision + 1 })
      });
    }
    if (!response.ok) {
      console.error('Shared game database request failed:', response.status);
      return reply({ error: 'The game could not be saved or loaded. Please retry.' }, 503);
    }
    const rows = await response.json();
    if (!rows.length) return reply({ error: req.method === 'POST' ? 'Someone else saved first. Reload the latest game before publishing.' : 'Shared game is not initialized.' }, req.method === 'POST' ? 409 : 503);
    return reply(rows[0]);
  } catch {
    return reply({ error: 'The shared game is temporarily unavailable. Please retry.' }, 503);
  }
}
Deno.serve(handler);

