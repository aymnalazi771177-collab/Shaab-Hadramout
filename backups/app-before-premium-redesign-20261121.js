const pages=['home','news','team','matches','more','transfers','media','anthems','history'];const nav=[...document.querySelectorAll('.nav-item')];const toast=document.getElementById('toast');
function notify(message){toast.textContent=message;toast.classList.add('show');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>toast.classList.remove('show'),2300)}
function showPage(name){pages.forEach(p=>document.getElementById('page-'+p).classList.toggle('active',p===name));nav.forEach(b=>b.classList.toggle('active',(['transfers','media','anthems','history'].includes(name)?'more':name)));document.body.classList.toggle('page-home',name==='home');if(name==='team')loadClubPlayers();if(name==='transfers')loadClubTransfers();if(name==='media')loadClubMedia();if(name==='matches')loadClubStandings();if(name==='anthems')loadClubAnthems();if(name==='history')loadClubHistory();window.scrollTo({top:0,behavior:'smooth'})}
nav.forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));
document.querySelectorAll('[data-open-page]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.openPage)));
document.querySelectorAll('[data-home]').forEach(b=>b.addEventListener('click',()=>showPage('home')));
document.getElementById('menuBtn').addEventListener('click',()=>showPage('more'));
document.getElementById('alertsBtn').addEventListener('click',openClubNotifications);
document.getElementById('closeNotifications').addEventListener('click',()=>document.getElementById('notificationsBackdrop').hidden=true);
document.getElementById('notificationsBackdrop').addEventListener('click',e=>{if(e.target.id==='notificationsBackdrop')e.currentTarget.hidden=true});
document.addEventListener('click',event=>{const btn=event.target.closest('[data-match-details]');if(btn){const note=btn.dataset.notes||'لا توجد تفاصيل إضافية لهذه المباراة.';notify(note)}});

document.querySelectorAll('[data-media-filter]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-media-filter]').forEach(x=>x.classList.toggle('selected',x===b));renderClubMedia(b.dataset.mediaFilter)}));
let players=[];
const clubBase='https://shaab-hadramout.pages.dev';
function renderPlayers(filter){
 const grid=document.getElementById('playerGrid');
 grid.innerHTML='';
 const selected=players.filter(p=>p.position===filter);
 if(!selected.length){grid.innerHTML='<p class="sample-note">لا توجد بيانات مسجلة لهذا القسم حالياً.</p>';return}
 selected.forEach(p=>{
  const card=document.createElement('article');
  card.className='player-card'+(filter==='المدرب'?' coach-card':'');
  const img=document.createElement('img');
  const raw=String(p.image_url||'');
  img.src=raw.startsWith('/api/media/')?clubBase+raw:(raw||'assets/logo.png');
  img.alt='صورة '+p.name;
  img.onerror=()=>{img.onerror=null;img.src='assets/logo.png'};
  const name=document.createElement('strong');
  name.textContent=p.name;
  const number=document.createElement('em');
  number.textContent=p.position==='المدرب'?'المدرب':(p.number||'');
  card.append(img,name,number);
  grid.append(card);
 });
}
document.querySelectorAll('#teamTabs button').forEach(b=>b.addEventListener('click',()=>{
 document.querySelectorAll('#teamTabs button').forEach(x=>x.classList.toggle('selected',x===b));
 renderPlayers(b.dataset.filter);
}));
async function loadClubPlayers(){
 const grid=document.getElementById('playerGrid');
 if(!grid)return;
 grid.innerHTML='<p class="sample-note">جارٍ تحميل بيانات الفريق...</p>';
 try{
  const response=await fetch(clubBase+'/api/players?refresh='+Date.now(),{cache:'no-store'});
  const payload=await response.json();
  if(!response.ok||!payload.success||!Array.isArray(payload.players))throw new Error('تعذر تحميل بيانات الفريق');
  players=payload.players;
  const active=document.querySelector('#teamTabs button.selected')||document.querySelector('#teamTabs button');
  renderPlayers(active?.dataset.filter||'حراس المرمى');
 }catch(error){
  console.warn('Players API unavailable',error);
  grid.innerHTML='<p class="sample-note">تعذر تحميل بيانات الفريق حالياً. تحقق من اتصال الإنترنت ثم أعد المحاولة.</p>';
 }
}



