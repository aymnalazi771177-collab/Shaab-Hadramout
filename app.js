const pages=['home','news','team','matches','more'];const nav=[...document.querySelectorAll('.nav-item')];const toast=document.getElementById('toast');
function notify(message){toast.textContent=message;toast.classList.add('show');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>toast.classList.remove('show'),2300)}
function showPage(name){pages.forEach(p=>document.getElementById('page-'+p).classList.toggle('active',p===name));nav.forEach(b=>b.classList.toggle('active',b.dataset.page===name));document.body.classList.toggle('page-home',name==='home');window.scrollTo({top:0,behavior:'smooth'})}
nav.forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));
document.querySelectorAll('[data-home]').forEach(b=>b.addEventListener('click',()=>showPage('home')));
document.getElementById('menuBtn').addEventListener('click',()=>showPage('more'));
document.getElementById('alertsBtn').addEventListener('click',()=>notify('لا توجد إشعارات جديدة حالياً'));
document.getElementById('matchDetails').addEventListener('click',()=>notify('ستظهر تفاصيل المباراة بعد اعتماد بياناتها الرسمية'));
document.getElementById('anthemPlay').addEventListener('click',()=>notify('ستضاف أناشيد النادي الرسمية قريباً'));
document.querySelectorAll('[data-message]').forEach(b=>b.addEventListener('click',()=>notify(b.dataset.message)));
const players=[
['حراس المرمى','راشد العلي','1','https://randomuser.me/api/portraits/men/32.jpg'],
['حراس المرمى','أحمد باحاج','22','https://randomuser.me/api/portraits/men/45.jpg'],
['حراس المرمى','منير عوض','33','https://randomuser.me/api/portraits/men/51.jpg'],
['الدفاع','محمد سالم','4','https://randomuser.me/api/portraits/men/12.jpg'],
['الدفاع','عمر باجندوح','5','https://randomuser.me/api/portraits/men/14.jpg'],
['الدفاع','خالد باحسن','6','https://randomuser.me/api/portraits/men/18.jpg'],
['الوسط','سالم عوض','11','https://randomuser.me/api/portraits/men/22.jpg'],
['الوسط','عبدالله عمر','12','https://randomuser.me/api/portraits/men/26.jpg'],
['الوسط','أحمد الصافي','14','https://randomuser.me/api/portraits/men/28.jpg'],
['الهجوم','مازن سالم','7','https://randomuser.me/api/portraits/men/33.jpg'],
['الهجوم','فهد باوزير','9','https://randomuser.me/api/portraits/men/36.jpg'],
['الهجوم','علي باحمدان','10','https://randomuser.me/api/portraits/men/39.jpg'],
['المدرب','المدرب الفني','مدرب','https://randomuser.me/api/portraits/men/56.jpg']
];
function renderPlayers(filter){const grid=document.getElementById('playerGrid');grid.innerHTML='';players.filter(p=>p[0]===filter).forEach(p=>{const card=document.createElement('article');card.className='player-card'+(filter==='المدرب'?' coach-card':'');const img=document.createElement('img');img.src=p[3];img.alt='صورة تجريبية';const name=document.createElement('strong');name.textContent=p[1];const number=document.createElement('em');number.textContent=p[2];card.append(img,name,number);grid.append(card)})}
renderPlayers('حراس المرمى');
document.querySelectorAll('#teamTabs button').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('#teamTabs button').forEach(x=>x.classList.toggle('selected',x===b));renderPlayers(b.dataset.filter)}));

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
      ? item.images.map(entry => typeof entry === "string" ? entry : entry.url).filter(Boolean)
      : (item.image_url ? [item.image_url] : []);
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
      const image = (Array.isArray(item.images) && item.images.length ? (typeof item.images[0] === "string" ? item.images[0] : item.images[0].url) : item.image_url) || fallbackImage;
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
