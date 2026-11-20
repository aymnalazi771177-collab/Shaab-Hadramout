(() => {
  const tokenKey = "shaab-admin-token";
  const getToken = () => sessionStorage.getItem(tokenKey) || "";
  const authHeaders = () => ({ "Authorization": "Bearer " + getToken() });
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

  let imageItems = [];
  let selectedFiles = [];
  const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const normalizeImages = item => Array.isArray(item.images) && item.images.length
    ? item.images.map(entry => typeof entry === "string" ? {url:entry} : {url:entry.url}).filter(entry => entry.url)
    : (item.image_url ? [{url:item.image_url}] : []);

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

  function drawImageList() {
    const holder = document.getElementById("newsImagesPreview");
    if (!holder) return;
    const savedRows = imageItems.map((item, index) =>
      '<div style="display:flex;align-items:center;gap:9px;border:1px solid #e8e9ee;border-radius:10px;padding:7px;margin-top:7px">' +
      '<img src="' + escape(item.url) + '" style="width:58px;height:52px;object-fit:cover;border-radius:7px" alt="">' +
      '<span style="flex:1;font-size:12px;overflow-wrap:anywhere">' + (index === 0 ? "الصورة الرئيسية" : "صورة " + (index + 1)) + '</span>' +
      '<button type="button" class="btn danger small" data-remove-image="' + index + '">حذف</button></div>'
    ).join("");
    const localRows = selectedFiles.map((entry, index) =>
      '<div style="display:flex;align-items:center;gap:9px;border:1px dashed #bd0008;border-radius:10px;padding:7px;margin-top:7px">' +
      '<img src="' + escape(entry.preview) + '" style="width:58px;height:52px;object-fit:cover;border-radius:7px" alt="">' +
      '<span style="flex:1;font-size:12px;overflow-wrap:anywhere">' + escape(entry.file.name) + ' · جاهزة للرفع</span>' +
      '<button type="button" class="btn danger small" data-remove-local-image="' + index + '">حذف</button></div>'
    ).join("");
    holder.innerHTML = '<div style="font-size:12px;color:#555;margin-bottom:8px">الصور المضافة: <b>' + (imageItems.length + selectedFiles.length) + ' / 20</b> — أول صورة ستكون الرئيسية</div>' +
      (savedRows + localRows || '<small style="color:#888">لم تتم إضافة صور بعد.</small>');
    holder.querySelectorAll("[data-remove-image]").forEach(button => button.onclick = () => {
      imageItems.splice(Number(button.dataset.removeImage), 1);
      drawImageList();
    });
    holder.querySelectorAll("[data-remove-local-image]").forEach(button => button.onclick = () => {
      const removed = selectedFiles.splice(Number(button.dataset.removeLocalImage), 1)[0];
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      drawImageList();
    });
  }

  function openNewsEditor(item = null) {
    imageItems = item ? normalizeImages(item) : [];
    selectedFiles = [];
    openModal("news", item ? "تعديل الخبر" : "إضافة خبر", [
      {name:"title",label:"عنوان الخبر",required:true},
      {name:"content",label:"محتوى الخبر"}
    ], item || {});
    const fields = document.getElementById("formFields");
    fields.insertAdjacentHTML("beforeend",
      '<div class="field"><label>رفع صور من الجهاز</label><input id="newsImageFiles" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple><small style="color:#777">يمكن تحديد عدة صور دفعة واحدة، أو فتح الاختيار أكثر من مرة لإضافة صور أخرى. JPG وPNG وWEBP وGIF — الحد الأقصى 8 ميجابايت للصورة.</small></div>' +
      '<div class="field"><label>إضافة صورة من رابط</label><div style="display:flex;gap:7px"><input id="newsImageUrl" type="url" placeholder="https://example.com/photo.jpg"><button type="button" class="btn secondary" id="addNewsImageUrl">إضافة</button></div></div>' +
      '<div class="field"><label>صور الخبر (أول صورة هي الرئيسية)</label><div id="newsImagesPreview"></div></div>'
    );
    document.getElementById("newsImageFiles").onchange = event => {
      const incoming = [...event.target.files];
      const allowedTypes = ["image/jpeg","image/png","image/webp","image/gif"];
      for (const file of incoming) {
        if (!allowedTypes.includes(file.type)) {
          alert("توجد صيغة صورة غير مدعومة: " + file.name);
          continue;
        }
        if (file.size > 8 * 1024 * 1024) {
          alert("حجم الصورة أكبر من 8 ميجابايت: " + file.name);
          continue;
        }
        if (imageItems.length + selectedFiles.length >= 20) {
          alert("الحد الأقصى للخبر 20 صورة.");
          break;
        }
        selectedFiles.push({file, preview:URL.createObjectURL(file)});
      }
      event.target.value = "";
      drawImageList();
    };
    document.getElementById("addNewsImageUrl").onclick = () => {
      const input = document.getElementById("newsImageUrl");
      const value = input.value.trim();
      try {
        const parsed = new URL(value);
        if (!["http:","https:"].includes(parsed.protocol)) throw new Error();
      } catch { return alert("أدخل رابط صورة صحيحاً يبدأ بـ https:// أو http://"); }
      if (imageItems.length + selectedFiles.length >= 20) return alert("الحد الأقصى للخبر 20 صورة.");
      imageItems.push({url:value});
      input.value = "";
      drawImageList();
    };
    drawImageList();
  }

  const addButton = document.getElementById("addNews");
  if (addButton) addButton.onclick = () => openNewsEditor();
  window.editNews = id => {
    const item = news.find(entry => entry.id === id);
    if (item) openNewsEditor(item);
  };

  window.delNews = async id => {
    if (!confirm("هل تريد حذف هذا الخبر نهائياً؟")) return;
    if (!getToken()) return alert("أدخل رمز الإدارة أولاً من زر دخول الإدارة.");
    try {
      const response = await fetch("/api/news?id=" + encodeURIComponent(id), { method:"DELETE", headers:authHeaders() });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "تعذر الحذف");
      await refreshNews();
    } catch (error) { alert(error.message); }
  };

  const form = document.getElementById("editForm");
  if (form) form.addEventListener("submit", async event => {
    if (kind !== "news") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!getToken()) return alert("أدخل رمز الإدارة أولاً من زر دخول الإدارة.");
    const values = Object.fromEntries(new FormData(form).entries());
    try {
      if (selectedFiles.length) {
        const uploadForm = new FormData();
        selectedFiles.forEach(entry => uploadForm.append("images", entry.file));
        const uploadResponse = await fetch("/api/media", { method:"POST", headers:authHeaders(), body:uploadForm });
        const uploadData = await uploadResponse.json();
        if (!uploadResponse.ok || !uploadData.success) throw new Error(uploadData.message || "تعذر رفع الصور");
        imageItems.push(...uploadData.images.map(image => ({url:image.url})));
        selectedFiles.forEach(entry => URL.revokeObjectURL(entry.preview));
        selectedFiles = [];
      }
      values.images = imageItems.map(image => ({url:image.url}));
      values.image_url = imageItems[0]?.url || "";
      const isEdit = editing !== null;
      const response = await fetch(isEdit ? "/api/news?id=" + encodeURIComponent(editing) : "/api/news", {
        method:isEdit ? "PUT" : "POST",
        headers:{...authHeaders(),"Content-Type":"application/json"},
        body:JSON.stringify(values)
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || "تعذر حفظ الخبر");
      closeModal();
      form.reset();
      await refreshNews();
    } catch (error) { alert(error.message); }
  }, true);

  refreshNews();
})();