function clubImageUrl(value){const url=String(value||'');return url.startsWith('/api/media/')?'https://shaab-hadramout.pages.dev'+url:url||'assets/logo.png'}
function matchDateLabel(value){if(!value)return '';const d=new Date(value+'T00:00:00');return Number.isNaN(d.getTime())?value:d.toLocaleDateString('ar',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}
function renderClubMatches(items){
 const upcoming=items.filter(m=>m.status==='upcoming'||m.status==='live').sort((a,b)=>String(a.match_date).localeCompare(String(b.match_date)))[0];
 const finished=items.filter(m=>m.status==='finished').sort((a,b)=>String(b.match_date).localeCompare(String(a.match_date))).slice(0,8);
 const upcomingBox=document.getElementById('upcomingMatchCard'),resultsBox=document.getElementById('recentResults');
 if(upcomingBox){if(!upcoming)upcomingBox.innerHTML='<article class="upcoming-card"><p class="sample-note">لا توجد مباراة قادمة معلنة حالياً.</p></article>';else{const club={name:'شعب حضرموت',logo:clubImageUrl(upcoming.home_logo_url)},rival={name:upcoming.opponent,logo:clubImageUrl(upcoming.opponent_logo_url)};const left=Number(upcoming.is_home)===0?rival:club,right=Number(upcoming.is_home)===0?club:rival;upcomingBox.innerHTML='<article class="upcoming-card"><div class="versus-banner"><div class="versus-teams"><div><img src="'+escapeMatchHtml(left.logo)+'" alt=""><b>'+escapeMatchHtml(left.name)+'</b></div><strong>VS</strong><div><img src="'+escapeMatchHtml(right.logo)+'" alt=""><b>'+escapeMatchHtml(right.name)+'</b></div></div></div><div class="match-meta"><span>'+escapeMatchHtml(matchDateLabel(upcoming.match_date))+'</span><i></i><span>'+escapeMatchHtml(upcoming.match_time||'يحدد لاحقاً')+'</span></div><p style="text-align:center;margin:8px 0;color:#777">'+escapeMatchHtml([upcoming.competition,upcoming.venue].filter(Boolean).join(' · '))+'</p><button class="details-btn" data-match-details data-notes="'+escapeMatchHtml(upcoming.notes||'')+'">تفاصيل المباراة</button></article>'}} 
 if(resultsBox)resultsBox.innerHTML=finished.length?finished.map(m=>{const club={name:'شعب حضرموت',logo:clubImageUrl(m.home_logo_url)},rival={name:m.opponent,logo:clubImageUrl(m.opponent_logo_url)};const left=Number(m.is_home)===0?rival:club,right=Number(m.is_home)===0?club:rival;const score=Number(m.is_home)===0?String(m.away_score??'0')+' - '+String(m.home_score??'0'):String(m.home_score??'0')+' - '+String(m.away_score??'0');return '<article class="result-card"><div><div class="result-crest"><img src="'+escapeMatchHtml(left.logo)+'" alt=""></div><b>'+escapeMatchHtml(left.name)+'</b></div><strong>'+escapeMatchHtml(score)+'</strong><div><div class="opponent-crest small"><img src="'+escapeMatchHtml(right.logo)+'" alt=""></div><b>'+escapeMatchHtml(right.name)+'</b></div></article>'}).join(''):'<p class="sample-note">لا توجد نتائج مسجلة حتى الآن.</p>';
}

function transferDateLabel(value){if(!value)return '';const d=new Date(String(value)+'T00:00:00');return Number.isNaN(d.getTime())?value:d.toLocaleDateString('ar',{year:'numeric',month:'long',day:'numeric'})}
async function loadClubTransfers(){
 const box=document.getElementById('transferList');if(!box)return;
 box.innerHTML='<p class="sample-note">جارٍ تحميل الانتقالات...</p>';
 try{
  const response=await fetch(clubBase+'/api/transfers?refresh='+Date.now(),{cache:'no-store'});
  const data=await response.json();
  if(!response.ok||!data.success||!Array.isArray(data.transfers))throw new Error('تعذر تحميل الانتقالات');
  if(!data.transfers.length){box.innerHTML='<p class="sample-note">لا توجد انتقالات معلنة حالياً.</p>';return}
  box.innerHTML=data.transfers.map(t=>{
   const incoming=t.direction==='incoming';
   const type=t.transfer_type==='loan'?'إعارة':'انتقال نهائي';
   const image=clubImageUrl(t.image_url);
   const from=t.from_club|| (incoming?'ناديه السابق':'شعب حضرموت');
   const to=t.to_club|| (incoming?'شعب حضرموت':'النادي الجديد');
   return '<article class="transfer-card"><img class="transfer-player-image" src="'+escapeMatchHtml(image)+'" alt="صورة '+escapeMatchHtml(t.player_name)+'" onerror="this.onerror=null;this.src=\'assets/logo.png\'"><div class="transfer-card-body"><span class="transfer-tag '+(incoming?'incoming':'outgoing')+'">'+(incoming?'وافد إلى النادي':'مغادر من النادي')+' · '+type+'</span><h3>'+escapeMatchHtml(t.player_name)+'</h3><p class="transfer-route"><span>'+escapeMatchHtml(from)+'</span><b>←</b><span>'+escapeMatchHtml(to)+'</span></p>'+(t.transfer_date?'<small class="transfer-date">'+escapeMatchHtml(transferDateLabel(t.transfer_date))+'</small>':'')+(t.details?'<p class="transfer-details">'+escapeMatchHtml(t.details)+'</p>':'')+'</div></article>';
  }).join('');
 }catch(error){console.warn('Transfers API unavailable',error);box.innerHTML='<p class="sample-note">تعذر تحميل الانتقالات حالياً. حاول مرة أخرى لاحقاً.</p>'}
}

function escapeMatchHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function loadClubMatches(){const box=document.getElementById('upcomingMatchCard');try{const response=await fetch(clubBase+'/api/matches?refresh='+Date.now(),{cache:'no-store'});const data=await response.json();if(!response.ok||!data.success||!Array.isArray(data.matches))throw new Error('تعذر تحميل المباريات');renderClubMatches(data.matches)}catch(error){console.warn('Matches API unavailable',error);if(box)box.innerHTML='<article class="upcoming-card"><p class="sample-note">تعذر تحميل المباريات حالياً. تحقق من اتصال الإنترنت.</p></article>';const results=document.getElementById('recentResults');if(results)results.innerHTML='<p class="sample-note">تعذر تحميل النتائج حالياً.</p>'}}

loadClubMatches();
loadClubStandings();

// Load club news from D1 and open a readable detail view when a story is tapped.
(async function loadClubNews() {
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
  const dateLabel = value => {
    if (!value) return "";
    const parsed = new Date(String(value).replace(" ", "T") + (String(value).includes("Z") ? "" : "Z"));
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString("ar");
  };
  let newsById = new Map();
  const fallbackImage = "https://images.unsplash.com/photo-1517466787929-bc90951d0974?auto=format&fit=crop&w=800&q=80";
  const imageUrl = value => { const url = String(value || ""); return url.startsWith("/api/media/") ? "https://shaab-hadramout.pages.dev" + url : url; };

  const style = document.createElement("style");
  style.textContent = `
    .news-row{cursor:pointer; -webkit-tap-highlight-color:transparent}
    .news-row:active{transform:scale(.99)}
    .news-detail-backdrop{position:fixed;inset:0;z-index:9999;background:rgba(8,12,20,.72);display:flex;align-items:flex-end;justify-content:center;padding:14px}
    .news-detail-panel{background:#fff;color:#20232a;width:min(100%,620px);max-height:88vh;overflow:auto;border-radius:22px 22px 16px 16px;box-shadow:0 16px 50px #0005;direction:rtl;text-align:right}
    .news-detail-image{display:block;width:100%;max-height:260px;object-fit:cover;background:#eee}\n    .news-detail-gallery{display:flex;gap:9px;overflow-x:auto;scroll-snap-type:x mandatory;padding:12px 12px 4px;-webkit-overflow-scrolling:touch}\n    .news-detail-gallery img{flex:0 0 86%;width:86%;height:250px;object-fit:cover;border-radius:13px;background:#eee;scroll-snap-align:center}
    .news-detail-body{padding:18px 18px 24px}
    .news-detail-title{font-size:21px;line-height:1.55;margin:0 0 8px;color:#17191e}
    .news-detail-date{display:block;color:#888;font-size:12px;margin-bottom:14px}
    .news-detail-content{font-size:16px;line-height:2;color:#363a42;white-space:pre-wrap;overflow-wrap:anywhere}
    .news-detail-close{position:sticky;top:10px;float:left;margin:10px 10px -46px 10px;border:0;border-radius:50%;width:36px;height:36px;background:#b90008;color:#fff;font-size:25px;line-height:1;z-index:2}
  `;
  document.head.appendChild(style);

  function openNewsDetail(item) {
    document.querySelector(".news-detail-backdrop")?.remove();
    const backdrop = document.createElement("div");
    backdrop.className = "news-detail-backdrop";
    const panel = document.createElement("article");
    panel.className = "news-detail-panel";
    const galleryImages = Array.isArray(item.images) && item.images.length
      ? item.images.map(entry => imageUrl(typeof entry === "string" ? entry : entry.url)).filter(Boolean)
      : (item.image_url ? [imageUrl(item.image_url)] : []);
    const gallery = galleryImages.length
      ? '<div class="news-detail-gallery">' + galleryImages.map((url, index) =>
          '<img src="' + escapeHtml(url) + '" alt="صورة الخبر ' + (index + 1) + '" loading="lazy">').join("") + '</div>'
      : '<img class="news-detail-image" src="' + escapeHtml(fallbackImage) + '" alt="">';
    panel.innerHTML = '<button class="news-detail-close" aria-label="إغلاق">×</button>' +
      gallery +
      '<div class="news-detail-body"><h2 class="news-detail-title">' + escapeHtml(item.title) +
      '</h2><small class="news-detail-date">' + escapeHtml(dateLabel(item.created_at)) +
      '</small><div class="news-detail-content">' + escapeHtml(item.content || "لا توجد تفاصيل إضافية لهذا الخبر.") +
      '</div></div>';
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);
    const close = () => backdrop.remove();
    panel.querySelector(".news-detail-close").addEventListener("click", close);
    backdrop.addEventListener("click", event => { if (event.target === backdrop) close(); });
  }

  document.addEventListener("click", event => {
    const row = event.target.closest(".news-row[data-news-id]");
    if (!row) return;
    const item = newsById.get(String(row.dataset.newsId));
    if (item) openNewsDetail(item);
  });
  async function loadFeaturedCarousel(){
    const box=document.getElementById('featuredNews');if(!box)return;
    try{
      const response=await fetch(clubBase+'/api/carousel?refresh='+Date.now(),{cache:'no-store'});
      const data=await response.json();if(!response.ok||!data.success)throw Error('تعذر تحميل السلايدر');
      const slides=(data.slides||[]).slice(0,3);
      if(!slides.length){box.innerHTML='<p class="sample-note" style="color:#fff;text-align:center;padding:100px 12px">لا توجد أخبار مختارة في السلايدر حالياً.</p>';return}
      let active=0,timer=null;
      const render=()=>{const item=slides[active],url=imageUrl(item.image_url||fallbackImage);
        box.innerHTML='<img src="'+escapeHtml(url)+'" alt="'+escapeHtml(item.title)+'"><div class="story-gradient"></div><button type="button" class="slider-arrow slider-prev" aria-label="السابق">‹</button><button type="button" class="slider-arrow slider-next" aria-label="التالي">›</button><div class="slider-copy"><h2>'+escapeHtml(item.title)+'</h2><small>اضغط لقراءة الخبر</small></div><div class="slider-dots">'+slides.map((s,i)=>'<button type="button" data-slide-index="'+i+'" class="'+(i===active?'selected':'')+'" aria-label="الخبر '+(i+1)+'"></button>').join('')+'</div>';
        box.onclick=e=>{const dot=e.target.closest('[data-slide-index]');if(dot){e.stopPropagation();active=Number(dot.dataset.slideIndex);render();restart();return}if(e.target.closest('.slider-prev')){e.stopPropagation();active=(active+slides.length-1)%slides.length;render();restart();return}if(e.target.closest('.slider-next')){e.stopPropagation();active=(active+1)%slides.length;render();restart();return}openNewsDetail(item)};
      };
      const restart=()=>{if(timer)clearInterval(timer);if(slides.length>1)timer=setInterval(()=>{active=(active+1)%slides.length;render()},5500)};
      let startX=0;box.addEventListener('touchstart',e=>{startX=e.changedTouches[0].clientX},{passive:true});
      box.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-startX;if(Math.abs(dx)>45&&slides.length>1){active=(active+(dx<0?1:slides.length-1))%slides.length;render();restart()}},{passive:true});
      render();restart();
    }catch(error){console.warn('Carousel unavailable',error);box.innerHTML='<p class="sample-note" style="color:#fff;text-align:center;padding:100px 12px">تعذر تحميل السلايدر حالياً.</p>'}
  }
  loadFeaturedCarousel();


  try {
    const response = await fetch("https://shaab-hadramout.pages.dev/api/news", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || !payload.success || !Array.isArray(payload.news)) return;
    const items = payload.news;
    newsById = new Map(items.map(item => [String(item.id), item]));
    // The home hero is populated only by the separately managed carousel, never by latest news.
    const markup = items.map(item => {
      const image = imageUrl((Array.isArray(item.images) && item.images.length ? (typeof item.images[0] === "string" ? item.images[0] : item.images[0].url) : item.image_url) || fallbackImage);
      return '<article class="news-row" data-news-id="' + escapeHtml(item.id) + '" role="button" tabindex="0">' +
        '<img src="' + escapeHtml(image) + '" alt=""><div><h3>' +
        escapeHtml(item.title) + '</h3><small>' + escapeHtml(dateLabel(item.created_at)) +
        '</small></div></article>';
    }).join("");
    const homeNews = document.querySelector("#page-home .news-section");
    const allNews = document.querySelector("#page-news .page-content");
    if (homeNews) {
      homeNews.querySelectorAll(".news-row,.sample-note").forEach(row => row.remove());
      homeNews.insertAdjacentHTML("beforeend", markup || '<p class="sample-note">لا توجد أخبار منشورة حالياً.</p>');
    }
    if (allNews) {
      allNews.querySelectorAll(".news-row,.sample-note").forEach(row => row.remove());
      allNews.insertAdjacentHTML("beforeend", markup || '<p class="sample-note">لا توجد أخبار منشورة حالياً.</p>');
    }
  } catch (error) {
    console.warn("News API unavailable; keeping the built-in preview.", error);
  }
})();

