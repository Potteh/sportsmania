import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3100);
const leagues = {
  NFL:'football/nfl', NBA:'basketball/nba', MLB:'baseball/mlb',
  NHL:'hockey/nhl', NCAAF:'football/college-football',
  NCAAB:'basketball/mens-college-basketball', WNBA:'basketball/wnba',
  MLS:'soccer/usa.1', EPL:'soccer/eng.1', UCL:'soccer/uefa.champions'
};
const cache = new Map();
function ymd(d){return d.toISOString().slice(0,10).replaceAll('-','');}
function normalize(event) {
  const c = event.competitions?.[0] || {};
  const teams = (c.competitors || []).map(t => ({
    name:t.team?.displayName || t.team?.name || 'Unknown', abbreviation:t.team?.abbreviation || '',
    logo:t.team?.logo || '', score:t.score ?? null, homeAway:t.homeAway,
    winner:!!t.winner, record:t.records?.[0]?.summary || ''
  }));
  return {id:event.id, name:event.name, date:event.date, status:event.status?.type?.name || '',
    detail:event.status?.type?.shortDetail || event.status?.type?.detail || '',
    state:event.status?.type?.state || 'pre', teams, venue:c.venue?.fullName || '',
    broadcast:c.broadcasts?.flatMap(b=>b.names||[])?.join(', ') || ''};
}
async function getScores(league,date){
  const key=league+':'+date, now=Date.now(), prior=cache.get(key);
  if(prior && now-prior.time<12000)return prior.data;
  const endpoint='https://site.api.espn.com/apis/site/v2/sports/'+leagues[league]+'/scoreboard?dates='+date+'&limit=250';
  try {
    const response=await fetch(endpoint,{headers:{'User-Agent':'SportsMania/1.0'},signal:AbortSignal.timeout(9000)});
    if(!response.ok)throw Error('Provider returned '+response.status);
    const payload=await response.json();
    const data={league,date,events:(payload.events||[]).map(normalize),updatedAt:new Date().toISOString()};
    cache.set(key,{time:now,data});return data;
  }catch(e){if(prior)return {...prior.data,stale:true};throw e;}
}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/api/scores'){
      const league=(url.searchParams.get('league')||'NFL').toUpperCase();
      const date=url.searchParams.get('date')||ymd(new Date());
      if(!Object.hasOwn(leagues,league)||!/^[0-9]{8}$/.test(date)){res.writeHead(400);res.end('Invalid league or date');return;}
      const data=await getScores(league,date);
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));return;
    }
    const requested=url.pathname==='/'?'/index.html':url.pathname;
    if(!['/index.html','/styles.css','/app.js'].includes(requested)){res.writeHead(404);res.end('Not found');return;}
    const file=path.join(root,'public',requested);
    const data=await readFile(file);
    res.writeHead(200,{'Content-Type':mime[path.extname(file)],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(data);
  }catch(e){res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Score provider unavailable. Try again shortly.'}));}
}).listen(PORT,'0.0.0.0',()=>console.log('SportsMania listening on '+PORT));
