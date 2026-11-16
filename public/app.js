const LEAGUES=['NFL','NBA','MLB','NHL','NCAAF','NCAAB','WNBA','MLS','EPL','UCL'];
const labels={NCAAF:'NCAA Football',NCAAB:'NCAA Basketball',EPL:'Premier League',UCL:'Champions League'};
const $=s=>document.querySelector(s);
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const state={league:'NFL',date:today(),filter:'all',data:null,request:0};
const alertSettings=JSON.parse(localStorage.getItem('sportsmania:alerts')||'{"enabled":false}');
const seenScores=new Map();
function notifyScores(data){
 if(!alertSettings.enabled||Notification.permission!=='granted')return;
 for(const g of data.events||[]){
  if(!g.teams?.some(t=>favorites.has(t.abbreviation+':'+data.league)))continue;
  const key=data.league+':'+g.id,signature=g.state+'|'+g.teams.map(t=>t.score).join(':');
  const old=seenScores.get(key);seenScores.set(key,signature);
  if(!old||old===signature)return;
  const previous=old.split('|'),current=signature.split('|');
  const title=previous[0]!==g.state?(g.state==='in'?'Game started':g.state==='post'?'Final score':'Game update'):'Score update';
  new Notification(title+' · '+g.name,{body:g.teams.map(t=>t.abbreviation+' '+(t.score??'–')).join(' · '),tag:key});
 }
}

