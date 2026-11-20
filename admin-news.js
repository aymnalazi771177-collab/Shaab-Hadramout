(() => {
  const tokenKey = "shaab-admin-token";
  const getToken = () => sessionStorage.getItem(tokenKey) || "";
  const authHeaders = () => ({ "Content-Type": "application/json", "Authorization": "Bearer " + getToken() });

  const topbar = document.querySelector(".topbar .profile");
  if (topbar) {
    const login = document.createElement("button");
    login.className = "btn secondary small";
    login.textContent = getToken() ? "تغيير رمز الإدارة" : "دخول الإدارة";
    login.onclick = () => {
      const value = prompt("أدخل رمز الإدارة الذي تم ضبطه في إعدادات Cloudflare:");
      if (value === null) return;
      if (!value.trim()) return alert("لم يتم إدخال الرمز.");
      sessionStorage.setItem(tokenKey, value.trim());
      login.textContent = "تغيير رمز الإدارة";
      alert("تم حفظ الرمز لهذه الجلسة.");
    };
    topbar.append(login);
  }

  async function refreshNews() {
    try {
      const response = await fetch("/api/news", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "تعذر تحميل الأخبار");
      news = (data.news || []).map(item => ({
        ...item,
        date: item.created_at ? new Date(item.created_at.replace(" ", "T") + (item.created_at.includes("Z") ? "" : "Z")).toLocaleDateString("en-CA") : ""
      }));
      render();
    } catch (error) {
      console.error(error);
      alert("تعذر تحميل الأخبار من قاعدة البيانات. تحقق من اتصال الإنترنت ثم أعد تحميل الصفحة.");
    }
  }

  const addButton = document.getElementById("addNews");
  if (addButton) addButton.onclick = () => openModal("news", "إضافة خبر", [
    { name: "title", label: "عنوان الخبر", required: true },
    { name: "content", label: "محتوى الخبر" },
    { name: "image_url", label: "رابط صورة الخبر" }
  ]);

  window.editNews = id => {
    const item = news.find(entry => entry.id === id);
    if (!item) return;
    openModal("news", "تعديل الخبر", [
      { name: "title", label: "عنوان الخبر", required: true },
      { name: "content", label: "محتوى الخبر" },
      { name: "image_url", label: "رابط صورة الخبر" }
    ], item);
  };

  window.delNews = async id => {
    if (!confirm("هل تريد حذف هذا الخبر نهائياً؟")) return;
    if (!getToken()) return alert("أدخل رمز الإدارة أولاً من زر دخول الإدارة.");
    try {
      const response = await fetch("/api/news?id=" + encodeURIComponent(id), {
        method: "DELETE",
        headers: authHeaders()
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "تعذر الحذف");
      await refreshNews();
    } catch (error) {
      alert(error.message);
    }
  };

  const form = document.getElementById("editForm");
  if (form) form.addEventListener("submit", async event => {
    if (kind !== "news") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!getToken()) return alert("أدخل رمز الإدارة أولاً من زر دخول الإدارة.");
    const values = Object.fromEntries(new FormData(form).entries());
    const isEdit = editing !== null;
    try {
      const response = await fetch(isEdit ? "/api/news?id=" + encodeURIComponent(editing) : "/api/news", {
        method: isEdit ? "PUT" : "POST",
        headers: authHeaders(),
        body: JSON.stringify(values)
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "تعذر حفظ الخبر");
      closeModal();
      form.reset();
      await refreshNews();
    } catch (error) {
      alert(error.message);
    }
  }, true);

  refreshNews();
})();