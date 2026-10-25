const PAY_KEY = APP_CONFIG.storage.paidKey;
const API_URL = APP_CONFIG.apiUrl;

// 明確抓 DOM，避免依賴瀏覽器把 id 自動變成全域變數
const bankSel = document.getElementById('bankSel');
const cardField = document.getElementById('cardField');
const cardSel = document.getElementById('cardSel');
const dateInp = document.getElementById('dateInp');
const statusSel = document.getElementById('statusSel');
const cycleTitle = document.getElementById('cycleTitle');
const cycleRange = document.getElementById('cycleRange');
const itemInp = document.getElementById('itemInp');
const twdInp = document.getElementById('twdInp');
const foreignLine = document.getElementById('foreignLine');
const foreignToggle = document.getElementById('foreignToggle');
const foreignFields = document.getElementById('foreignFields');
const currencySel = document.getElementById('currencySel');
const foreignInp = document.getElementById('foreignInp');
const noteInp = document.getElementById('noteInp');
const saveBtn = document.getElementById('saveBtn');
const reminders = document.getElementById('reminders');
const nextInfo = document.getElementById('nextInfo');
const countVal = document.getElementById('countVal');
const totalVal = document.getElementById('totalVal');
const monthTabs = document.getElementById('monthTabs');
const searchInp = document.getElementById('searchInp');
const recordList = document.getElementById('recordList');
const pendingList = document.getElementById('pendingList');
const topBtn = document.getElementById('topBtn');
const editModal = document.getElementById('editModal');
const closeEdit = document.getElementById('closeEdit');
const editId = document.getElementById('editId');
const editBank = document.getElementById('editBank');
const editCard = document.getElementById('editCard');
const editCardField = document.getElementById('editCardField');
function ccUpdateEditCardVisibility(){editCardField.classList.toggle('hidden',editBank.value!=='中信');}
editBank.addEventListener('change',ccUpdateEditCardVisibility);
const editDate = document.getElementById('editDate');
const editStatus = document.getElementById('editStatus');
const editItem = document.getElementById('editItem');
const editTwd = document.getElementById('editTwd');
const editCurrency = document.getElementById('editCurrency');
const editForeign = document.getElementById('editForeign');
const editNote = document.getElementById('editNote');
const modalDelete = document.getElementById('modalDelete');
const modalSave = document.getElementById('modalSave');

let records = [];
let paid = JSON.parse(localStorage.getItem(PAY_KEY) || '{}');
let currentMonth = '';
let bankFilter = '全部';