const favorites=new Set(JSON.parse(localStorage.getItem('sportsmania:favorites')||'[]'));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function dateKey(){return state.date.replaceAll('-','')}
function setDate(date){state.date=date;$('#date').value=date;load();if(featureState.view==='calendar')featureLoad()}
function changeDay(n){const d=new Date(state.date+'T12:00:00');d.setDate(d.getDate()+n);setDate([d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'))}
function clock(){ $('#clock').textContent=new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});}
function drawLeagues(){$('#leagues').innerHTML=LEAGUES.map(l=>'<button data-league="'+l+'" class="'+(l===state.league?'active':'')+'">'+esc(labels[l]||l)+'</button>').join('')}
const watchSites=[
 [/^(ESPN|ESPN2|ESPNU|ESPNEWS|ESPN Deportes|ESPN\+)$/i,'https://www.espn.com/watch/'],
 [/^ABC$/i,'https://abc.com/watch-live/'],
 [/^FOX( Sports| Deportes)?$|^FS1$|^FS2$/i,'https://www.foxsports.com/live'],
 [/^CBS$|^CBS Sports Network$/i,'https://www.cbssports.com/watch/'],
 [/^NBC$|^USA Network$/i,'https://www.nbc.com/live'],
 [/^Peacock$/i,'https://www.peacocktv.com/sports'],
 [/^Prime Video$|^Amazon Prime Video$/i,'https://www.amazon.com/gp/video/storefront/'],
 [/^NFL Network$/i,'https://www.nfl.com/network/'],
 [/^NFL\+$/i,'https://www.nfl.com/plus/'],
 [/^NBA TV$/i,'https://www.nba.com/watch/'],
 [/^MLB Network$/i,'https://www.mlb.com/network'],
 [/^NHL Network$/i,'https://www.nhl.com/'],
 [/^TNT$|^TBS$|^truTV$/i,'https://www.tntdrama.com/watchtnt'],
 [/^Apple TV(\+)?$|^MLS Season Pass$/i,'https://tv.apple.com/'],
 [/^Paramount\+$/i,'https://www.paramountplus.com/sports/']
];
function googleStreamLink(g){
 const teams=(g.teams||[]).map(t=>t.name).filter(Boolean).join(' vs ');
 const date=String(g.date||'').slice(0,10);
 const query=[teams||g.name,labels[state.league]||state.league,date,'watch live stream'].filter(Boolean).join(' ');
 return '<a class="watch-link" href="https://www.google.com/search?q='+encodeURIComponent(query)+'" target="_blank" rel="noopener noreferrer" title="Search Google for this game; results are unverified">🔎 Find streams on Google ↗</a>';
}
function watch(g){
 const names=[...new Set([...(g.broadcasts||[]),...(g.broadcast||'').split(',')].map(x=>x.trim()).filter(Boolean))];
 if(!names.length)return '<div class="watch"><span class="watch-title">📺 Where to watch</span><div class="watch-options">'+googleStreamLink(g)+'</div><span class="watch-muted">Google results are not verified for availability, safety, or broadcast rights.</span></div>';
 return '<div class="watch"><span class="watch-title">📺 Where to watch</span><div class="watch-options">'+names.map(name=>{
 const site=watchSites.find(([pattern])=>pattern.test(name));
 return site?'<a href="'+esc(site[1])+'" target="_blank" rel="noopener noreferrer" class="watch-link" title="Open official provider website">'+esc(name)+' ↗</a>':'<span class="watch-channel">'+esc(name)+'</span>';
 }).join('')+googleStreamLink(g)+'</div><span class="watch-muted">Google results are unverified. Availability depends on your region and subscription. Links open provider sites, not necessarily the game stream.</span></div>';
}
const playPanels=new Map();
function playMarkup(g){
 const key=state.league+':'+g.id,p=playPanels.get(key);
 if(!p?.open)return '<button class="play-toggle" data-play-toggle="'+esc(g.id)+'" aria-expanded="false">▶ Play-by-play</button>';
 const body=p.loading?'<div class="play-message">Loading plays…</div>':p.error?'<div class="play-message">Unable to load plays. Select Refresh plays to retry.</div>':!p.plays?.length?'<div class="play-message">Play-by-play is not available for this game from the score provider.</div>':p.plays.map(x=>'<div class="play-row '+(x.scoring?'scoring':'')+'"><span class="play-time">'+esc([x.period?'P'+x.period:'',x.clock].filter(Boolean).join(' · '))+'</span><span class="play-text">'+esc(x.text)+'</span>'+(x.score?'<span class="play-score">'+esc(x.score)+'</span>':'')+'</div>').join('');
 return '<div class="play-section"><button class="play-toggle" data-play-toggle="'+esc(g.id)+'" aria-expanded="true">▼ Hide play-by-play</button><button class="play-refresh" data-play-refresh="'+esc(g.id)+'">↻ Refresh plays</button><div class="play-list">'+body+'</div></div>';
}
async function loadPlays(id,force=false){
 const league=state.league,key=league+':'+id;
 const old=playPanels.get(key)||{};
 if(old.loading)return;
 if(old.plays&&!force){playPanels.set(key,{...old,open:true});draw();return;}
 const request=(old.request||0)+1;
 playPanels.set(key,{...old,open:true,loading:true,error:false,request});draw();
 try{
  const response=await fetch(new URL('api/plays?league='+encodeURIComponent(league)+'&id='+encodeURIComponent(id),document.baseURI),{cache:'no-store'});
  if(!response.ok)throw Error('Unavailable');
  const data=await response.json(),current=playPanels.get(key);
  if(current?.request!==request)return;
  playPanels.set(key,{...current,loading:false,plays:data.plays,error:false});if(state.league===league)draw();
 }catch(e){
  const current=playPanels.get(key);if(current?.request!==request)return;
  playPanels.set(key,{...current,loading:false,error:true});if(state.league===league)draw();
 }
}
const featureState={view:'scores',request:0};
const api=(endpoint)=>new URL('api/'+endpoint,document.baseURI);
function statValue(stats,key){return stats?.find(s=>s.name===key)?.value||'—'}
function showFeature(html){$('#feature-panel').innerHTML=html;$('#feature-panel').hidden=false;$('#games').hidden=true;$('#summary').hidden=true;}
async function featureLoad(){
 const view=featureState.view;if(view==='scores'){$('#feature-panel').hidden=true;$('#games').hidden=false;$('#summary').hidden=false;draw();return;}
 const request=++featureState.request;
 if(view==='calendar'){showFeature('<div class="feature-content"><h3>Sports Calendar</h3><p>Export games for the selected league and date into your calendar.</p><a class="watch-link" href="'+esc(api('calendar.ics?league='+state.league+'&date='+dateKey()).href)+'">Download calendar (.ics)</a></div>');return;}
 showFeature('<div class="feature-content">Loading '+esc(view)+'…</div>');
 try{const response=await fetch(api(view+'?league='+state.league));if(!response.ok)throw Error('Unavailable');const data=await response.json();if(request!==featureState.request||featureState.view!==view)return;
 if(view==='news'){const items=data.articles||[];showFeature('<div class="feature-content"><h3>Latest '+esc(state.league)+' News</h3><div class="feature-grid">'+(items.length?items.map(a=>'<article class="feature-card"><h4>'+esc(a.headline)+'</h4><p>'+esc(a.description)+'</p>'+(a.url&&/^https:\/\//.test(a.url)?'<a href="'+esc(a.url)+'" target="_blank" rel="noopener noreferrer">Read source ↗</a>':'')+'</article>').join(''):'No news available.')+'</div></div>');}
 else if(view==='standings'){showFeature('<div class="feature-content"><h3>'+esc(state.league)+' Standings</h3>'+(data.rows?.length?'<div class="standings-list">'+data.rows.map(r=>'<div class="standing-row"><strong>'+esc(r.team)+'</strong><span>'+esc(r.group)+'</span><span>W '+esc(statValue(r.stats,'wins'))+'</span><span>L '+esc(statValue(r.stats,'losses'))+'</span></div>').join('')+'</div>':'Standings are not available for this league.')+'</div>');}
 }catch{if(request===featureState.request)showFeature('<div class="feature-content">Unable to load '+esc(view)+'. Please try again later.</div>');}
}
const detailPanels=new Map();
async function gameDetail(id){
 const league=state.league,key=league+':'+id,old=detailPanels.get(key);
 if(old?.open){detailPanels.set(key,{...old,open:false});draw();return;}
 detailPanels.set(key,{...old,open:true,loading:true});draw();
 try{const response=await fetch(api('game?league='+league+'&id='+encodeURIComponent(id)));if(!response.ok)throw Error('Unavailable');const data=await response.json();detailPanels.set(key,{open:true,loading:false,data});if(state.league===league)draw();}
 catch{detailPanels.set(key,{open:true,error:true});if(state.league===league)draw();}
}
function playerOptions(d){return (d.stats||[]).flatMap(t=>t.groups.flatMap(gr=>gr.athletes.map(a=>({name:a.name,stats:a.stats,group:gr.name,team:t.team})))).map((a,i)=>'<option value="'+i+'">'+esc(a.name+' ('+a.team+' · '+a.group+')')+'</option>').join('');}
function comparePlayers(panel){
 const d=detailPanels.get(state.league+':'+panel.closest('[data-game-id]').dataset.gameId)?.data;if(!d)return;
 const all=(d.stats||[]).flatMap(t=>t.groups.flatMap(gr=>gr.athletes.map(a=>({name:a.name,stats:a.stats,labels:gr.labels,group:gr.name}))));
 const ai=panel.querySelector('[data-player-a]').value,bi=panel.querySelector('[data-player-b]').value;
 const a=ai===''?null:all[Number(ai)],b=bi===''?null:all[Number(bi)];
 const result=panel.querySelector('.compare-result');
 if(!a||!b){result.textContent='Select two players.';return;}
 const labels=a.group===b.group?a.labels||[]:[],values=[a.stats||[],b.stats||[]];
 const rows=labels.length?labels.map((label,i)=>({label,left:values[0][i]||'—',right:values[1][i]||'—'})):values[0].map((v,i)=>({label:'Stat '+(i+1),left:v,right:values[1][i]||'—'}));
 result.innerHTML='<h5>'+esc(a.name)+' vs '+esc(b.name)+'</h5>'+rows.map(r=>{const av=Number(r.left),bv=Number(r.right),max=Math.max(av,bv,1);return '<div class="compare-chart-row"><span>'+esc(r.label)+'</span><div class="compare-bars"><div style="width:'+ (Number.isFinite(av)?Math.max(2,av/max*100):0)+'%"></div><div style="width:'+(Number.isFinite(bv)?Math.max(2,bv/max*100):0)+'%"></div></div><small>'+esc(r.left)+' / '+esc(r.right)+'</small></div>';}).join('')+'<small>Top bar: '+esc(a.name)+' · Bottom bar: '+esc(b.name)+'. Values are comparable only for the same stat category.</small>';
}
function gameDetailMarkup(g){
 const p=detailPanels.get(state.league+':'+g.id);
 if(!p?.open)return '<button class="play-toggle" data-game-detail="'+esc(g.id)+'">▤ Game Center</button>';
 const d=p.data;
 const body=p.loading?'Loading game statistics…':p.error?'Game statistics unavailable.':('<h4>Scoring timeline</h4>'+(d.scoring?.length?'<ol class="scoring-timeline">'+d.scoring.map(x=>'<li><b>'+esc('P'+x.period+' '+x.clock)+'</b> '+esc(x.text)+'</li>').join('')+'</ol>':'No scoring events available.')+'<h4>Team statistics</h4>'+(d.teamStats?.length?d.teamStats.map(t=>'<h5>'+esc(t.team)+'</h5>'+t.stats.map(s=>'<div class="stat-line"><span>'+esc(s.name)+'</span><b>'+esc(s.value)+'</b></div>').join('')).join(''):'No team statistics available.')+'<h4>Player leaders</h4>'+(d.stats?.length?d.stats.map(t=>'<h5>'+esc(t.team)+'</h5>'+t.groups.map(group=>'<div class="stat-group"><b>'+esc(group.name)+'</b>'+group.athletes.slice(0,5).map(a=>'<div class="stat-line"><span>'+esc(a.name)+'</span><span>'+esc((a.stats||[]).join(' / '))+'</span></div>').join('')+'</div>').join('')).join(''):'No player statistics available.')+'<h4>Compare players</h4><div class="compare-controls"><select data-player-a><option value="">Choose player A</option>'+playerOptions(d)+'</select><select data-player-b><option value="">Choose player B</option>'+playerOptions(d)+'</select><button data-compare>Compare</button></div><div class="compare-result"></div>');
 return '<div class="detail-panel" data-game-id="'+esc(g.id)+'"><button class="play-toggle" data-game-detail="'+esc(g.id)+'">▼ Hide Game Center</button><div class="detail-scroll">'+body+'</div></div>';
}
function extrasMarkup(g){
 const p=g.prediction,odds=g.odds||[];
 return (p?'<div class="prediction"><b>Pregame model estimate</b><div>'+esc(p.away)+': '+p.awayPct+'% · '+esc(p.home)+': '+p.homePct+'%</div><small>'+esc(p.method)+'</small></div>':'')+
 (odds.length?'<div class="odds"><b>Reported odds</b>'+odds.map(o=>'<div>'+esc(o.provider||'Provider')+': '+esc(o.details||'')+(o.overUnder!=null?' · O/U '+esc(o.overUnder):'')+'</div>').join('')+'<small>Odds may be delayed. Not betting advice.</small></div>':'')+
 gameDetailMarkup(g)+'<button class="play-toggle" data-chat-toggle="'+esc(g.id)+'">💬 Game chat</button>'+chatMarkup(g);
}
const chats=new Map();
const auth={token:sessionStorage.getItem('sportsmania:session')||'',user:null};
async function authenticate(action,username,password){const response=await fetch(api('auth'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,username,password})});const data=await response.json();if(!response.ok)throw Error(data.error||'Authentication failed');auth.token=data.token;auth.user=data.user;sessionStorage.setItem('sportsmania:session',auth.token);renderAuth();draw();}
function renderAuth(){const el=document.getElementById('auth-status');if(!el)return;el.textContent=auth.user?'Signed in: '+auth.user.username:'Sign in to chat';document.getElementById('auth-form').hidden=!!auth.user;document.getElementById('logout').hidden=!auth.user;}
async function restoreAuth(){if(!auth.token)return;try{const r=await fetch(api('auth'),{headers:{Authorization:'Bearer '+auth.token}}),d=await r.json();auth.user=d.user;if(!auth.user){auth.token='';sessionStorage.removeItem('sportsmania:session');}renderAuth();}catch{}}
function chatMarkup(g){
 const key=state.league+':'+g.id,c=chats.get(key);if(!c?.open)return '';
 return '<div class="chat-panel"><div class="chat-log">'+(c.messages||[]).map(m=>'<div><small>'+esc(m.name)+' · '+esc(new Date(m.time).toLocaleTimeString())+'</small><p>'+esc(m.message)+'</p><button class="report-btn" data-report="'+esc(m.id)+'" data-room="'+esc(key)+'">Report</button></div>').join('')+'</div><form data-chat-form="'+esc(g.id)+'"'+(auth.user?'':' hidden')+'><input name="name" maxlength="24" placeholder="Nickname" value="'+esc(localStorage.getItem('sportsmania:nick')||'')+'" required><input name="message" maxlength="400" placeholder="Message" required><button type="submit">Send</button></form><small>Public chat. Do not share personal information. Messages are stored on this server.</small></div>';
}
async function chatLoad(id){
 const league=state.league,key=league+':'+id,c=chats.get(key)||{};if(!c.open)return;
 try{const r=await fetch(api('chat?room='+encodeURIComponent(key)));if(!r.ok)return;const data=await r.json();if(chats.get(key)?.open){chats.set(key,{...chats.get(key),messages:data.messages});if(state.league===league)draw();}}catch{}
}
function draw(){
 const events=(state.data?.events||[]).filter(g=>state.filter==='all'||(state.filter==='favorites'?g.teams.some(t=>favorites.has(t.abbreviation+':'+state.league)):g.state===state.filter));
 $('#summary').textContent=(state.data?.events.length||0)+' games · '+(events.filter(e=>e.state==='in').length)+' live'+(state.data?.stale?' · Showing cached results':'');
 if(!events.length){$('#games').innerHTML='<div class="empty">No '+(state.filter==='all'?'scheduled':state.filter)+' games for this league and date.</div>';return;}
 $('#games').innerHTML=events.map(g=>{
 const status=g.state==='in'?'LIVE · '+g.detail:g.state==='post'?'FINAL · '+g.detail:new Date(g.date).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
 const teams=[...g.teams].sort((a,b)=>a.homeAway==='away'?-1:b.homeAway==='away'?1:0);
 return '<article class="game"><div class="game-head"><span>'+esc(state.league)+' · '+esc(g.name)+'</span><span class="status '+esc(g.state)+'">'+esc(status)+'</span></div>'+
 teams.map(t=>{const fav=t.abbreviation+':'+state.league;return '<div class="team '+(g.state==='post'&&!t.winner?'loser':'')+'"><button class="star '+(favorites.has(fav)?'saved':'')+'" data-fav="'+esc(fav)+'" title="Toggle favorite" aria-label="Favorite '+esc(t.name)+'">'+(favorites.has(fav)?'★':'☆')+'</button>'+(t.logo?'<img src="'+esc(t.logo)+'" alt="" loading="lazy">':'<span class="placeholder">●</span>')+'<span class="name">'+esc(t.name)+'</span><span class="score">'+esc(t.score??'–')+'</span></div>'}).join('')+
 '<div class="game-foot">'+esc(g.venue||'Venue not listed')+'</div>'+watch(g)+extrasMarkup(g)+playMarkup(g)+'</article>';
 }).join('');
}
async function load(){
 const id=++state.request;$('#games').innerHTML='<div class="empty">Loading '+esc(state.league)+' scores…</div>';
 try{const r=await fetch(new URL('api/scores?league='+state.league+'&date='+dateKey(),document.baseURI),{cache:'no-store'});if(!r.ok)throw Error('Provider unavailable');const data=await r.json();if(id!==state.request)return;state.data=data;notifyScores(data);$('#lastUpdate').textContent='Updated '+new Date(data.updatedAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit',second:'2-digit'});if(featureState.view==='scores')draw();}
 catch(e){if(id===state.request){$('#games').innerHTML='<div class="empty error">Unable to load scores. Please try Refresh.</div>';$('#summary').textContent='';}}
}
$('#leagues').addEventListener('click',e=>{const b=e.target.closest('[data-league]');if(!b)return;state.league=b.dataset.league;drawLeagues();load();featureLoad()});
$('#filters').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(!b)return;state.filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));draw()});
$('#games').addEventListener('click',e=>{const compare=e.target.closest('[data-compare]');if(compare){comparePlayers(compare.closest('.detail-panel'));return;}const report=e.target.closest('[data-report]');if(report){if(!confirm('Report this message to moderators?'))return;fetch(api('moderation'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'report',room:report.dataset.room,id:report.dataset.report})}).then(r=>{alert(r.ok?'Report submitted':'Unable to report')});return;}const detail=e.target.closest('[data-game-detail]');if(detail){gameDetail(detail.dataset.gameDetail);return;}const chat=e.target.closest('[data-chat-toggle]');if(chat){const key=state.league+':'+chat.dataset.chatToggle,c=chats.get(key)||{};chats.set(key,{...c,open:!c.open});draw();if(!c.open)chatLoad(chat.dataset.chatToggle);return;}const toggle=e.target.closest('[data-play-toggle]');if(toggle){const id=toggle.dataset.playToggle,key=state.league+':'+id,old=playPanels.get(key);if(old?.open){playPanels.set(key,{...old,open:false});draw()}else loadPlays(id);return;}const refresh=e.target.closest('[data-play-refresh]');if(refresh){loadPlays(refresh.dataset.playRefresh,true);return;}const b=e.target.closest('[data-fav]');if(!b)return;const v=b.dataset.fav;favorites.has(v)?favorites.delete(v):favorites.add(v);localStorage.setItem('sportsmania:favorites',JSON.stringify([...favorites]));if(alertSettings.enabled)syncPush(true).catch(()=>{});draw()});
$('#prev').onclick=()=>changeDay(-1);$('#next').onclick=()=>changeDay(1);$('#today').onclick=()=>setDate(today());$('#date').onchange=e=>{if(e.target.value)setDate(e.target.value)};$('#refresh').onclick=load;
$('#date').value=state.date;drawLeagues();clock();setInterval(clock,30000);load();setInterval(()=>{if(!document.hidden&&!realtimeConnected)load()},30000);

