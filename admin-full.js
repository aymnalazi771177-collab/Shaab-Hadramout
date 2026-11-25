(() => {
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],token=()=>sessionStorage.getItem('shaab-admin-token')||'',headers=()=>({Authorization:'Bearer '+token(),'Content-Type':'application/json'});
const labels={live:"البث المباشر",carousel:"السلايدر الرئيسي",news:'الأخبار',team:'اللاعبون والمدرب',matches:'المباريات والنتائج',transfers:'الانتقالات',media:'الصور والفيديو',archive:'ذاكرة النوارس',standings:'ترتيب الدوري',anthems:'الأناشيد',history:'تاريخ النادي',notifications:'الإشعارات'};
let standings=[],anthems=[],notifications=[],admins=[],historyData=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function list(path,key){const r=await fetch('/api/'+path,{headers:{Authorization:'Bearer '+token()},cache:'no-store'}),d=await r.json();if(!r.ok||!d.success)throw Error(d.message||'تعذر تحميل البيانات');return d[key]||[]}
function paintStandings(){const x=$('#standingsTable');if(x)x.innerHTML=standings.map(v=>'<tr><td>'+esc(v.team_name)+'</td><td>'+v.played+'</td><td>'+v.wins+'</td><td>'+v.draws+'</td><td>'+v.losses+'</td><td>'+v.goals_for+'</td><td>'+v.goals_against+'</td><td><b>'+v.points+'</b></td><td><button class="btn secondary small" onclick="editStanding('+v.id+')">تعديل</button> <button class="btn danger small" onclick="delStanding('+v.id+')">حذف</button></td></tr>').join('')||'<tr><td colspan="9" class="empty">لا توجد فرق في جدول الترتيب</td></tr>'}
function paintAnthems(){const x=$('#anthemsTable');if(x)x.innerHTML=anthems.map(v=>'<tr><td>'+esc(v.title)+'</td><td><audio controls preload="none" src="'+esc(v.audio_url)+'" style="width:180px"></audio></td><td><button class="btn secondary small" onclick="editAnthem('+v.id+')">تعديل</button> <button class="btn danger small" onclick="delAnthem('+v.id+')">حذف</button></td></tr>').join('')||'<tr><td colspan="3" class="empty">لا توجد أناشيد</td></tr>'}
function paintNotifications(){const x=$('#notificationsTable');if(x)x.innerHTML=notifications.map(v=>'<tr><td>'+esc(v.title)+'</td><td>'+esc(v.body)+'</td><td>'+esc(v.created_at)+'</td><td><button class="btn danger small" onclick="delNotification('+v.id+')">حذف</button></td></tr>').join('')||'<tr><td colspan="4" class="empty">لا توجد إشعارات</td></tr>'}
function paintAdmins(){const stat=$('#statAdmins');if(stat)stat.textContent=String(admins.length+1);const x=$('#adminsTable');if(x)x.innerHTML=admins.map(v=>'<tr><td>'+esc(v.display_name)+'</td><td>'+esc(v.username)+'</td><td>'+v.permissions.map(p=>esc(labels[p]||p)).join('، ')+'</td><td><span class="status">'+(v.active?'نشط':'موقوف')+'</span></td><td><button class="btn secondary small" onclick="editAdmin('+v.id+')">تعديل</button> <button class="btn danger small" onclick="delAdmin('+v.id+')">حذف</button></td></tr>').join('')||'<tr><td colspan="5" class="empty">لم تتم إضافة مشرفين بعد</td></tr>'}
window.loadStandings=async()=>{try{standings=await list('standings','standings');paintStandings()}catch(e){$('#standingsTable').innerHTML='<tr><td colspan="9" class="empty">'+esc(e.message)+'</td></tr>'}};
window.loadAnthems=async()=>{try{anthems=await list('anthems','anthems');paintAnthems()}catch(e){$('#anthemsTable').innerHTML='<tr><td colspan="3" class="empty">'+esc(e.message)+'</td></tr>'}};
window.loadNotifications=async()=>{try{notifications=await list('notifications','notifications');paintNotifications()}catch(e){$('#notificationsTable').innerHTML='<tr><td colspan="4" class="empty">'+esc(e.message)+'</td></tr>'}};
window.loadAdmins=async()=>{try{admins=await list('admins','admins');paintAdmins()}catch(e){$('#adminsTable').innerHTML='<tr><td colspan="5" class="empty">تعذر تحميل المشرفين؛ تحقق من صلاحية إدارة المشرفين.</td></tr>'}};
window.loadHistory=async()=>{try{const r=await fetch('/api/history',{cache:'no-store'}),d=await r.json();if(!r.ok||!d.success)throw Error(d.message);historyData=d.history;$('#historyPreview').innerHTML='<h3>'+esc(historyData.title)+'</h3><p>سنة التأسيس: '+esc(historyData.founded_year)+'</p><p style="white-space:pre-wrap">'+esc(historyData.content)+'</p><h4>الإنجازات</h4><p style="white-space:pre-wrap">'+esc(historyData.achievements)+'</p>'}catch(e){$('#historyPreview').textContent='تعذر تحميل بيانات تاريخ النادي'}};
function modal(type,title,fields,data={}){openModal(type,title,fields,data)}
function numFields(){return [{name:'team_name',label:'اسم الفريق',required:true},{name:'played',label:'لعب',type:'number'},{name:'wins',label:'فاز',type:'number'},{name:'draws',label:'تعادل',type:'number'},{name:'losses',label:'خسر',type:'number'},{name:'goals_for',label:'الأهداف له',type:'number'},{name:'goals_against',label:'الأهداف عليه',type:'number'},{name:'points',label:'النقاط',type:'number'}]}
$('#addStanding').onclick=()=>modal('standing','إضافة فريق للترتيب',numFields(),{played:0,wins:0,draws:0,losses:0,goals_for:0,goals_against:0,points:0});
window.editStanding=id=>{const x=standings.find(v=>v.id===id);if(x)modal('standing','تعديل بيانات الفريق',numFields(),x)};
window.delStanding=async id=>{if(!confirm('حذف الفريق من جدول الترتيب؟'))return;try{const r=await fetch('/api/standings?id='+id,{method:'DELETE',headers:headers()}),d=await r.json();if(!r.ok||!d.success)throw Error(d.message);await loadStandings()}catch(e){alert(e.message)}};
function anthemFields(){return [{name:'title',label:'اسم النشيد',required:true},{name:'description',label:'وصف مختصر'},{name:'audio_url',label:'رابط ملف الصوت (اختياري)',type:'url'}]}
function audioInput(){const h=document.createElement('div');h.className='field';h.innerHTML='<label>رفع ملف صوتي من الجهاز (MP3 / M4A / OGG / WAV / AAC)</label><input id="anthemFile" type="file" accept="audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/aac"><small>حتى 25 ميجابايت.</small>';$('#formFields').appendChild(h)}
$('#addAnthem').onclick=()=>{modal('anthem','إضافة نشيد',anthemFields());audioInput()};
window.editAnthem=id=>{const x=anthems.find(v=>v.id===id);if(x){modal('anthem','تعديل النشيد',anthemFields(),x);audioInput()}};
window.delAnthem=async id=>{if(!confirm('حذف النشيد؟'))return;try{const r=await fetch('/api/anthems?id='+id,{method:'DELETE',headers:headers()}),d=await r.json();if(!r.ok||!d.success)throw Error(d.message);await loadAnthems()}catch(e){alert(e.message)}};
$('#editHistory').onclick=()=>{const h=historyData||{id:1,title:'تاريخ نادي شعب حضرموت',founded_year:'1964',content:'',achievements:''};modal('history','تعديل تاريخ النادي',[{name:'title',label:'عنوان الصفحة',required:true},{name:'founded_year',label:'سنة التأسيس'},{name:'content',label:'نبذة تاريخية',type:'textarea'},{name:'achievements',label:'الإنجازات',type:'textarea'}],{...h,id:1})};
$('#addNotification').onclick=()=>modal('notification','نشر إشعار للجمهور',[{name:'title',label:'عنوان الإشعار',required:true},{name:'body',label:'نص الإشعار',type:'textarea',required:true}]);
window.delNotification=async id=>{if(!confirm('حذف الإشعار؟'))return;try{const r=await fetch('/api/notifications?id='+id,{method:'DELETE',headers:headers()}),d=await r.json();if(!r.ok||!d.success)throw Error(d.message);await loadNotifications()}catch(e){alert(e.message)}};
function adminEditor(item=null){modal('admin',item?'تعديل صلاحيات المشرف':'إضافة مشرف',[...(item?[]:[{name:'username',label:'اسم المستخدم (إنجليزي)',required:true}]),{name:'display_name',label:'اسم المشرف',required:true},{name:'password',label:item?'كلمة مرور جديدة (اختياري)':'كلمة المرور',type:'password',required:!item}],item||{});const h=document.createElement('div');h.className='field';h.innerHTML='<label>صلاحيات المشرف</label><div class="permission-grid">'+Object.entries(labels).map(([k,v])=>'<label class="permission-option"><input type="checkbox" name="adminPermission" value="'+k+'" '+(item?.permissions?.includes(k)?'checked':'')+'> '+v+'</label>').join('')+'</div>';$('#formFields').appendChild(h)}
$('#addAdmin').onclick=()=>adminEditor();window.editAdmin=id=>{const x=admins.find(v=>v.id===id);if(x)adminEditor(x)};
window.delAdmin=async id=>{if(!confirm('حذف حساب المشرف وإنهاء جلساته؟'))return;try{const r=await fetch('/api/admins?id='+id,{method:'DELETE',headers:headers()}),d=await r.json();if(!r.ok||!d.success)throw Error(d.message);await loadAdmins()}catch(e){alert(e.message)}};
$('#editForm').addEventListener('submit',async e=>{if(!['standing','anthem','history','notification','admin'].includes(kind))return;e.preventDefault();e.stopImmediatePropagation();const data=Object.fromEntries(new FormData(e.target).entries());try{let url='',method='POST',payload={...data};if(kind==='standing'){url='/api/standings'+(editing!==null?'?id='+editing:'');method=editing!==null?'PUT':'POST'}else if(kind==='anthem'){url='/api/anthems'+(editing!==null?'?id='+editing:'');method=editing!==null?'PUT':'POST';const old=anthems.find(x=>x.id===editing);payload.file_key=old?.file_key||'';const file=$('#anthemFile')?.files?.[0];if(file){const fd=new FormData();fd.append('images',file);fd.append('scope','anthems');const up=await fetch('/api/media',{method:'POST',headers:{Authorization:'Bearer '+token()},body:fd}),ud=await up.json();if(!up.ok||!ud.success||!ud.media?.[0])throw Error(ud.message||'تعذر رفع الصوت');payload.audio_url=ud.media[0].url;payload.file_key=ud.media[0].key}if(!payload.audio_url)throw Error('ارفع ملفاً صوتياً أو أدخل رابطاً مباشراً')}else if(kind==='history'){url='/api/history';method='PUT'}else if(kind==='notification'){url='/api/notifications';method='POST'}else if(kind==='admin'){url='/api/admins'+(editing!==null?'?id='+editing:'');method=editing!==null?'PUT':'POST';payload.permissions=$$('#formFields [name="adminPermission"]:checked').map(x=>x.value)}const r=await fetch(url,{method,headers:headers(),body:JSON.stringify(payload)}),d=await r.json();if(!r.ok||!d.success)throw Error(d.message||'تعذر الحفظ');closeModal();e.target.reset();if(kind==='standing')await loadStandings();if(kind==='anthem')await loadAnthems();if(kind==='history')await loadHistory();if(kind==='notification')await loadNotifications();if(kind==='admin')await loadAdmins()}catch(err){alert(err.message)}},true);

async function loadLiveStreamAdmin(){
 const status=$('#liveAdminStatus'),message=$('#liveAdminMessage');
 try{
  const r=await fetch('/api/live?refresh='+Date.now(),{cache:'no-store'}),d=await r.json();
  if(!r.ok||!d.success)throw Error(d.message||'تعذر تحميل إعدادات البث');
  const v=d.stream||{};
  $('#liveTitle').value=v.title||'';$('#liveUrl').value=v.stream_url||'';$('#liveType').value=v.stream_type||'youtube';$('#liveEnabled').checked=!!Number(v.enabled);
  if(status){status.textContent=Number(v.enabled)?'البث مفعّل':'البث متوقف';status.style.background=Number(v.enabled)?'#e9f8ef':'#f1f1f4';status.style.color=Number(v.enabled)?'#197344':'#666'}
  if(message)message.textContent=Number(v.enabled)?'البث منشور حالياً ويظهر للزوار.':'البث متوقف ولن يظهر مشغل للزوار.';
 }catch(e){if(status)status.textContent='تعذر تحميل الحالة';if(message)message.textContent=e.message}
}
async function saveLiveStreamAdmin(forceOff=false){
 const button=$('#saveLiveStream'),message=$('#liveAdminMessage');
 const payload={title:$('#liveTitle').value.trim(),stream_url:$('#liveUrl').value.trim(),stream_type:$('#liveType').value,enabled:forceOff?false:$('#liveEnabled').checked};
 try{
  button.disabled=true;button.textContent='جارٍ الحفظ...';
  const r=await fetch('/api/live',{method:'PUT',headers:headers(),body:JSON.stringify(payload)}),d=await r.json();
  if(!r.ok||!d.success)throw Error(d.message||'تعذر حفظ إعدادات البث');
  $('#liveEnabled').checked=!!Number(d.stream.enabled);
  const status=$('#liveAdminStatus');if(status){status.textContent=Number(d.stream.enabled)?'البث مفعّل':'البث متوقف';status.style.background=Number(d.stream.enabled)?'#e9f8ef':'#f1f1f4';status.style.color=Number(d.stream.enabled)?'#197344':'#666'}
  if(message)message.textContent=forceOff?'تم إيقاف البث.':'تم حفظ إعدادات البث بنجاح.';
 }catch(e){alert(e.message)}finally{button.disabled=false;button.textContent='حفظ إعدادات البث'}
}
$('#saveLiveStream')?.addEventListener('click',()=>saveLiveStreamAdmin(false));
$('#stopLiveStream')?.addEventListener('click',()=>{if(confirm('هل تريد إيقاف البث المباشر عن جميع المستخدمين؟'))saveLiveStreamAdmin(true)});
window.loadLiveStreamAdmin=loadLiveStreamAdmin;

window.loadStandings();window.loadAnthems();window.loadHistory();window.loadNotifications();window.loadAdmins();
})();