function persistPaid(){ localStorage.setItem(PAY_KEY, JSON.stringify(paid)); }
function esc(s){ return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function pad(n){ return String(n).padStart(2, '0'); }
function ccCurrencySymbol(currency){return {TWD:'NT$',KRW:'₩',JPY:'¥',USD:'US$',EUR:'€',CNY:'¥'}[String(currency||'').toUpperCase()]||String(currency||'');}
function ccForeignDisplay(currency,amount){return ccCurrencySymbol(currency)+Number(amount).toLocaleString('en-US',{maximumFractionDigits:2});}
function fmtMoney(n){ return n === null || n === '' || n === undefined ? '待補' : 'NT$' + Number(n).toLocaleString(); }

function ccMoneyRaw(value){return String(value??'').replace(/,/g,'').trim();}
function ccMoneyNumber(value){return Number(ccMoneyRaw(value));}
function ccMoneyValid(value){const raw=ccMoneyRaw(value);return /^(?:[0-9]+)(?:[.][0-9]*)?$/.test(raw)&&Number.isFinite(Number(raw))&&Number(raw)>0;}
function ccMoneyPretty(value){
 const raw=ccMoneyRaw(value);
 if(!raw)return '';
 const parts=raw.match(/^([0-9]+)([.][0-9]*)?$/);
 if(!parts)return String(value);
 return Number(parts[1]).toLocaleString('en-US',{maximumFractionDigits:0})+(parts[2]||'');
}
function ccBindMoneyInput(el){
 if(!el)return;
 el.addEventListener('input',()=>{
   const before=el.value;
   const caret=el.selectionStart??before.length;
   const count=before.slice(0,caret).replace(/,/g,'').length;
   const after=ccMoneyPretty(before);
   if(before===after)return;
   el.value=after;
   let i=0,n=0;
   while(i<after.length&&n<count){if(after[i]!==',')n++;i++;}
   try{el.setSelectionRange(i,i);}catch(_){}
 });
 el.addEventListener('blur',()=>{el.value=ccMoneyPretty(el.value);});
}
function ccSetForeignSymbol(sel,prefixId){
 const prefix=document.getElementById(prefixId);
 if(prefix)prefix.textContent=sel.value?ccCurrencySymbol(sel.value):'—';
}
[twdInp,foreignInp,editTwd,editForeign].forEach(ccBindMoneyInput);
currencySel.addEventListener('change',()=>ccSetForeignSymbol(currencySel,'foreignSymbol'));
editCurrency.addEventListener('change',()=>ccSetForeignSymbol(editCurrency,'editForeignSymbol'));
ccSetForeignSymbol(currencySel,'foreignSymbol');
ccSetForeignSymbol(editCurrency,'editForeignSymbol');

function bankClass(b){ return b === '中信' ? 'ctbc' : b === '國泰' ? 'cathay' : b === '台新' ? 'taishin' : 'fubon'; }

function normalizeClientDate(value){
  if(!value) return '';
  const s = String(value).trim();
  let m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if(m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if(m) return `${m[1]}-${m[2]}-${m[3]}`;
  return s;
}

function monthKey(d){
  const s = normalizeClientDate(d);
  const m = s.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : '';
}

function getCycle(startDay, dateStr){
  const d = new Date(dateStr + 'T12:00:00');
  let y = d.getFullYear();
  let m = d.getMonth() + 1;
  if(d.getDate() < startDay){ m--; if(m === 0){ m = 12; y--; } }
  const s = new Date(y, m - 1, startDay, 12);
  let ey = y, em = m + 1;
  if(em === 13){ em = 1; ey++; }
  const e = new Date(ey, em - 1, startDay, 12);
  e.setDate(e.getDate() - 1);
  return { tab:`${String(y).slice(-2)}/${pad(m)}/${pad(startDay)}`, s, e };
}
function getBankCycle(bank, dateStr){
  if(bank === '台新' && dateStr >= '2026-10-06' && dateStr <= '2026-10-20'){
    return {tab:'26/10/06',s:new Date(2026,9,6,12),e:new Date(2026,9,20,12)};
  }
  if(bank === '富邦' && dateStr >= '2026-10-02' && dateStr <= '2026-10-22'){
    return {tab:'26/10/02',s:new Date(2026,9,2,12),e:new Date(2026,9,22,12)};
  }
  const cfg=APP_CONFIG.banks[bank];
  return getCycle(cfg.cycleStartDay,dateStr);
}
function fmtDate(d){ return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())}`; }

function updateCycle(){
  const bank = bankSel.value;
  const date = dateInp.value;
  const cfg = APP_CONFIG.banks[bank];
  cardField.classList.toggle('hidden', bank !== '中信');
  if(cfg && cfg.cycleStartDay){
    const c = getBankCycle(bank, date);
    cycleTitle.textContent = `${bank}｜${c.tab}`;
    cycleRange.textContent = `${fmtDate(c.s)} ～ ${fmtDate(c.e)}`;
  }else{
    cycleTitle.textContent = `${bank}｜帳期規則待確認`;
    cycleRange.textContent = '等下期帳單確認後再補上';
  }
}

function setSyncInfo(text, isError = false){
  let el = document.getElementById('syncInfo');
  if(!el){
    el = document.createElement('div');
    el.id = 'syncInfo';
    el.style.cssText = 'font-size:12px;margin:0 0 10px;padding:10px 12px;border-radius:12px;background:#eef8ff;color:#49718a;border:1px solid #cfe8f5;';
    const summary = document.querySelector('#recordsPage .summary');
    summary.parentNode.insertBefore(el, summary);
  }
  el.textContent = text;
  if(isError){ el.style.background = '#fff2f2'; el.style.color = '#a34f4f'; el.style.borderColor = '#efcccc'; }
}

async function loadRecords(){
  recordList.innerHTML = '<div class="empty">正在讀取 Google Sheet 資料…</div>';
  pendingList.innerHTML = '<div class="empty">正在讀取 Google Sheet 資料…</div>';
  setSyncInfo('正在連接 Google Sheet…');

  try{
    const year = new Date().getFullYear();
    const response = await fetch(`${API_URL}?action=records&year=${year}&_=${Date.now()}`, { cache: 'no-store' });
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if(!data.ok) throw new Error(data.error || 'GAS 回傳失敗');

    records = (Array.isArray(data.records) ? data.records : []).map((r, index) => ({
      id: index + 1,
      bank: r.bank || '',
      card: r.card || '',
      date: normalizeClientDate(r.date || ''),
      item: r.item || '',
      twd: r.twd === '' || r.twd === undefined ? null : r.twd,
      currency: r.foreignCurrency || '',
      foreign: r.foreignAmount === '' || r.foreignAmount === undefined ? null : r.foreignAmount,
      status: r.status || '',
      note: r.note || '',
      source: r.source || null
    }));

    const validDates = records.filter(r => monthKey(r.date)).length;
    setSyncInfo(`已連接 Google Sheet：抓到 ${records.length} 筆，其中 ${validDates} 筆日期可辨識`);
    buildMonthTabs();
    renderRecords();
    renderPending();
  }catch(err){
    console.error('loadRecords error:', err);
    setSyncInfo(`讀取失敗：${err.message}`, true);
    const message = `<div class="empty">目前無法讀取 Google Sheet。<br><small>${esc(err.message)}</small></div>`;
    recordList.innerHTML = message;
    pendingList.innerHTML = message;
  }
}

async function postToApi(payload){
  const response = await fetch(API_URL, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify(payload) });
  if(!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if(!data.ok) throw new Error(data.error || 'GAS 寫入失敗');
  return data;
}

bankSel.addEventListener('change', updateCycle);
dateInp.addEventListener('change', updateCycle);
foreignLine.addEventListener('click', () => {
  foreignToggle.classList.toggle('on');
  foreignFields.classList.toggle('hidden', !foreignToggle.classList.contains('on'));
});
saveBtn.addEventListener('click', async () => {
  const isForeign = foreignToggle.classList.contains('on');
  const item = itemInp.value.trim();
  const twdText = ccMoneyRaw(twdInp.value);
  const foreignText = isForeign ? ccMoneyRaw(foreignInp.value) : '';
  if(!item){ alert('請先填寫項目'); itemInp.focus(); return; }
  if(!dateInp.value){ alert('請選擇交易日期'); return; }
  if(!twdText || !Number.isFinite(Number(twdText)) || Number(twdText)<=0){alert('台幣金額為必填，請輸入大於 0 的金額');twdInp.focus();return;}
  if(isForeign && (!foreignText || !Number.isFinite(Number(foreignText)) || Number(foreignText)<=0)){alert('外幣消費請輸入有效的外幣金額');foreignInp.focus();return;}
  if((twdText && Number(twdText) < 0) || (foreignText && Number(foreignText) < 0)){
    alert('請輸入正數；退刷會由系統自動扣除'); return;
  }
  const transactionType = document.getElementById('transactionTypeSel')?.value || 'purchase';
  const payload = {
    action:'createRecord',
    record:{
      bank:bankSel.value,
      card:bankSel.value === '中信' ? cardSel.value : '',
      date:dateInp.value,
      status:statusSel.value,
      item,
      twd:twdText ? Number(twdText) : null,
      foreignCurrency:isForeign ? currencySel.value : '',
      foreignAmount:foreignText ? Number(foreignText) : null,
      note:noteInp.value.trim(),
      transactionType
    }
  };
  if(typeof ccQueueCreate !== 'function'){
    alert('同步模組尚未載入，請重新整理後再試。'); return;
  }
  try{
    ccQueueCreate(payload.record);
    itemInp.value = '';
    twdInp.value = '';
    foreignInp.value = '';
    noteInp.value = '';
    if(typeof updateTransactionTypeUi === 'function') updateTransactionTypeUi();
  }catch(err){
    alert('無法儲存在此裝置：'+err.message+'。請保留輸入內容，不要關閉頁面。');
  }
});

document.querySelectorAll('.nav button').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.nav button').forEach(x => x.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.getElementById(btn.dataset.page).classList.add('active');
  if(btn.dataset.page === 'recordsPage'){ renderReminders(); renderRecords(); }
  if(btn.dataset.page === 'pendingPage') renderPending();
  window.scrollTo({top:0, behavior:'smooth'});
}));

document.querySelectorAll('#bankTabs .chip').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('#bankTabs .chip').forEach(x => x.classList.remove('active'));
  btn.classList.add('active'); bankFilter = btn.dataset.bank; renderRecords();
}));
searchInp.addEventListener('input', renderRecords);

function buildMonthTabs(){
  const queuedDates=typeof ccQueueRead==='function'?ccQueueRead().map(x=>monthKey(x.record?.date)).filter(Boolean):[];
  const months = [...new Set([...records.map(r => monthKey(r.date)).filter(Boolean),...queuedDates])].sort().reverse();
  if(!currentMonth || !months.includes(currentMonth)) currentMonth = months[0] || '';
  monthTabs.innerHTML = months.map(m => `<button class="chip ${m===currentMonth?'active':''}" data-m="${m}">${Number(m.slice(5))}月</button>`).join('');
  monthTabs.querySelectorAll('.chip').forEach(btn => btn.addEventListener('click', () => { currentMonth = btn.dataset.m; buildMonthTabs(); renderRecords(); }));
}

// 日期由新到舊；無效日期排最後，不改動原始 Sheet 或紀錄 ID。
function ccNewestFirst(a,b){
  const x=normalizeClientDate(a?.date||'');
  const y=normalizeClientDate(b?.date||'');
  const valid=/^\d{4}-\d{2}-\d{2}$/;
  return (valid.test(y)?y:'').localeCompare(valid.test(x)?x:'');
}

function renderRecords(){
  const q=searchInp.value.trim().toLowerCase();
  let list=records.filter(r=>monthKey(r.date)===currentMonth&&(bankFilter==='全部'||r.bank===bankFilter));
  if(q)list=list.filter(r=>(`${r.item} ${r.note} ${r.card}`).toLowerCase().includes(q));
  list.sort(ccNewestFirst);
  let pending=[];
  try{
    pending=typeof ccQueueRead==='function'?ccQueueRead().filter(x=>{
      const r=x.record||{};
      return monthKey(r.date)===currentMonth&&(bankFilter==='全部'||r.bank===bankFilter)&&(!q||(`${r.item} ${r.note} ${r.card}`).toLowerCase().includes(q));
    }):[];
    pending.sort((a,b)=>ccNewestFirst(a.record,b.record));
  }catch(err){console.warn('待同步紀錄讀取失敗',err);}
  countVal.textContent=list.length+pending.length;
  const total=list.reduce((s,r)=>s+(Number(r.twd)||0),0)+pending.reduce((s,x)=>s+(Number(x.record?.twd)||0)*(x.record?.transactionType==='refund'?-1:1),0);
  totalVal.textContent='NT$'+total.toLocaleString()+(pending.length?'（含待同步）':'');
  if(!list.length&&!pending.length){recordList.innerHTML='<div class="empty">這個條件下沒有紀錄</div>';return;}
  const waitingHtml=pending.map(x=>{
    const r=x.record||{};
    const status=x.state==='uncertain'?'同步結果未確認':x.state==='sending'?'同步中':'待同步';
    return `<div class="record ${bankClass(r.bank)}"><div class="rtop"><div><div class="date">${esc(r.date)}</div><div class="item">${esc(r.item)}</div></div><div class="bank">${esc(r.bank)}</div></div><div class="money">${fmtMoney((Number(r.twd)||0)*(r.transactionType==='refund'?-1:1))}</div>${r.foreignCurrency&&r.foreignAmount!==null&&r.foreignAmount!==undefined&&r.foreignAmount!==""&&Math.abs(Number(r.foreignAmount))>0?`<div class="meta">外幣：${esc(r.foreignCurrency||"未指定")}｜外幣金額：${esc(ccForeignDisplay(r.foreignCurrency,r.foreignAmount))}</div>`:""}${r.note?`<div class="meta">備註：${esc(r.note)}</div>`:""}<div class="meta">交易類型：${r.transactionType==="refund"?"退刷":"消費"}</div><div class="rfoot"><span class="status">${status}・暫存於本機</span></div></div>`;
  }).join('');
  const savedHtml=list.map(r=>`
    <div class="record ${bankClass(r.bank)}">
      <div class="rtop"><div><div class="date">${esc(r.date)}</div><div class="item">${esc(r.item)}</div></div><div class="bank">${esc(r.bank)}${r.card?'・'+esc(r.card):''}</div></div>
      <div class="money">${fmtMoney(r.twd)}</div>
      ${r.foreign!==null&&r.foreign!==undefined&&r.foreign!=='' ? `<div class="meta">外幣：${esc(r.currency||'未指定')}</div><div class="meta">外幣金額：${esc(ccForeignDisplay(r.currency,r.foreign))}</div>` : ''}
      ${r.note ? `<div class="meta">備註：${esc(r.note)}</div>` : ''}
      <div class="rfoot"><span class="status">${esc(r.status||'刷')}</span><div class="actions"><button class="mini edit" onclick="openEdit(${r.id})">修改</button><button class="mini del" onclick="deleteRec(${r.id})">刪除</button></div></div>
    </div>`).join('');
  recordList.innerHTML=waitingHtml+savedHtml;
}

function renderPending(){
  const list = records.filter(r => Number(r.foreign) > 0 && !(Number(r.twd) > 0)).sort(ccNewestFirst);
  if(!list.length){ pendingList.innerHTML='<div class="empty">目前沒有待補台幣金額</div>'; return; }
  pendingList.innerHTML = list.map(r => `<div class="record ${bankClass(r.bank)}"><div class="date">${esc(r.date)}</div><div class="item">${esc(r.item)}</div><div class="money">${esc(r.currency)} ${Number(r.foreign).toLocaleString()}</div><div class="meta">${esc(r.bank)}・待補台幣</div><div class="rfoot"><span class="status">待補</span><button class="mini edit" onclick="openEdit(${r.id})">補金額</button></div></div>`).join('');
}

function openEdit(id){
  const r=records.find(x=>x.id===id); if(!r) return;
  editId.value=r.id; editBank.value=r.bank; if(r.bank==='中信' && r.card && !Array.from(editCard.options).some(o=>o.value===r.card)){const option=new Option(r.card,r.card);editCard.add(option);} editCard.value=r.bank==='中信'?(r.card||APP_CONFIG.banks['中信'].cards[0]):APP_CONFIG.banks['中信'].cards[0]; ccUpdateEditCardVisibility(); editDate.value=r.date; editStatus.value=r.status||'刷'; editItem.value=r.item; editTwd.value=r.twd==null?'':ccMoneyPretty(r.twd); editCurrency.value=Number(r.foreign)>0?(r.currency||''):''; editForeign.value=Number(r.foreign)>0?ccMoneyPretty(r.foreign):''; ccSetForeignSymbol(editCurrency,'editForeignSymbol'); editNote.value=r.note||''; editModal.classList.add('show');
}
closeEdit.addEventListener('click',()=>editModal.classList.remove('show'));
editModal.addEventListener('click',e=>{ if(e.target===editModal) editModal.classList.remove('show'); });

modalSave.addEventListener('click', async()=>{
  const id=Number(editId.value), r=records.find(x=>x.id===id); if(!r||!r.source) return;
  if(!ccMoneyValid(editTwd.value)){alert('台幣金額為必填，請輸入大於 0 的金額');editTwd.focus();return;}
  const editForeignText=ccMoneyRaw(editForeign.value);
  if(Boolean(editCurrency.value)!==Boolean(editForeignText)){alert('幣別與外幣金額必須同時填寫，或同時留空');return;}
  if(editForeignText && (!Number.isFinite(Number(editForeignText)) || Number(editForeignText)<=0)){alert('請輸入大於 0 的外幣金額');editForeign.focus();return;}
  const updated={...r,bank:editBank.value,card:editBank.value==='中信'?editCard.value:'',date:editDate.value,status:editStatus.value,item:editItem.value.trim(),twd:ccMoneyValid(editTwd.value)?ccMoneyNumber(editTwd.value):null,currency:editCurrency.value,foreign:editForeignText?Number(editForeignText):null,note:editNote.value.trim(),foreignAmount:editForeignText?Number(editForeignText):null};
  if(!r.source?.rowHash){alert('來源資訊尚未更新，請先從 Sheet 更新資料再修改。');return;}
  try{ modalSave.disabled=true; modalSave.textContent='儲存中…'; const response=await postToApi({action:'updateRecord',record:updated}); if(!response.record?.source?.rowHash)throw Error('GAS 未回傳來源驗證資料'); const fresh=mapApiRecords([response.record])[0]; if(typeof ccMarkLocalMutation==='function')ccMarkLocalMutation(); records=records.map(x=>x.id===id?{...fresh,id}:x); if(typeof ccConfirmedWrites!=='undefined' && typeof ccSourceKey==='function'){const key=ccSourceKey(fresh.source);if(ccConfirmedWrites.has(key))ccConfirmedWrites.set(key,{...fresh,id});} saveRecordsCache(Number(window.ccSelectedDataYear||new Date().getFullYear()),''); editModal.classList.remove('show'); renderCurrentRecords('修改成功，已同步 Google Sheet'); alert('修改成功！'); }
  catch(err){ alert('修改失敗：'+err.message); }
  finally{ modalSave.disabled=false; modalSave.textContent='儲存修改'; }
});

async function deleteRec(id){
  const r=records.find(x=>x.id===id);
  if(!r)return;
  if(!r.source?.rowHash){
    alert('這筆紀錄缺少最新的來源驗證資訊，系統會先從 Sheet 更新資料；更新後請再按一次刪除。');
    await loadRecords({force:true});
    return;
  }
  if(!confirm('確定刪除「'+r.item+'」？這會清空 Google Sheet 對應交易欄位，保留結算列及格式。'))return;
  try{
    await postToApi({action:'deleteRecord',source:r.source});
  }catch(err){
    alert('刪除未完成：'+err.message+'。如果資料已在 Sheet 修改，請先按「從 Sheet 更新資料」後再操作。');
    return;
  }
  // 只有後端確認刪除成功才移除本機紀錄。
  const sourceKey=x=>[x?.spreadsheetId,x?.sheetName,x?.row].join('|');
  if(typeof ccMarkLocalMutation==='function')ccMarkLocalMutation();
  records=records.filter(x=>sourceKey(x.source)!==sourceKey(r.source));
  if(typeof ccConfirmedWrites!=='undefined' && typeof ccSourceKey==='function')ccConfirmedWrites.delete(ccSourceKey(r.source));
  if(typeof saveRecordsCache==='function')saveRecordsCache(Number(window.ccSelectedDataYear||new Date().getFullYear()),'');
  if(typeof renderCurrentRecords==='function')renderCurrentRecords('刪除成功，已同步 Google Sheet');
  else{renderRecords();renderPending();}
  alert('刪除成功！已清除 Google Sheet 中這筆交易。');
  // 刪除已由 GAS 確認，無須重新讀取全年紀錄。
}
modalDelete.addEventListener('click',()=>{ const id=Number(editId.value); editModal.classList.remove('show'); deleteRec(id); });

// 繳費提醒先以銀行核對金額為準；Sheet 刷／繳只判斷狀態與提供對帳差額。
let ccReminderRequest=0;
async function renderReminders(){
  const request=++ccReminderRequest;
  const now=new Date(), y=now.getFullYear(), m=now.getMonth()+1, d=now.getDate();
  reminders.innerHTML='';
  nextInfo.textContent='正在核對 Google Sheet 繳費帳期…';
  if(!navigator.onLine){nextInfo.textContent='離線中，暫不顯示未經確認的繳費提醒。';return;}
  try{
    // 以最新 Google Sheet 的未繳交易判斷提醒；本機 paid 只當作舊版歷史資訊，不阻擋其他裝置的提醒。
    const candidates=Object.entries(APP_CONFIG.banks).filter(([bank,cfg])=>cfg.paymentDueDay && d>=cfg.paymentDueDay-1 && (!cfg.firstPaymentDueDate || dateToInput(now)>=cfg.firstPaymentDueDate));
    if(!candidates.length){nextInfo.textContent='目前沒有即將到期的繳費提醒。';return;}
    const cycles=candidates.map(([bank,cfg])=>({bank,cfg,cycle:ccPayableCycle(bank,y,m)}));
    // 提醒只需要當期分頁；不要為了少數銀行讀取整年度數百筆資料。
    // 全年資料查詢若超時，會造成交易已同步但上方提醒顯示無法核對。
    const results=await Promise.all(cycles.map(async ({bank,cycle})=>{
      let lastError;
      for(let attempt=0;attempt<2;attempt++){
        try{
          const url=APP_CONFIG.apiUrl+'?action=cycleRecords&bank='+encodeURIComponent(bank)+'&tab='+encodeURIComponent(cycle.tab)+'&_='+Date.now();
          const response=await fetch(url,{cache:'no-store'});
          if(!response.ok)throw Error('HTTP '+response.status);
          const data=await response.json();
          if(!data.ok||!Array.isArray(data.records))throw Error(data.error||'帳期資料格式不正確');
          return mapApiRecords(data.records);
        }catch(err){lastError=err;}
      }
      throw Error(bank+' '+cycle.tab+' 帳期查詢失敗：'+lastError.message);
    }));
    if(request!==ccReminderRequest)return;
    const all=ccUniqueSourceRecords(results.flat());
    const cards=[];
    for(const {bank,cfg,cycle} of cycles){
      // 銀行帳單應繳額與 Sheet 交易狀態是兩種資料；延後請款可造成正常差額。
      const month=y+'-'+pad(m);
      const cloudReady=typeof ccStatementCloudReady!=='undefined' && ccStatementCloudReady;
      const statement=cloudReady && typeof ccStatementArchive!=='undefined'?ccStatementArchive?.[month]?.[bank]:undefined;
      const confirmed=typeof statement==='number' && Number.isFinite(statement);
      // 銀行正式帳單已核對為 0 元時，不要顯示繳費提醒；Sheet 明細可能含延後請款。
      if(confirmed && !(statement>0))continue;
      const paidRecord=cloudReady && typeof ccStatementPayments!=='undefined'?ccStatementPayments?.[month]?.[bank]:undefined;
      const bankPaid=paidRecord?.paid===true && confirmed && Number(paidRecord.amount)===statement;
      const selected=all.filter(r=>r.bank===bank && r.source?.sheetName===cycle.tab);
      const unpaid=selected.filter(r=>(r.status||'刷')==='刷');
      // 已繳銀行帳單不代表 Sheet 狀態已同步；只在仍有「刷」時顯示上方待整理提醒。
      if(bankPaid && !unpaid.length)continue;
      const validUnpaid=unpaid.every(r=>r.twd!==null && r.twd!=='' && Number.isFinite(Number(r.twd)));
      const detailAmount=validUnpaid?unpaid.reduce((sum,r)=>sum+(r.transactionType==='refund'?-Math.abs(Number(r.twd)):Number(r.twd)),0):null;
      if(!confirmed && (!validUnpaid || !unpaid.length || !(detailAmount>0)))continue;
      const due=cfg.paymentDueDay;
      const label=bankPaid?'已繳費・待同步':d===due-1?'明天要繳費':d===due?'今天到期':`已逾期 ${d-due} 天`;
      const mainAmount=confirmed?`銀行已核對應繳 NT$${statement.toLocaleString('zh-TW')}`:`Sheet 交易估算 NT$${detailAmount.toLocaleString('zh-TW')}（尚未核對銀行帳單）`;
      const difference=confirmed && detailAmount!==null && unpaid.length && Math.round((detailAmount-statement)*100)!==0;
      const diffLine=difference?`<div class="billing-note">Sheet 仍標「刷」的交易加總 NT$${detailAmount.toLocaleString('zh-TW')}，與銀行帳單差 NT$${Math.abs(detailAmount-statement).toLocaleString('zh-TW')}。可能是延後請款；請依銀行帳單確認，本功能不會修改交易狀態。</div>`:'';
      const canConfirm=confirmed && cloudReady && ccStatementBackendVersion==='2.7.7';
      const buttonLabel=!cloudReady?'銀行帳單雲端資料尚未載入':!confirmed?'請先登記銀行正式帳單金額':!canConfirm?'需先更新 GAS v2.7.7':'確認銀行帳單已繳';
      cards.push(`<div class="remind ${!bankPaid && d>=due?'due':''}"><div class="remTop"><div><div class="remTitle">${esc(bank)}${bankPaid?'已繳帳單・待同步交易進度':'信用卡繳費提醒'}</div><div class="remMeta">結帳日：${cycle.e.getMonth()+1}/${cycle.e.getDate()}｜繳費期限：${m}/${due}｜${esc(mainAmount)}</div></div><div class="tag">${label}</div></div>${bankPaid?'<div class="billing-note">銀行繳費已確認，無需再次付款；按下方按鈕只會核對並同步本期 Sheet 的「刷 → 繳」，若有延後請款會先確認搬移。</div>':diffLine}<button class="donePay" onclick="markPaid('${bank}',${y},${m})" ${canConfirm?'':'disabled'}>${canConfirm?(bankPaid?'完成本期交易同步':'完成本期繳費'):buttonLabel}</button></div>`);
    }
    reminders.innerHTML=cards.join('');
    nextInfo.textContent=cards.length?'已依銀行核對帳單顯示應繳金額；Sheet 交易如有延後請款會另列差額，兩者不混算。':'目前沒有經 Google Sheet 確認的應繳款項。';
  }catch(err){
    if(request!==ccReminderRequest)return;
    reminders.innerHTML='';
    nextInfo.textContent='繳費提醒暫時無法核對：'+String(err.message||err)+'。交易紀錄同步不受影響；為避免誤報逾期，暫停提醒。';
    console.warn('繳費提醒核對失敗',err);
  }
}
// 返回網頁時重新核對提醒，避免其他裝置已完成繳費卻還顯示舊卡片。
let ccLastReminderFocusCheck=0;
function ccRefreshRemindersOnReturn(){
  if(document.visibilityState==='hidden' || !navigator.onLine)return;
  if(typeof ccCyclePaymentBusy!=='undefined' && ccCyclePaymentBusy)return;
  if(Date.now()-ccLastReminderFocusCheck<30000)return;
  ccLastReminderFocusCheck=Date.now();
  void renderReminders();
}
window.addEventListener('focus',ccRefreshRemindersOnReturn);
window.addEventListener('visibilitychange',ccRefreshRemindersOnReturn);
async function markPaid(bank,y,m){
  if(typeof ccMarkCyclePaid!=='function'){alert('帳期繳費模組尚未載入，請重新整理網頁。');return;}
  await ccMarkCyclePaid(bank,y,m);
}
window.addEventListener('scroll',()=>topBtn.classList.toggle('show',window.scrollY>420));
topBtn.addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));

updateCycle();
// 等所有同步載入的腳本（包含 cycle-payment.js）執行完，再初始化繳費提醒。
// 否則 app.js 先執行會呼叫尚未定義的 ccPayableCycle。
window.addEventListener('DOMContentLoaded',()=>{
  if(typeof ccPayableCycle==='function')void renderReminders();
  else nextInfo.textContent='繳費提醒模組尚未載入，請重新整理網頁。';
},{once:true});
// 初次資料載入由 data-sync.js 統一處理，避免快取尚未初始化就先抓整份 Sheet。
