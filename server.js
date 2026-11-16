import http from 'node:http';
import { readFile, mkdir, appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import webpush from 'web-push';

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3100);
const leagues = {
  NFL:'football/nfl', NBA:'basketball/nba', MLB:'baseball/mlb',
  NHL:'hockey/nhl', NCAAF:'football/college-football',
  NCAAB:'basketball/mens-college-basketball', WNBA:'basketball/wnba',
  MLS:'soccer/usa.1', EPL:'soccer/eng.1', UCL:'soccer/uefa.champions'
};
const cache = new Map();
const chatRooms=new Map(), chatRate=new Map();
const CHAT_FILE=path.join(root,'data','chat.jsonl');
const moderation={blocked:new Set(),muted:new Map(),reports:[]};
const MOD_FILE=path.join(root,'data','moderation.json');
try{const m=JSON.parse(await readFile(MOD_FILE,'utf8'));moderation.blocked=new Set(m.blocked||[]);moderation.muted=new Map(m.muted||[]);moderation.reports=m.reports||[];}catch{}
const saveModeration=async()=>{await mkdir(path.dirname(MOD_FILE),{recursive:true});await (await import('node:fs/promises')).writeFile(MOD_FILE,JSON.stringify({blocked:[...moderation.blocked],muted:[...moderation.muted],reports:moderation.reports.slice(-500)}));};
const adminToken=process.env.SPORTSMANIA_ADMIN_TOKEN||'';
const PUSH_FILE=path.join(root,'data','push.json');
let pushSubscriptions=[];
try{pushSubscriptions=JSON.parse(await readFile(PUSH_FILE,'utf8'));if(!Array.isArray(pushSubscriptions))pushSubscriptions=[];}catch{}
const vapidPublic=process.env.VAPID_PUBLIC_KEY||'',vapidPrivate=process.env.VAPID_PRIVATE_KEY||'';
if(vapidPublic&&vapidPrivate)webpush.setVapidDetails(process.env.VAPID_SUBJECT||'mailto:admin@casualdisaster.me',vapidPublic,vapidPrivate);
const pushReady=!!(vapidPublic&&vapidPrivate);
const savePush=async()=>{await mkdir(path.dirname(PUSH_FILE),{recursive:true});await writeFile(PUSH_FILE,JSON.stringify(pushSubscriptions));};
const scoreSnapshots=new Map();
async function pollPush(){
 if(!pushReady||!pushSubscriptions.length)return;
 const today=ymd(new Date());
 for(const league of [...new Set(pushSubscriptions.flatMap(s=>s.teams.map(t=>t.split(':')[1])).filter(validLeague))]){
  try{const data=await getScores(league,today);for(const game of data.events){
   const key=league+':'+game.id,signature=game.state+'|'+game.teams.map(t=>t.score).join(':');
   const old=scoreSnapshots.get(key);scoreSnapshots.set(key,signature);
   if(!old||old===signature)continue;
   const relevant=pushSubscriptions.filter(s=>game.teams.some(t=>s.teams.includes(t.abbreviation+':'+league)));
   const title=old.split('|')[0]!==game.state?(game.state==='in'?'Game started':game.state==='post'?'Final score':'Game update'):'Score update';
   const body=game.teams.map(t=>t.abbreviation+' '+(t.score??'–')).join(' · ');
   for(const sub of relevant){try{await webpush.sendNotification(sub.subscription,JSON.stringify({title:title+' · '+game.name,body,url:'/sportsmania/'}),{TTL:120});}catch(e){if(e.statusCode===404||e.statusCode===410){pushSubscriptions=pushSubscriptions.filter(s=>s.subscription.endpoint!==sub.subscription.endpoint);await savePush();}}}
  }}catch(e){console.error('Push polling failed:',league,e.message);}
 }
}
setInterval(()=>{pollPush().catch(e=>console.error(e));},30000);
const cleanName=s=>String(s||'').trim().slice(0,24).toLowerCase();