let clubMediaItems=[];
function mediaVideoEmbed(url){try{const u=new URL(String(url||''));if(u.hostname==='youtu.be')return 'https://www.youtube-nocookie.com/embed/'+encodeURIComponent(u.pathname.slice(1));if(u.hostname.endsWith('youtube.com')){const id=u.searchParams.get('v')||u.pathname.split('/').filter(Boolean).pop();if(id)return 'https://www.youtube-nocookie.com/embed/'+encodeURIComponent(id)}if(u.hostname.endsWith('vimeo.com')){const id=u.pathname.split('/').filter(Boolean).pop();if(/^\d+$/.test(id))return 'https://player.vimeo.com/video/'+id}}catch{}return ''}
function renderClubMedia(filter='all'){const box=document.getElementById('clubMediaGallery');if(!box)return;const list=filter==='all'?clubMediaItems:clubMediaItems.filter(x=>x.media_type===filter);if(!list.length){box.innerHTML='<p class="sample-note">لا توجد مواد منشورة في هذا القسم حالياً.</p>';return}box.innerHTML=list.map(item=>{const url=escapeMatchHtml(clubImageUrl(item.media_url)),title=escapeMatchHtml(item.title||'من معرض النادي'),desc=item.description?'<p>'+escapeMatchHtml(item.description)+'</p>':'';if(item.media_type==='video'){const embed=mediaVideoEmbed(item.media_url);const player=embed?'<iframe src="'+escapeMatchHtml(embed)+'" title="'+title+'" loading="lazy" allow="accelerometer; autoplay; encrypted-media; picture-in-picture; web-share" allowfullscreen></iframe>':(/\.(mp4|webm|mov)(\?|$)/i.test(item.media_url)?'<video controls preload="metadata" playsinline src="'+url+'"></video>':'<a class="media-video-link" href="'+url+'" target="_blank" rel="noopener">▶ مشاهدة الفيديو</a>');return '<article class="media-card video-card"><div class="media-video-frame">'+player+'</div><div class="media-card-caption"><b>'+title+'</b>'+desc+'</div></article>'}return '<article class="media-card"><button class="media-image-open" type="button" data-media-image="'+url+'"><img src="'+url+'" alt="'+title+'" loading="lazy"></button><div class="media-card-caption"><b>'+title+'</b>'+desc+'</div></article>'}).join('')}
async function loadClubMedia(){const box=document.getElementById('clubMediaGallery');if(!box)return;box.innerHTML='<p class="sample-note">جارٍ تحميل الصور والفيديو...</p>';try{const r=await fetch(clubBase+'/api/gallery?refresh='+Date.now(),{cache:'no-store'}),d=await r.json();if(!r.ok||!d.success||!Array.isArray(d.media))throw Error('تعذر تحميل المعرض');clubMediaItems=d.media;renderClubMedia(document.querySelector('[data-media-filter].selected')?.dataset.mediaFilter||'all')}catch(e){console.warn('Gallery unavailable',e);box.innerHTML='<p class="sample-note">تعذر تحميل الصور والفيديو حالياً. حاول لاحقاً.</p>'}}
document.addEventListener('click',e=>{const b=e.target.closest('[data-media-image]');if(!b)return;const o=document.createElement('div');o.className='media-lightbox';const i=document.createElement('img');i.src=b.dataset.mediaImage;i.alt='صورة من معرض النادي';const c=document.createElement('button');c.type='button';c.textContent='×';o.append(c,i);document.body.append(o);const close=()=>o.remove();c.onclick=close;o.onclick=e=>{if(e.target===o)close()}});