$('#feature-panel').hidden=true;
document.querySelector('.feature-nav').addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(!b)return;featureState.view=b.dataset.view;document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x===b));featureLoad();});
$('#games').addEventListener('submit',async e=>{const form=e.target.closest('[data-chat-form]');if(!form)return;e.preventDefault();const id=form.dataset.chatForm,league=state.league,room=league+':'+id,message=form.elements.message.value.trim();if(!message)return;try{const r=await fetch(api('chat?room='+encodeURIComponent(room)),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth.token},body:JSON.stringify({message})});const data=await r.json();if(!r.ok)throw Error(data.error||'Send failed');await chatLoad(id);}catch(err){alert(err.message)}});
setInterval(()=>{if(document.hidden||realtimeConnected)return;for(const [key,c] of chats){if(c.open&&key.startsWith(state.league+':'))chatLoad(key.slice(key.indexOf(':')+1));}},12000);

const alertButton=document.createElement('button');alertButton.className='refresh';alertButton.id='alert-toggle';alertButton.textContent=alertSettings.enabled?'🔔 Alerts on':'🔕 Enable favorite alerts';document.querySelector('.toolbar').append(alertButton);
alertButton.onclick=async()=>{if(alertSettings.enabled){alertSettings.enabled=false;}else{if(!('Notification' in window)){alert('This browser does not support notifications.');return;}const permission=await Notification.requestPermission();if(permission!=='granted'){alert('Notifications were not permitted.');return;}alertSettings.enabled=true;}localStorage.setItem('sportsmania:alerts',JSON.stringify(alertSettings));alertButton.textContent=alertSettings.enabled?'🔔 Alerts on':'🔕 Enable favorite alerts';};

