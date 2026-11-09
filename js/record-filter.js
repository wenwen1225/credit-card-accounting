// 紀錄頁篩選：交易類型 + 全部紀錄 / 待補金額

let recordStateFilter = 'all';
let transactionTypeFilter = 'all';
let recordCurrencyFilter = 'all';
const currencyTabs = document.getElementById('currencyTabs');
const recordStateTabs = document.getElementById('recordStateTabs');
const typeTabs = document.getElementById('typeTabs');
const pendingCountBadge = document.getElementById('pendingCountBadge');
const feeCountBadge = document.getElementById('feeCountBadge');
function isPendingFee(r){return isForeignRecord(r)&&ccFeeCanEdit(r)&&!(Number(r.overseasFee)>0);}
const clearFiltersBtn = document.getElementById('clearFiltersBtn');

recordStateTabs?.querySelectorAll('.chip').forEach(btn => {
  btn.addEventListener('click', () => {
    const next = recordStateFilter === btn.dataset.state ? 'all' : (btn.dataset.state || 'all');
    recordStateTabs.querySelectorAll('.chip').forEach(x => x.classList.toggle('active', x.dataset.state === next));
    recordStateFilter = next;
    renderRecords();
  });
});

typeTabs?.querySelectorAll('.chip').forEach(btn => {
  btn.addEventListener('click', () => {
    typeTabs.querySelectorAll('.chip').forEach(x => x.classList.remove('active'));
    btn.classList.add('active');
    transactionTypeFilter = btn.dataset.type || 'all';
    renderRecords();
  });
});

currencyTabs?.querySelectorAll('.chip').forEach(btn => {
  btn.addEventListener('click', () => {
    currencyTabs.querySelectorAll('.chip').forEach(x => x.classList.remove('active'));
    btn.classList.add('active');
    recordCurrencyFilter = btn.dataset.currency || 'all';
    renderRecords();
  });
});

function isForeignRecord(record){
  const currency = String(record.currency || '').trim().toUpperCase();
  const amount = Number(record.foreign);
  return currency !== 'TWD' && currency !== 'NT$' &&
    Number.isFinite(amount) && Math.abs(amount) > 0;
}

function matchesRecordCurrency(record){
  return recordCurrencyFilter === 'all' ||
    (recordCurrencyFilter === 'foreign' ? isForeignRecord(record) : !isForeignRecord(record));
}

clearFiltersBtn?.addEventListener('click', () => {
  bankFilter = '全部';
  recordCurrencyFilter = 'all';
  currencyTabs?.querySelectorAll('.chip').forEach(btn => btn.classList.toggle('active', btn.dataset.currency === 'all'));
  transactionTypeFilter = 'all';
  recordStateFilter = 'all';
  searchInp.value = '';

  document.querySelectorAll('#bankTabs .chip').forEach(btn => btn.classList.toggle('active', btn.dataset.bank === '全部'));
  typeTabs?.querySelectorAll('.chip').forEach(btn => btn.classList.toggle('active', btn.dataset.type === 'all'));
  recordStateTabs?.querySelectorAll('.chip').forEach(btn => btn.classList.remove('active'));
  renderRecords();
});

function isPendingAmount(record){
  return Number(record.foreign) !== 0 && !(Math.abs(Number(record.twd)) > 0);
}

function updatePendingCount(){
  if(!pendingCountBadge) return;
  let contextList = records.filter(r => monthKey(r.date) === currentMonth && (bankFilter === '全部' || r.bank === bankFilter));
  if(transactionTypeFilter !== 'all') contextList = contextList.filter(r => recordTransactionType(r) === transactionTypeFilter);
  contextList = contextList.filter(matchesRecordCurrency);
  const count = contextList.filter(isPendingAmount).length;
  pendingCountBadge.textContent = String(count);
  pendingCountBadge.classList.toggle('hidden', count === 0);
  const pendingTab=recordStateTabs?.querySelector('[data-state="pending"]');
  if(pendingTab)pendingTab.classList.toggle('hidden',count===0);
  const feeCount=contextList.filter(isPendingFee).length;
  if(feeCountBadge){feeCountBadge.textContent=String(feeCount);feeCountBadge.classList.toggle('hidden',feeCount===0);}
  if(count===0 && recordStateFilter==='pending'){
    recordStateFilter='all';
    recordStateTabs?.querySelectorAll('.chip').forEach(btn=>btn.classList.remove('active'));
  }
}

function bindRecordExpanders(){
  recordList.querySelectorAll('[data-record-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.recordToggle;
      const detail = recordList.querySelector(`[data-record-detail="${id}"]`);
      if(!detail) return;
      const opening = detail.classList.contains('hidden');
      detail.classList.toggle('hidden', !opening);
      btn.textContent = opening ? '收起' : '詳細';
    });
  });
}