try { const lines=(await readFile(CHAT_FILE,'utf8')).trim().split('\n').slice(-1500);for(const line of lines){try{const msg=JSON.parse(line);if(!chatRooms.has(msg.room))chatRooms.set(msg.room,[]);chatRooms.get(msg.room).push(msg);}catch{}}for(const [key,items] of chatRooms)chatRooms.set(key,items.slice(-100));}catch{}
const json=(res,data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
function validLeague(league){return Object.hasOwn(leagues,league)}
async function providerJson(url,ttl=60000){
 const prev=cache.get(url),now=Date.now();if(prev&&now-prev.time<ttl)return prev.data;
 try{const response=await fetch(url,{headers:{'User-Agent':'SportsMania/1.0'},signal:AbortSignal.timeout(9000)});if(!response.ok)throw Error('Provider '+response.status);const data=await response.json();cache.set(url,{time:now,data});return data;}catch(e){if(prev)return {...prev.data,stale:true};throw e;}
}
function gameProbability(event){
 const teams=event.teams||[],home=teams.find(t=>t.homeAway==='home'),away=teams.find(t=>t.homeAway==='away');
 if(!home||!away)return null;
 const winPct=t=>{const m=String(t.record||'').match(/^(\d+)-(\d+)/);return m?Number(m[1])/(Number(m[1])+Number(m[2])||1):null;};
 const h=winPct(home),a=winPct(away);if(h===null||a===null)return null;
 const homePct=Math.round(Math.max(10,Math.min(90,50+(h-a)*55+3)));
 return {home:home.abbreviation,away:away.abbreviation,homePct,awayPct:100-homePct,method:'Illustrative estimate from win-loss records and a small home advantage; not a betting forecast'};
}

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
    odds:(c.odds||[]).map(o=>({provider:o.provider?.name||o.provider?.displayName||'',details:o.details||'',overUnder:o.overUnder??null,homeMoneyLine:o.homeTeamOdds?.moneyLine??null,awayMoneyLine:o.awayTeamOdds?.moneyLine??null})).slice(0,3),
    broadcast:c.broadcasts?.flatMap(b=>b.names||[])?.join(', ') || '',
    broadcasts:[...new Set([...(c.broadcasts||[]).flatMap(b=>b.names||[]),...(c.geoBroadcasts||[]).map(b=>b.media?.shortName||b.media?.name).filter(Boolean)])]};
}
async function getPlays(league,id){
  const key='plays:'+league+':'+id, now=Date.now(), prior=cache.get(key);
  if(prior && now-prior.time<12000)return prior.data;
  const endpoint='https://site.api.espn.com/apis/site/v2/sports/'+leagues[league]+'/summary?event='+encodeURIComponent(id);
  try{
    const response=await fetch(endpoint,{headers:{'User-Agent':'SportsMania/1.0'},signal:AbortSignal.timeout(9000)});
    if(!response.ok)throw Error('Provider returned '+response.status);
    const payload=await response.json();
    const groups=payload.drives?.previous||[];
    const raw=Array.isArray(payload.plays)&&payload.plays.length?payload.plays:
      groups.flatMap(d=>d.plays||[]);
    const fallback=payload.scoringPlays||[];
    const source=raw.length?raw:fallback;
    const plays=source.map((p,i)=>({
      id:String(p.id||i),text:p.text||p.description||p.shortText||p.type?.text||'Play',
      period:p.period?.displayValue||p.period?.number||p.period||'',
      clock:p.clock?.displayValue||p.clock||'',
      team:p.team?.displayName||p.team?.abbreviation||'',
      scoring:!!p.scoringPlay,score:p.homeScore!=null&&p.awayScore!=null?String(p.awayScore)+'–'+String(p.homeScore):''
    })).filter(p=>p.text).slice(-250).reverse();
    const data={league,id,plays,updatedAt:new Date().toISOString(),available:plays.length>0};
    cache.set(key,{time:now,data});return data;
  }catch(e){if(prior)return {...prior.data,stale:true};throw e;}
}
async function getScores(league,date){
  const key=league+':'+date, now=Date.now(), prior=cache.get(key);
  if(prior && now-prior.time<12000)return prior.data;
  const endpoint='https://site.api.espn.com/apis/site/v2/sports/'+leagues[league]+'/scoreboard?dates='+date+'&limit=250';
  try {
    const response=await fetch(endpoint,{headers:{'User-Agent':'SportsMania/1.0'},signal:AbortSignal.timeout(9000)});
    if(!response.ok)throw Error('Provider returned '+response.status);
    const payload=await response.json();
    const data={league,date,events:(payload.events||[]).map(normalize).map(e=>({...e,prediction:gameProbability(e)})),updatedAt:new Date().toISOString()};
    cache.set(key,{time:now,data});return data;
  }catch(e){if(prior)return {...prior.data,stale:true};throw e;}
}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/api/news'){
      const league=(url.searchParams.get('league')||'NFL').toUpperCase();
      if(!validLeague(league))return json(res,{error:'Invalid league'},400);
      const raw=await providerJson('https://site.api.espn.com/apis/site/v2/sports/'+leagues[league]+'/news?limit=12',180000);
      return json(res,{articles:(raw.articles||[]).slice(0,12).map(a=>({headline:a.headline||'',description:a.description||'',published:a.published||'',url:a.links?.web?.href||'',image:a.images?.[0]?.url||''})),stale:!!raw.stale});
    }
    if(url.pathname==='/api/standings'){
      const league=(url.searchParams.get('league')||'NFL').toUpperCase();
      if(!validLeague(league))return json(res,{error:'Invalid league'},400);
      const raw=await providerJson('https://site.api.espn.com/apis/v2/sports/'+leagues[league]+'/standings',180000);
      const rows=[];
      const visit=(node,group='')=>{if(!node||typeof node!=='object')return;const label=node.name||node.abbreviation||group;
        for(const entry of node.standings?.entries||[]){rows.push({group,team:entry.team?.displayName||'',logo:entry.team?.logos?.[0]?.href||'',stats:(entry.stats||[]).filter(s=>['wins','losses','ties','winPercent','points','gamesPlayed','rank','streak','pointsFor','pointsAgainst'].includes(s.name)).map(s=>({name:s.name,value:s.displayValue||String(s.value??'')}))});}
        for(const child of node.children||[])visit(child,label);
      };visit(raw,'League');
      return json(res,{rows:rows.slice(0,200),available:rows.length>0,stale:!!raw.stale});
    }
    if(url.pathname==='/api/game'){
      const league=(url.searchParams.get('league')||'NFL').toUpperCase(),id=url.searchParams.get('id')||'';
      if(!validLeague(league)||!/^[a-zA-Z0-9_-]{1,80}$/.test(id))return json(res,{error:'Invalid event'},400);
      const raw=await providerJson('https://site.api.espn.com/apis/site/v2/sports/'+leagues[league]+'/summary?event='+encodeURIComponent(id),15000);
      const box=raw.boxscore||{};
      return json(res,{game:raw.header?.competitions?.[0]?.competitors?.map(t=>({name:t.team?.displayName,score:t.score,homeAway:t.homeAway}))||[],
        stats:(box.players||[]).map(t=>({team:t.team?.displayName,groups:(t.statistics||[]).map(s=>({name:s.name,labels:s.labels,athletes:(s.athletes||[]).slice(0,8).map(a=>({name:a.athlete?.displayName,stats:a.stats}))}))})),
        teamStats:(box.teams||[]).map(t=>({team:t.team?.displayName,stats:(t.statistics||[]).slice(0,25).map(s=>({name:s.label||s.name,value:s.displayValue}))})),
        scoring:(raw.scoringPlays||[]).map(p=>({text:p.text||p.description||'',clock:p.clock?.displayValue||'',period:p.period?.number||'',team:p.team?.abbreviation||''})).slice(-30),note:'Statistics depend on ESPN event coverage',stale:!!raw.stale});
    }
    if(url.pathname==='/api/push/config')return json(res,{enabled:pushReady,publicKey:pushReady?vapidPublic:''});
    if(url.pathname==='/api/push/subscribe'){
      if(req.method!=='POST')return json(res,{error:'Method not allowed'},405);
      if(!pushReady)return json(res,{error:'Push not configured'},503);
      let body='';for await(const chunk of req){body+=chunk;if(body.length>10000)return json(res,{error:'Too large'},413);}
      let data;try{data=JSON.parse(body)}catch{return json(res,{error:'Invalid JSON'},400)}
      const sub=data.subscription,teams=Array.isArray(data.teams)?data.teams.filter(t=>/^[A-Za-z0-9_-]{1,12}:(NFL|NBA|MLB|NHL|NCAAF|NCAAB|WNBA|MLS|EPL|UCL)$/.test(t)).slice(0,40):[];
      if(!sub||typeof sub.endpoint!=='string'||!sub.endpoint.startsWith('https://')||sub.endpoint.length>2000||!sub.keys?.p256dh||!sub.keys?.auth)return json(res,{error:'Invalid subscription'},400);
      pushSubscriptions=pushSubscriptions.filter(s=>s.subscription.endpoint!==sub.endpoint);
      if(data.enabled!==false&&teams.length)pushSubscriptions.push({subscription:sub,teams});
      if(pushSubscriptions.length>5000)pushSubscriptions=pushSubscriptions.slice(-5000);
      await savePush();return json(res,{ok:true,teams:teams.length});
    }
    if(url.pathname==='/api/moderation'){
      if(req.method!=='POST')return json(res,{error:'Method not allowed'},405);
      let body='';for await(const chunk of req){body+=chunk;if(body.length>4096)return json(res,{error:'Too large'},413);}
      let data;try{data=JSON.parse(body)}catch{return json(res,{error:'Invalid JSON'},400)}
      if(data.action==='report'){
        const room=String(data.room||''),id=String(data.id||''),reason=String(data.reason||'Inappropriate message').slice(0,200);
        if(!/^[A-Z]{2,5}:[a-zA-Z0-9_-]{1,80}$/.test(room)||!id||!(chatRooms.get(room)||[]).some(m=>m.id===id))return json(res,{error:'Unknown message'},400);
        moderation.reports.push({room,id,reason,time:new Date().toISOString()});await saveModeration();return json(res,{ok:true});
      }
      if(!adminToken||req.headers['x-admin-token']!==adminToken)return json(res,{error:'Unauthorized'},401);
      const name=cleanName(data.name);
      if(data.action==='list')return json(res,{reports:moderation.reports.slice(-100).map(r=>({...r,message:(chatRooms.get(r.room)||[]).find(m=>m.id===r.id)||null})),blocked:[...moderation.blocked],muted:[...moderation.muted]});
      if(data.action==='dismiss'){moderation.reports=moderation.reports.filter(r=>!(r.room===data.room&&r.id===data.id));await saveModeration();return json(res,{ok:true});}
      if(data.action==='delete'){const messages=chatRooms.get(data.room)||[];chatRooms.set(data.room,messages.filter(m=>m.id!==data.id));moderation.reports=moderation.reports.filter(r=>!(r.room===data.room&&r.id===data.id));await saveModeration();return json(res,{ok:true});}
      if(!name)return json(res,{error:'Nickname required'},400);
      if(data.action==='ban')moderation.blocked.add(name);
      else if(data.action==='unban')moderation.blocked.delete(name);
      else if(data.action==='mute')moderation.muted.set(name,Date.now()+Math.min(1440,Math.max(1,Number(data.minutes)||10))*60000);
      else if(data.action==='unmute')moderation.muted.delete(name);
      else return json(res,{error:'Unknown action'},400);
      await saveModeration();return json(res,{ok:true});
    }
    if(url.pathname==='/api/chat'){
      const room=url.searchParams.get('room')||'';
      if(!/^[A-Z]{2,5}:[a-zA-Z0-9_-]{1,80}$/.test(room))return json(res,{error:'Invalid room'},400);
      if(req.method==='GET')return json(res,{messages:chatRooms.get(room)||[]});
      if(req.method!=='POST')return json(res,{error:'Method not allowed'},405);
      const ip=req.socket.remoteAddress||'unknown',now=Date.now();
      if(now-(chatRate.get(ip)||0)<3000)return json(res,{error:'Wait 3 seconds between messages'},429);
      let body='';for await(const chunk of req){body+=chunk;if(body.length>2048)return json(res,{error:'Message too large'},413);}
      let data;try{data=JSON.parse(body)}catch{return json(res,{error:'Invalid JSON'},400)}
      const name=String(data.name||'Guest').trim().slice(0,24),message=String(data.message||'').trim().slice(0,400);
      if(!message||!name)return json(res,{error:'Name and message required'},400);
      if(moderation.blocked.has(cleanName(name)))return json(res,{error:'Nickname blocked by moderator'},403);
      if((moderation.muted.get(cleanName(name))||0)>now)return json(res,{error:'Nickname temporarily muted'},403);
      if(/https?:\/\/|www\.|discord\.gg\//i.test(message))return json(res,{error:'Links are not permitted in public chat'},400);
      const item={room,name,message,time:new Date().toISOString(),id:now.toString(36)+Math.random().toString(36).slice(2,7)};
      chatRate.set(ip,now);if(!chatRooms.has(room))chatRooms.set(room,[]);const messages=chatRooms.get(room);messages.push(item);if(messages.length>100)messages.shift();
      await mkdir(path.dirname(CHAT_FILE),{recursive:true});await appendFile(CHAT_FILE,JSON.stringify(item)+'\n');
      return json(res,{message:item},201);
    }
    if(url.pathname==='/api/calendar.ics'){
      const league=(url.searchParams.get('league')||'NFL').toUpperCase(),date=url.searchParams.get('date')||ymd(new Date());
      if(!validLeague(league)||!/^[0-9]{8}$/.test(date))return json(res,{error:'Invalid calendar request'},400);
      const scores=await getScores(league,date);
      const safe=s=>String(s||'').replace(/[;,]/g,' ').replace(/\r?\n/g,' ');
      const stamp=s=>new Date(s).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
      const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//SportsMania//Sports Calendar//EN','CALSCALE:GREGORIAN'];
      for(const game of scores.events){if(!game.date)continue;const start=new Date(game.date),end=new Date(start.getTime()+3*3600000);
        lines.push('BEGIN:VEVENT','UID:'+game.id+'-'+league+'@sportsmania','DTSTAMP:'+stamp(new Date()),'DTSTART:'+stamp(start),'DTEND:'+stamp(end),'SUMMARY:'+safe(game.name),'DESCRIPTION:'+safe(league+' - '+game.venue),'END:VEVENT');}
      lines.push('END:VCALENDAR');res.writeHead(200,{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'attachment; filename="sportsmania-'+league+'-'+date+'.ics"'});res.end(lines.join('\r\n'));return;
    }
    if(url.pathname==='/api/plays'){
      const league=(url.searchParams.get('league')||'NFL').toUpperCase();
      const id=url.searchParams.get('id')||'';
      if(!Object.hasOwn(leagues,league)||!/^[a-zA-Z0-9_-]{1,80}$/.test(id)){res.writeHead(400);res.end('Invalid league or event');return;}
      const data=await getPlays(league,id);
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));return;
    }
    if(url.pathname==='/api/scores'){
      const league=(url.searchParams.get('league')||'NFL').toUpperCase();
      const date=url.searchParams.get('date')||ymd(new Date());
      if(!Object.hasOwn(leagues,league)||!/^[0-9]{8}$/.test(date)){res.writeHead(400);res.end('Invalid league or date');return;}
      const data=await getScores(league,date);
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));return;
    }
    const requested=url.pathname==='/'?'/index.html':url.pathname;
    if(!['/index.html','/styles.css','/app.js','/sw.js','/admin.html','/admin.js'].includes(requested)){res.writeHead(404);res.end('Not found');return;}
    const file=path.join(root,'public',requested);
    const data=await readFile(file);
    res.writeHead(200,{'Content-Type':mime[path.extname(file)],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(data);
  }catch(e){res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Score provider unavailable. Try again shortly.'}));}
}).listen(PORT,'0.0.0.0',()=>console.log('SportsMania listening on '+PORT));