function urlBase64ToUint8Array(base64){const padding='='.repeat((4-base64.length%4)%4),raw=atob((base64+padding).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
async function syncPush(enabled){
 const config=await (await fetch(api('push/config'))).json();
 if(!config.enabled)throw Error('Server push keys are not configured yet.');
 if(!('serviceWorker' in navigator)||!('PushManager' in window))throw Error('This browser does not support background push.');
 const registration=await navigator.serviceWorker.register(new URL('sw.js',document.baseURI),{scope:'./'});
 let subscription=await registration.pushManager.getSubscription();
 if(enabled&&!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(config.publicKey)});
 if(subscription){const response=await fetch(api('push/subscribe'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subscription,teams:[...favorites],enabled})});if(!response.ok)throw Error('Unable to save subscription');}
}
const oldAlertHandler=alertButton.onclick;
alertButton.onclick=async()=>{await oldAlertHandler();try{await syncPush(alertSettings.enabled);alertButton.textContent=alertSettings.enabled?'🔔 Background alerts on':'🔕 Enable favorite alerts';}catch(e){if(alertSettings.enabled)alert(e.message+' In-page alerts remain available.');}};
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&alertSettings.enabled)syncPush(true).catch(()=>{});});

let realtimeConnected=false,realtimeSocket=null,retryDelay=1000;
function connectRealtime(){
 const url=new URL('ws',document.baseURI);url.protocol=location.protocol==='https:'?'wss:':'ws:';
 const ws=new WebSocket(url);realtimeSocket=ws;
 ws.onopen=()=>{realtimeConnected=true;retryDelay=1000;ws.send(JSON.stringify({type:'subscribe',league:state.league,date:dateKey()}));document.getElementById('realtime-status').textContent='● Live connection';};
 ws.onmessage=e=>{try{const event=JSON.parse(e.data);
  if(event.type==='scores'&&event.data.league===state.league&&event.data.date===dateKey()){const before=JSON.stringify((state.data?.events||[]).map(g=>[g.id,g.state,...g.teams.map(t=>t.score)]));const after=JSON.stringify((event.data.events||[]).map(g=>[g.id,g.state,...g.teams.map(t=>t.score)]));state.data=event.data;notifyScores(event.data);if(before!==after&&featureState.view==='scores'&&!document.querySelector('input[name="message"]:focus'))draw();document.getElementById('lastUpdate').textContent='Live · '+new Date().toLocaleTimeString();}
  if(event.type==='chat'){const chat=chats.get(event.room);if(chat?.open){chats.set(event.room,{...chat,messages:[...(chat.messages||[]),event.message].slice(-100)});if(!document.querySelector('input[name="message"]:focus'))draw();}}
  if(event.type==='chat-delete'){const chat=chats.get(event.room);if(chat){chats.set(event.room,{...chat,messages:(chat.messages||[]).filter(m=>m.id!==event.id)});draw();}}
 }catch{}};
 ws.onclose=()=>{realtimeConnected=false;document.getElementById('realtime-status').textContent='○ Reconnecting';setTimeout(connectRealtime,retryDelay);retryDelay=Math.min(30000,retryDelay*2);};
 ws.onerror=()=>ws.close();
}
document.getElementById('auth-form').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;try{await authenticate(f.elements.action.value,f.elements.username.value,f.elements.password.value);f.reset();}catch(err){alert(err.message);}});
document.getElementById('logout').onclick=()=>{auth.user=null;auth.token='';sessionStorage.removeItem('sportsmania:session');renderAuth();draw();};
restoreAuth();renderAuth();connectRealtime();
const subscribeRealtime=()=>{if(realtimeSocket?.readyState===1)realtimeSocket.send(JSON.stringify({type:'subscribe',league:state.league,date:dateKey()}));};
document.getElementById('leagues').addEventListener('click',subscribeRealtime);
document.getElementById('date').addEventListener('change',subscribeRealtime);
document.getElementById('prev').addEventListener('click',subscribeRealtime);
document.getElementById('next').addEventListener('click',subscribeRealtime);
document.getElementById('today').addEventListener('click',subscribeRealtime);
