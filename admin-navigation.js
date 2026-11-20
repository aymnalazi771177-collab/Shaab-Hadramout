(() => {
  const titles = {
    dashboard: "الرئيسية",
    news: "إدارة الأخبار",
    team: "اللاعبون والمدرب",
    matches: "المباريات والنتائج",
    transfers: "إدارة الانتقالات",
    media: "الصور والفيديو",
    standings: "ترتيب الدوري", anthems: "أناشيد النادي", history: "تاريخ النادي", notifications: "الإشعارات",
    admins: "المشرفون والصلاحيات"
  };

  function showSection(name) {
    if (!Object.prototype.hasOwnProperty.call(titles, name)) return;
    document.querySelectorAll(".page").forEach(page => {
      page.classList.toggle("active", page.id === "section-" + name);
    });
    document.querySelectorAll(".nav button[data-section]").forEach(button => {
      button.classList.toggle("active", button.dataset.section === name);
    });
    const heading = document.getElementById("pageTitle");
    if (heading) heading.textContent = titles[name];
    const sidebar = document.getElementById("sidebar");
    if (sidebar) sidebar.classList.remove("open");
    if (name === "matches" && typeof window.loadMatches === "function") window.loadMatches();
    if (name === "transfers" && typeof window.loadTransfers === "function") window.loadTransfers();
    if (name === "media" && typeof window.loadMedia === "function") window.loadMedia();
    if (name === "standings" && typeof window.loadStandings === "function") window.loadStandings();
    if (name === "anthems" && typeof window.loadAnthems === "function") window.loadAnthems();
    if (name === "history" && typeof window.loadHistory === "function") window.loadHistory();
    if (name === "notifications" && typeof window.loadNotifications === "function") window.loadNotifications();
    if (name === "admins" && typeof window.loadAdmins === "function") window.loadAdmins();
  }

  document.addEventListener("click", event => {
    const navButton = event.target.closest(".nav button[data-section]");
    if (navButton) {
      event.preventDefault();
      showSection(navButton.dataset.section);
      return;
    }
    const goButton = event.target.closest("[data-go]");
    if (goButton) {
      event.preventDefault();
      showSection(goButton.dataset.go);
      return;
    }
    if (event.target.closest("#menuToggle")) {
      const sidebar = document.getElementById("sidebar");
      if (sidebar) sidebar.classList.toggle("open");
    }
  }, true);

  (async function applyAdminPermissions(){
    const token=sessionStorage.getItem("shaab-admin-token")||"";
    if(!token)return;
    try{
      const response=await fetch("/api/auth",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
      const data=await response.json();
      if(!response.ok||!data.success)throw new Error("جلسة غير صالحة");
      const admin=data.admin||{},permissions=admin.permissions||[];
      if(admin.owner||permissions.includes("*"))return;
      const map={news:"news",team:"team",matches:"matches",standings:"standings",transfers:"transfers",media:"media",anthems:"anthems",history:"history",notifications:"notifications",admins:"admins"};
      document.querySelectorAll(".nav button[data-section]").forEach(button=>{const key=button.dataset.section;if(key!=="dashboard"&&!permissions.includes(map[key]))button.hidden=true});
      const active=document.querySelector(".nav button.active");
      if(active&&active.hidden)document.querySelector('.nav button[data-section="dashboard"]')?.click();
      const name=document.querySelector(".topbar .profile span:nth-child(2)");
      if(name)name.textContent=admin.display_name||"مشرف";
    }catch(error){sessionStorage.removeItem("shaab-admin-token");}
  })();

})();