renderRecords = function(){
  updatePendingCount();

  if(!records.length){
    countVal.textContent='0'; totalVal.textContent='NT$0';
    recordList.innerHTML='<div class="empty">目前沒有讀到紀錄</div>';
    if(typeof renderBillingOverview === 'function') renderBillingOverview();
    return;
  }

  const q = searchInp.value.trim().toLowerCase();
  // 紀錄頁一律以刷卡日期月份篩選；帳期僅決定海外手續費是否可補登。
  let list = records.filter(r => monthKey(r.date) === currentMonth && (bankFilter === '全部' || r.bank === bankFilter));
  if(transactionTypeFilter !== 'all') list = list.filter(r => recordTransactionType(r) === transactionTypeFilter);
  list = list.filter(matchesRecordCurrency);
  if(recordStateFilter === 'pending') list = list.filter(isPendingAmount);
  if(recordStateFilter === 'fee') list = list.filter(isPendingFee);
  if(q) list = list.filter(r => (`${r.item} ${r.note} ${r.card} ${recordTransactionType(r) === 'refund' ? '退刷 退款' : recordTransactionType(r)==='points_offset' ? '抵扣點數 點數抵扣' : '消費'}`).toLowerCase().includes(q));

  countVal.textContent = list.length;
  const total = list.reduce((sum, r) => sum + signedTwd(r), 0);
  totalVal.textContent = `${total < 0 ? '-' : ''}NT$${Math.abs(total).toLocaleString()}`;

  if(!list.length){
    const typeText = transactionTypeFilter === 'refund' ? '退刷' : transactionTypeFilter === 'purchase' ? '消費' : transactionTypeFilter==='points_offset' ? '抵扣點數' : '';
    const emptyText = recordStateFilter === 'fee' ? '這個刷卡月份沒有符合帳期的待補海外手續費消費' : recordStateFilter === 'pending' ? `這個月份目前沒有${typeText ? typeText + '且' : ''}待補金額` : `這個條件下沒有${typeText || ''}紀錄`;
    recordList.innerHTML=`<div class="empty">${emptyText}<br><small>目前月份：${esc(currentMonth || '無')}</small></div>`;
    if(typeof renderBillingOverview === 'function') renderBillingOverview();
    return;
  }

  recordList.innerHTML = list.map(r => {
    const isRefund = recordTransactionType(r) === 'refund';
    const isPoints = recordTransactionType(r) === 'points_offset';
    const isPending = isPendingAmount(r);
    const feeSyncing = typeof ccFeeEditIsPending==='function' && ccFeeEditIsPending(r.source);
    return `
      <div class="record ${bankClass(r.bank)} ${isRefund || isPoints ? 'refund-record' : ''}">
        <div class="rtop">
          <div><div class="date">${esc(r.date)}</div><div class="item">${isRefund ? '<span class="refund-badge">退刷</span>' : isPoints ? '<span class="refund-badge">抵扣點數</span>' : ''}${esc(r.item)}</div></div>
          <div class="bank">${esc(r.bank)}${r.bank==='中信' && r.card?'・'+esc(r.card):''}</div>
        </div>
        <div class="money ${isRefund || isPoints ? 'refund-money' : ''}">${transactionMoneyText(r)}</div>
        ${isForeignRecord(r) && Number.isFinite(Number(r.twd)) && Math.abs(Number(r.twd))>0 ? `<div class="meta cc-original-amount">原刷金額（未含手續費）：${isRefund?'-':''}NT$${Math.max(0,Math.abs(Number(r.twd))-Math.max(0,Number(r.overseasFee)||0)).toLocaleString('zh-TW')}</div>` : ''}
        ${r.currency && r.foreign!==null && r.foreign!==undefined && r.foreign!=='' && Number.isFinite(Number(r.foreign)) && Math.abs(Number(r.foreign))>0 ? `<div class="meta">外幣：${esc(r.currency||'未指定')} ${isRefund?'-':''}${esc(ccForeignDisplay(r.currency,Math.abs(Number(r.foreign))))}</div>` : ''}
        ${isForeignRecord(r)&&ccFeeCycleEligible(r.bank,r.date)?`<div class="meta ${Number(r.overseasFee)>0?'cc-fee-confirmed':'cc-fee-pending'}">海外手續費：${Number(r.overseasFee)>0?'NT$'+Number(r.overseasFee).toLocaleString('zh-TW'):'待補登'}</div>`:''}
        ${r.note ? `<div class="meta">備註：${esc(r.note)}</div>` : ''}
        <div class="meta">交易類型：${isRefund?'退刷':isPoints?'抵扣點數':'消費'}</div>
        ${feeSyncing ? '<div class="meta cc-fee-pending">此筆交易正在背景同步／需核對，暫不可修改或刪除</div>' : ''}
        ${isPending ? '<div class="pending-inline">待補台幣金額</div>' : ''}

        <div class="record-detail hidden" data-record-detail="${r.id}">
          ${r.bank==='中信' && r.card ? `<div class="meta">卡別：${esc(r.card)}</div>` : ''}
          <div class="meta">進度：${esc(r.status || '刷')}</div>
        </div>

        <div class="rfoot">
          <span class="status ${isRefund ? 'refund-status' : ''}">${isPending ? '待補' : (isRefund ? '退刷' : isPoints ? '抵扣點數' : esc(r.status || '刷'))}</span>
          <div class="actions"><button class="mini detail" data-record-toggle="${r.id}">詳細</button><button class="mini edit" onclick="openEdit(${r.id})" ${feeSyncing?'disabled':''}>${feeSyncing?'同步中／待核對':isPending ? '補金額' : isPendingFee(r) ? '補登手續費' : '修改'}</button><button class="mini del" onclick="deleteRec(${r.id})" ${feeSyncing?'disabled':''}>刪除</button></div>
        </div>
      </div>`;
  }).join('');

  bindRecordExpanders();
  if(typeof renderBillingOverview === 'function') renderBillingOverview();
};

if(Array.isArray(records) && records.length) renderRecords();