async function loadClubStandings(){const box=document.getElementById('leagueStandings');if(!box)return;try{const r=await fetch(clubBase+'/api/standings?refresh='+Date.now(),{cache:'no-store'}),d=await r.json();if(!r.ok||!d.success)throw Error();if(!d.standings.length){box.innerHTML='<p class="sample-note">لم يتم نشر جدول ترتيب الدوري بعد.</p>';return}box.innerHTML='<div class="standings-wrap"><table class="standings-table"><thead><tr><th>#</th><th>الفريق</th><th>لعب</th><th>فاز</th><th>تعادل</th><th>خسر</th><th>له</th><th>عليه</th><th>نقاط</th></tr></thead><tbody>'+d.standings.map((x,i)=>'<tr><td>'+(i+1)+'</td><td>'+escapeMatchHtml(x.team_name)+'</td><td>'+x.played+'</td><td>'+x.wins+'</td><td>'+x.draws+'</td><td>'+x.losses+'</td><td>'+x.goals_for+'</td><td>'+x.goals_against+'</td><td><b>'+x.points+'</b></td></tr>').join('')+'</tbody></table></div>'}catch{box.innerHTML='<p class="sample-note">تعذر تحميل جدول الترتيب حالياً.</p>'}}
async function loadClubAnthems(){const box=document.getElementById('clubAnthemList');if(!box)return;try{const r=await fetch(clubBase+'/api/anthems?refresh='+Date.now(),{cache:'no-store'}),d=await r.json();if(!r.ok||!d.success)throw Error();if(!d.anthems.length){box.innerHTML='<p class="sample-note">لا توجد أناشيد منشورة حالياً.</p>';return}box.innerHTML=d.anthems.map(a=>'<article class="anthem-item"><div><b>'+escapeMatchHtml(a.title)+'</b>'+(a.description?'<p>'+escapeMatchHtml(a.description)+'</p>':'')+'</div><audio controls preload="none" src="'+escapeMatchHtml(clubImageUrl(a.audio_url))+'">متصفحك لا يدعم تشغيل الصوت.</audio></article>').join('')}catch{box.innerHTML='<p class="sample-note">تعذر تحميل الأناشيد حالياً.</p>'}}
async function loadClubHistory(){const box=document.getElementById('clubHistory');if(!box)return;try{const r=await fetch(clubBase+'/api/history?refresh='+Date.now(),{cache:'no-store'}),d=await r.json();if(!r.ok||!d.success)throw Error();const h=d.history;box.innerHTML='<h2>'+escapeMatchHtml(h.title)+'</h2><p class="history-founded">تأسس النادي عام '+escapeMatchHtml(h.founded_year)+'</p><div class="history-content">'+escapeMatchHtml(h.content||'لم تُضف تفاصيل تاريخ النادي بعد.')+'</div>'+(h.achievements?'<h3>الإنجازات</h3><div class="history-content">'+escapeMatchHtml(h.achievements)+'</div>':'')}catch{box.innerHTML='<p class="sample-note">تعذر تحميل تاريخ النادي حالياً.</p>'}}
async function openClubNotifications(){const overlay=document.getElementById('notificationsBackdrop'),box=document.getElementById('clubNotifications');overlay.hidden=false;box.innerHTML='<p class="sample-note">جارٍ تحميل الإشعارات...</p>';try{const r=await fetch(clubBase+'/api/notifications?refresh='+Date.now(),{cache:'no-store'}),d=await r.json();if(!r.ok||!d.success)throw Error();box.innerHTML=d.notifications.length?d.notifications.map(n=>'<article class="notification-item"><b>'+escapeMatchHtml(n.title)+'</b><p>'+escapeMatchHtml(n.body)+'</p><small>'+escapeMatchHtml(n.created_at||'')+'</small></article>').join(''):'<p class="sample-note">لا توجد إشعارات جديدة.</p>'}catch{box.innerHTML='<p class="sample-note">تعذر تحميل الإشعارات.</p>'}}
