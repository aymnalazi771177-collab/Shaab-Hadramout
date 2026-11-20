(() => {
  const titles = {
    dashboard: "الرئيسية",
    news: "إدارة الأخبار",
    team: "اللاعبون والمدرب",
    matches: "المباريات والنتائج",
    transfers: "إدارة الانتقالات",
    media: "الصور والفيديو",
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
})();