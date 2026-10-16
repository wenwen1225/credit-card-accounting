const LS_KEY = APP_CONFIG.storage.recordsKey;
const PAY_KEY = APP_CONFIG.storage.paidKey;
const initial = APP_CONFIG.seedRecords;

let records = JSON.parse(localStorage.getItem(LS_KEY) || 'null') || initial;
let paid = JSON.parse(localStorage.getItem(PAY_KEY) || '{}');
let currentMonth = '';
let bankFilter = '全部';

function persist(){
  localStorage.setItem(LS_KEY, JSON.stringify(records));
}

function persistPaid(){
  localStorage.setItem(PAY_KEY, JSON.stringify(paid));
}

function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, m => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[m]));
}

function pad(n){
  return String(n).padStart(2, '0');
}

function fmtMoney(n){
  return n === null || n === '' ? '待補' : 'NT$' + Number(n).toLocaleString();
}

function monthKey(d){
  return d ? d.slice(0, 7) : '';
}

function bankClass(b){
  return b === '中信' ? 'ctbc' : b === '國泰' ? 'cathay' : b === '台新' ? 'taishin' : 'fubon';
}

function getCycle(startDay, dateStr){
  const d = new Date(dateStr + 'T12:00:00');
  let y = d.getFullYear();
  let m = d.getMonth() + 1;

  if(d.getDate() < startDay){
    m--;
    if(m === 0){
      m = 12;
      y--;
    }
  }

  const s = new Date(y, m - 1, startDay, 12);
  let ey = y;
  let em = m + 1;
  if(em === 13){
    em = 1;
    ey++;
  }

  const e = new Date(ey, em - 1, startDay, 12);
  e.setDate(e.getDate() - 1);

  return {
    tab:`${String(y).slice(-2)}/${pad(m)}/${pad(startDay)}`,
    s,
    e
  };
}

