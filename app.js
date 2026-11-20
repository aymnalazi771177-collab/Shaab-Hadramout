const pages=['home','news','team','matches','more'];const nav=[...document.querySelectorAll('.nav-item')];const toast=document.getElementById('toast');
function notify(message){toast.textContent=message;toast.classList.add('show');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>toast.classList.remove('show'),2300)}
function showPage(name){pages.forEach(p=>document.getElementById('page-'+p).classList.toggle('active',p===name));nav.forEach(b=>b.classList.toggle('active',b.dataset.page===name));document.body.classList.toggle('page-home',name==='home');if(name==='team')loadClubPlayers();window.scrollTo({top:0,behavior:'smooth'})}
nav.forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));
document.querySelectorAll('[data-home]').forEach(b=>b.addEventListener('click',()=>showPage('home')));
document.getElementById('menuBtn').addEventListener('click',()=>showPage('more'));
document.getElementById('alertsBtn').addEventListener('click',()=>notify('لا توجد إشعارات جديدة حالياً'));
document.addEventListener('click',event=>{const btn=event.target.closest('[data-match-details]');if(btn){const note=btn.dataset.notes||'لا توجد تفاصيل إضافية لهذه المباراة.';notify(note)}});
document.getElementById('anthemPlay').addEventListener('click',()=>notify('ستضاف أناشيد النادي الرسمية قريباً'));
document.querySelectorAll('[data-message]').forEach(b=>b.addEventListener('click',()=>notify(b.dataset.message)));
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
 if(upcomingBox)upcomingBox.innerHTML=upcoming?'<article class="upcoming-card"><div class="versus-banner"><div class="versus-teams"><div><img src="'+escapeMatchHtml(clubImageUrl(upcoming.home_logo_url))+'" alt=""><b>شعب حضرموت</b></div><strong>VS</strong><div><img src="'+escapeMatchHtml(clubImageUrl(upcoming.opponent_logo_url))+'" alt=""><b>'+escapeMatchHtml(upcoming.opponent)+'</b></div></div></div><div class="match-meta"><span>'+escapeMatchHtml(matchDateLabel(upcoming.match_date))+'</span><i></i><span>'+escapeMatchHtml(upcoming.match_time||'يحدد لاحقاً')+'</span></div><p style="text-align:center;margin:8px 0;color:#777">'+escapeMatchHtml([upcoming.competition,upcoming.venue].filter(Boolean).join(' · '))+'</p><button class="details-btn" data-match-details data-notes="'+escapeMatchHtml(upcoming.notes||'')+'">تفاصيل المباراة</button></article>':'<article class="upcoming-card"><p class="sample-note">لا توجد مباراة قادمة معلنة حالياً.</p></article>';
 if(resultsBox)resultsBox.innerHTML=finished.length?finished.map(m=>'<article class="result-card"><div><div class="result-crest"><img src="'+escapeMatchHtml(clubImageUrl(m.home_logo_url))+'" alt=""></div><b>شعب حضرموت</b></div><strong>'+escapeMatchHtml(m.home_score??'0')+' - '+escapeMatchHtml(m.away_score??'0')+'</strong><div><div class="opponent-crest small"><img src="'+escapeMatchHtml(clubImageUrl(m.opponent_logo_url))+'" alt=""></div><b>'+escapeMatchHtml(m.opponent)+'</b></div></article>').join(''):'<p class="sample-note">لا توجد نتائج مسجلة حتى الآن.</p>';
}
function escapeMatchHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function loadClubMatches(){const box=document.getElementById('upcomingMatchCard');try{const response=await fetch(clubBase+'/api/matches?refresh='+Date.now(),{cache:'no-store'});const data=await response.json();if(!response.ok||!data.success||!Array.isArray(data.matches))throw new Error('تعذر تحميل المباريات');renderClubMatches(data.matches)}catch(error){console.warn('Matches API unavailable',error);if(box)box.innerHTML='<article class="upcoming-card"><p class="sample-note">تعذر تحميل المباريات حالياً. تحقق من اتصال الإنترنت.</p></article>';const results=document.getElementById('recentResults');if(results)results.innerHTML='<p class="sample-note">تعذر تحميل النتائج حالياً.</p>'}}

loadClubMatches();

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

  try {
    const response = await fetch("https://shaab-hadramout.pages.dev/api/news", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || !payload.success || !Array.isArray(payload.news)) return;
    const items = payload.news;
    newsById = new Map(items.map(item => [String(item.id), item]));
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
      homeNews.querySelectorAll(".news-row").forEach(row => row.remove());
      homeNews.insertAdjacentHTML("beforeend", markup || '<p class="sample-note">لا توجد أخبار منشورة حالياً.</p>');
    }
    if (allNews) {
      allNews.querySelectorAll(".news-row").forEach(row => row.remove());
      allNews.insertAdjacentHTML("beforeend", markup || '<p class="sample-note">لا توجد أخبار منشورة حالياً.</p>');
    }
  } catch (error) {
    console.warn("News API unavailable; keeping the built-in preview.", error);
  }
})();
