const LEAGUES=['NFL','NBA','MLB','NHL','NCAAF','NCAAB','WNBA','MLS','EPL','UCL'];
const labels={NCAAF:'NCAA Football',NCAAB:'NCAA Basketball',EPL:'Premier League',UCL:'Champions League'};
const $=s=>document.querySelector(s);
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const state={league:'NFL',date:today(),filter:'all',data:null,request:0};
const favorites=new Set(JSON.parse(localStorage.getItem('sportsmania:favorites')||'[]'));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function dateKey(){return state.date.replaceAll('-','')}
function setDate(date){state.date=date;$('#date').value=date;load()}
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
function watch(g){
 const names=[...new Set([...(g.broadcasts||[]),...(g.broadcast||'').split(',')].map(x=>x.trim()).filter(Boolean))];
 if(!names.length)return '<div class="watch"><span class="watch-title">📺 Where to watch</span><span class="watch-muted">Broadcast information not yet available</span></div>';
 return '<div class="watch"><span class="watch-title">📺 Where to watch</span><div class="watch-options">'+names.map(name=>{
 const site=watchSites.find(([pattern])=>pattern.test(name));
 return site?'<a href="'+esc(site[1])+'" target="_blank" rel="noopener noreferrer" class="watch-link" title="Open official provider website">'+esc(name)+' ↗</a>':'<span class="watch-channel">'+esc(name)+'</span>';
 }).join('')+'</div><span class="watch-muted">Availability depends on your region and subscription. Links open provider sites, not necessarily the game stream.</span></div>';
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
 '<div class="game-foot">'+esc(g.venue||'Venue not listed')+'</div>'+watch(g)+'</article>';
 }).join('');
}
async function load(){
 const id=++state.request;$('#games').innerHTML='<div class="empty">Loading '+esc(state.league)+' scores…</div>';
 try{const r=await fetch('/api/scores?league='+state.league+'&date='+dateKey(),{cache:'no-store'});if(!r.ok)throw Error('Provider unavailable');const data=await r.json();if(id!==state.request)return;state.data=data;$('#lastUpdate').textContent='Updated '+new Date(data.updatedAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit',second:'2-digit'});draw();}
 catch(e){if(id===state.request){$('#games').innerHTML='<div class="empty error">Unable to load scores. Please try Refresh.</div>';$('#summary').textContent='';}}
}
$('#leagues').addEventListener('click',e=>{const b=e.target.closest('[data-league]');if(!b)return;state.league=b.dataset.league;drawLeagues();load()});
$('#filters').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(!b)return;state.filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));draw()});
$('#games').addEventListener('click',e=>{const b=e.target.closest('[data-fav]');if(!b)return;const v=b.dataset.fav;favorites.has(v)?favorites.delete(v):favorites.add(v);localStorage.setItem('sportsmania:favorites',JSON.stringify([...favorites]));draw()});
$('#prev').onclick=()=>changeDay(-1);$('#next').onclick=()=>changeDay(1);$('#today').onclick=()=>setDate(today());$('#date').onchange=e=>{if(e.target.value)setDate(e.target.value)};$('#refresh').onclick=load;
$('#date').value=state.date;drawLeagues();clock();setInterval(clock,30000);load();setInterval(()=>{if(!document.hidden)load()},15000);
