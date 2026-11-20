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

// Load club news from the shared D1 database.
(async function loadClubNews() {
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
  const dateLabel = value => {
    if (!value) return "";
    const parsed = new Date(String(value).replace(" ", "T") + (String(value).includes("Z") ? "" : "Z"));
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString("en-CA");
  };
  try {
    const response = await fetch("/api/news", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || !payload.success || !Array.isArray(payload.news)) return;
    const items = payload.news;
    const markup = items.map(item => {
      const image = item.image_url || "https://images.unsplash.com/photo-1517466787929-bc90951d0974?auto=format&fit=crop&w=400&q=80";
      return '<article class="news-row"><img src="' + escapeHtml(image) + '" alt=""><div><h3>' +
        escapeHtml(item.title) + '</h3><small>' + escapeHtml(dateLabel(item.created_at)) +
        '</small></div></article>';
    }).join("");
    const homeNews = document.querySelector("#page-home .news-section");
    const allNews = document.querySelector("#page-news .page-content");
    if (homeNews) {
      const oldRows = homeNews.querySelectorAll(".news-row");
      oldRows.forEach(row => row.remove());
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
