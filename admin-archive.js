(() => {
  const $ = s => document.querySelector(s);
  const token = () => sessionStorage.getItem('shaab-admin-token') || '';
  const headers = () => ({ Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' });
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let items = [], editing = null;

  function paint() {
    const q = ($('#archiveAdminSearch')?.value || '').trim().toLowerCase();
    const rows = items.filter(x => (x.title || '').toLowerCase().includes(q));
    $('#archiveAdminTable').innerHTML = rows.map(x => '<tr><td>' +
      (x.media_type === 'image' ? '<img src="' + esc(x.media_url) + '" style="width:64px;height:46px;object-fit:cover;border-radius:7px">' : '<span class="status">▶ فيديو</span>') +
      '</td><td>' + esc(x.title) + '</td><td>' + (x.media_type === 'image' ? 'صورة' : 'فيديو') +
      '</td><td>' + esc(x.created_at || '') + '</td><td><button class="btn secondary small" data-edit-archive="' + x.id + '">تعديل</button> <button class="btn danger small" data-delete-archive="' + x.id + '">حذف</button></td></tr>'
    ).join('') || '<tr><td colspan="5" class="empty">لا توجد صور أو فيديوهات تاريخية مضافة بعد.</td></tr>';
  }

  window.loadArchive = async () => {
    try {
      const r = await fetch('/api/archive?refresh=' + Date.now(), { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok || !d.success) throw Error(d.message || 'تعذر تحميل ذاكرة النوارس');
      items = d.media || [];
      paint();
    } catch (e) {
      $('#archiveAdminTable').innerHTML = '<tr><td colspan="5" class="empty">' + esc(e.message) + '</td></tr>';
    }
  };

  function closeForm() { $('#archiveAdminModal').hidden = true; }
  function openForm(item = null) {
    editing = item ? item.id : null;
    $('#archiveAdminTitle').textContent = item ? 'تعديل مادة من ذاكرة النوارس' : 'إضافة صور أو فيديوهات تاريخية';
    $('#archiveAdminName').value = item?.title || '';
    $('#archiveAdminDescription').value = item?.description || '';
    $('#archiveAdminFile').value = '';
    $('#archiveAdminFile').required = !item;
    $('#archiveAdminFileHelp').textContent = item ? 'اختر ملفاً جديداً فقط إذا أردت استبدال الملف الحالي.' : 'يمكن تحديد عدة صور وفيديوهات دفعة واحدة. الصور حتى 8 ميجابايت والفيديو حتى 50 ميجابايت.';
    $('#archiveAdminModal').hidden = false;
  }

  $('#addArchiveMedia').addEventListener('click', () => openForm());
  $('#archiveAdminCancel').addEventListener('click', closeForm);
  $('#archiveAdminModal').addEventListener('click', e => { if (e.target.id === 'archiveAdminModal') closeForm(); });
  $('#archiveAdminSearch').addEventListener('input', paint);
  $('#archiveAdminTable').addEventListener('click', async e => {
    const edit = e.target.closest('[data-edit-archive]');
    const del = e.target.closest('[data-delete-archive]');
    if (edit) { const item = items.find(x => x.id === Number(edit.dataset.editArchive)); if (item) openForm(item); }
    if (del) {
      const id = Number(del.dataset.deleteArchive);
      if (!confirm('حذف هذه المادة من ذاكرة النوارس نهائياً؟')) return;
      try {
        const r = await fetch('/api/archive?id=' + id, { method: 'DELETE', headers: headers() });
        const d = await r.json(); if (!r.ok || !d.success) throw Error(d.message || 'تعذر الحذف');
        await window.loadArchive();
      } catch (error) { alert(error.message); }
    }
  });

  $('#archiveAdminForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fileInput = $('#archiveAdminFile');
    const files = [...fileInput.files];
    const title = $('#archiveAdminName').value.trim();
    const description = $('#archiveAdminDescription').value.trim();
    const saveButton = $('#archiveAdminSave');
    try {
      if (!token()) throw Error('انتهت جلسة الإدارة. سجل الدخول مجدداً.');
      if (!title) throw Error('اكتب عنوان المادة أولاً.');
      if (editing !== null) {
        const old = items.find(x => x.id === editing);
        let record = { title, description, media_type: old.media_type, media_url: old.media_url, media_key: old.media_key || '' };
        if (files[0]) {
          const fd = new FormData(); fd.append('images', files[0]);
          const upload = await fetch('/api/media', { method: 'POST', headers: { Authorization: 'Bearer ' + token() }, body: fd });
          const ud = await upload.json();
          if (!upload.ok || !ud.success || !ud.media?.[0]) throw Error(ud.message || 'تعذر رفع الملف');
          record.media_url = ud.media[0].url; record.media_key = ud.media[0].key; record.media_type = ud.media[0].media_type;
        }
        const r = await fetch('/api/archive?id=' + editing, { method: 'PUT', headers: headers(), body: JSON.stringify(record) });
        const d = await r.json(); if (!r.ok || !d.success) throw Error(d.message || 'تعذر تعديل المادة');
      } else {
        if (!files.length) throw Error('اختر صورة أو فيديو واحداً على الأقل.');
        const fd = new FormData(); files.forEach(f => fd.append('images', f));
        const upload = await fetch('/api/media', { method: 'POST', headers: { Authorization: 'Bearer ' + token() }, body: fd });
        const ud = await upload.json();
        if (!upload.ok || !ud.success || !Array.isArray(ud.media)) throw Error(ud.message || 'تعذر رفع الملفات');
        for (let i = 0; i < ud.media.length; i++) {
          const f = ud.media[i];
          const file = files[i];
          const itemTitle = files.length > 1 ? (title + ' - ' + (file.name || ('ملف ' + (i + 1)))) : title;
          const r = await fetch('/api/archive', { method: 'POST', headers: headers(), body: JSON.stringify({ title: itemTitle, description, media_type: f.media_type, media_url: f.url, media_key: f.key }) });
          const d = await r.json(); if (!r.ok || !d.success) throw Error(d.message || 'تعذر حفظ أحد الملفات في ذاكرة النوارس');
        }
      }
      closeForm(); await window.loadArchive();
    } catch (error) { alert(error.message); }
    finally { saveButton.disabled = false; saveButton.textContent = 'حفظ'; }
    saveButton.disabled = true; saveButton.textContent = 'جارٍ الحفظ...';
  });

  window.loadArchive();
})();