function fmtDate(d){
  return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())}`;
}

function updateCycle(){
  const bank = bankSel.value;
  const date = dateInp.value;
  const cfg = APP_CONFIG.banks[bank];

  cardField.classList.toggle('hidden', bank !== '中信');

  if(cfg && cfg.cycleStartDay){
    const c = getCycle(cfg.cycleStartDay, date);
    cycleTitle.textContent = `${bank}｜${c.tab}`;
    cycleRange.textContent = `${fmtDate(c.s)} ～ ${fmtDate(c.e)}`;
  }else{
    cycleTitle.textContent = `${bank}｜帳期規則待確認`;
    cycleRange.textContent = '等下期帳單確認後再補上';
  }
}

bankSel.onchange = updateCycle;
dateInp.onchange = updateCycle;

foreignLine.onclick = () => {
  foreignToggle.classList.toggle('on');
  foreignFields.classList.toggle('hidden', !foreignToggle.classList.contains('on'));
};

saveBtn.onclick = () => {
  if(!itemInp.value.trim()){
    alert('請先輸入項目');
    return;
  }

  const isForeign = foreignToggle.classList.contains('on');

  records.unshift({
    id: Date.now(),
    bank: bankSel.value,
    card: bankSel.value === '中信' ? cardSel.value : '',
    date: dateInp.value,
    item: itemInp.value.trim(),
    twd: twdInp.value ? Number(twdInp.value) : null,
    currency: isForeign ? currencySel.value : '',
    foreign: isForeign && foreignInp.value ? Number(foreignInp.value) : null,
    status: statusSel.value,
    note: noteInp.value.trim()
  });

  persist();
  itemInp.value = '';
  twdInp.value = '';
  foreignInp.value = '';
  noteInp.value = '';

  alert('已儲存到這個瀏覽器的 Demo 資料');
  buildMonthTabs();
  renderRecords();
  renderPending();
};

document.querySelectorAll('.nav button').forEach(btn => btn.onclick = () => {
  document.querySelectorAll('.nav button').forEach(x => x.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
  document.getElementById(btn.dataset.page).classList.add('active');

  if(btn.dataset.page === 'recordsPage'){
    renderReminders();
    renderRecords();
  }

  if(btn.dataset.page === 'pendingPage'){
    renderPending();
  }

  window.scrollTo({top:0, behavior:'smooth'});
});

document.querySelectorAll('#bankTabs .chip').forEach(btn => btn.onclick = () => {
  document.querySelectorAll('#bankTabs .chip').forEach(x => x.classList.remove('active'));
  btn.classList.add('active');
  bankFilter = btn.dataset.bank;
  renderRecords();
});

searchInp.oninput = renderRecords;

function buildMonthTabs(){
  const months = [...new Set(records.map(r => monthKey(r.date)).filter(Boolean))].sort().reverse();

  if(!currentMonth || !months.includes(currentMonth)){
    currentMonth = months[0] || '';
  }

  monthTabs.innerHTML = months.map(m =>
    `<button class="chip ${m === currentMonth ? 'active' : ''}" data-m="${m}">${Number(m.slice(5))}月</button>`
  ).join('');

  monthTabs.querySelectorAll('.chip').forEach(btn => btn.onclick = () => {
    currentMonth = btn.dataset.m;
    buildMonthTabs();
    renderRecords();
  });
}

function renderRecords(){
  const q = searchInp.value.trim().toLowerCase();

  let list = records.filter(r =>
    monthKey(r.date) === currentMonth &&
    (bankFilter === '全部' || r.bank === bankFilter)
  );

  if(q){
    list = list.filter(r => (r.item + ' ' + r.note + ' ' + r.card).toLowerCase().includes(q));
  }

  countVal.textContent = list.length;
  totalVal.textContent = 'NT$' + list.reduce((s, r) => s + (Number(r.twd) || 0), 0).toLocaleString();

  if(!list.length){
    recordList.innerHTML = '<div class="empty">這個條件下沒有紀錄</div>';
    return;
  }

  recordList.innerHTML = list.map(r => `
    <div class="record ${bankClass(r.bank)}">
      <div class="rtop">
        <div>
          <div class="date">${r.date}</div>
          <div class="item">${esc(r.item)}</div>
        </div>
        <div class="bank">${esc(r.bank)}${r.card ? '・' + esc(r.card) : ''}</div>
      </div>
      <div class="money">${fmtMoney(r.twd)}</div>
      ${r.foreign ? `<div class="meta">${r.currency} ${Number(r.foreign).toLocaleString()}</div>` : ''}
      ${r.note ? `<div class="meta">備註：${esc(r.note)}</div>` : ''}
      <div class="rfoot">
        <span class="status">${esc(r.status)}</span>
        <div class="actions">
          <button class="mini edit" onclick="openEdit(${r.id})">修改</button>
          <button class="mini del" onclick="deleteRec(${r.id})">刪除</button>
        </div>
      </div>
    </div>
  `).join('');
}

function renderPending(){
  const list = records.filter(r => r.foreign && !r.twd);

  if(!list.length){
    pendingList.innerHTML = '<div class="empty">目前沒有待補台幣金額</div>';
    return;
  }

  pendingList.innerHTML = list.map(r => `
    <div class="record ${bankClass(r.bank)}">
      <div class="date">${r.date}</div>
      <div class="item">${esc(r.item)}</div>
      <div class="money">${r.currency} ${Number(r.foreign).toLocaleString()}</div>
      <div class="meta">${r.bank}・待補台幣</div>
      <div class="rfoot">
        <span class="status">待補</span>
        <button class="mini edit" onclick="openEdit(${r.id})">補金額</button>
      </div>
    </div>
  `).join('');
}

function openEdit(id){
  const r = records.find(x => x.id === id);
  if(!r) return;

  editId.value = r.id;
  editBank.value = r.bank;
  editCard.value = r.card || '';
  editDate.value = r.date;
  editStatus.value = r.status;
  editItem.value = r.item;
  editTwd.value = r.twd ?? '';
  editCurrency.value = r.currency || '';
  editForeign.value = r.foreign ?? '';
  editNote.value = r.note || '';
  editModal.classList.add('show');
}

closeEdit.onclick = () => editModal.classList.remove('show');

editModal.onclick = e => {
  if(e.target === editModal){
    editModal.classList.remove('show');
  }
};

modalSave.onclick = () => {
  const id = Number(editId.value);
  const r = records.find(x => x.id === id);
  if(!r) return;

  r.bank = editBank.value;
  r.card = editBank.value === '中信' ? editCard.value.trim() : '';
  r.date = editDate.value;
  r.status = editStatus.value;
  r.item = editItem.value.trim();
  r.twd = editTwd.value ? Number(editTwd.value) : null;
  r.currency = editCurrency.value;
  r.foreign = editForeign.value ? Number(editForeign.value) : null;
  r.note = editNote.value.trim();

  persist();
  editModal.classList.remove('show');
  buildMonthTabs();
  renderRecords();
  renderPending();
};

function deleteRec(id){
  if(!confirm('確定刪除這筆紀錄？')) return;

  records = records.filter(r => r.id !== id);
  persist();
  buildMonthTabs();
  renderRecords();
  renderPending();
}

modalDelete.onclick = () => {
  const id = Number(editId.value);
  editModal.classList.remove('show');
  deleteRec(id);
};

function renderReminders(){
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  let cards = [];
  let future = [];

  Object.entries(APP_CONFIG.banks).forEach(([bank, cfg]) => {
    const due = cfg.paymentDueDay;
    if(!due) return;

    const key = `${bank}-${y}-${pad(m)}`;
    if(paid[key]) return;

    if(d >= due - 1){
      const label = d === due - 1 ? '明天要繳費' : d === due ? '今天到期' : `已逾期 ${d - due} 天`;

      cards.push(`
        <div class="remind ${d >= due ? 'due' : ''}">
          <div class="remTop">
            <div>
              <div class="remTitle">${bank}信用卡繳費提醒</div>
              <div class="remMeta">本月繳費期限：${m}/${due}</div>
            </div>
            <div class="tag">${label}</div>
          </div>
          <button class="donePay" onclick="markPaid('${bank}',${y},${m})">完成繳費</button>
        </div>
      `);
    }else{
      future.push(`${bank}：${m}/${due - 1} 開始提醒，${m}/${due} 到期`);
    }
  });

  reminders.innerHTML = cards.join('');
  nextInfo.innerHTML = future.length
    ? future.join('<br>')
    : (cards.length ? '台新、富邦繳費日待確認後再加入。' : '本月目前沒有待繳提醒');
}

function markPaid(bank, y, m){
  paid[`${bank}-${y}-${pad(m)}`] = true;
  persistPaid();
  renderReminders();
}

window.addEventListener('scroll', () => {
  topBtn.classList.toggle('show', window.scrollY > 420);
});

topBtn.onclick = () => window.scrollTo({top:0, behavior:'smooth'});

updateCycle();
buildMonthTabs();
renderReminders();
renderRecords();
renderPending();
