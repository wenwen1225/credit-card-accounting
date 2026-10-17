// 紀錄頁篩選：交易類型 + 全部紀錄 / 待補金額

let recordStateFilter = 'all';
let transactionTypeFilter = 'all';
const recordStateTabs = document.getElementById('recordStateTabs');
const typeTabs = document.getElementById('typeTabs');
const pendingCountBadge = document.getElementById('pendingCountBadge');

recordStateTabs?.querySelectorAll('.chip').forEach(btn => {
  btn.addEventListener('click', () => {
    recordStateTabs.querySelectorAll('.chip').forEach(x => x.classList.remove('active'));
    btn.classList.add('active');
    recordStateFilter = btn.dataset.state || 'all';
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

function isPendingAmount(record){
  return Number(record.foreign) !== 0 && !(Math.abs(Number(record.twd)) > 0);
}

function updatePendingCount(){
  if(!pendingCountBadge) return;

  // 數字跟著目前選擇的月份、銀行與交易類型走，讓提示對當下畫面最有用。
  let contextList = records.filter(r => monthKey(r.date) === currentMonth && (bankFilter === '全部' || r.bank === bankFilter));
  if(transactionTypeFilter !== 'all'){
    contextList = contextList.filter(r => recordTransactionType(r) === transactionTypeFilter);
  }

  const count = contextList.filter(isPendingAmount).length;
  pendingCountBadge.textContent = String(count);
  pendingCountBadge.classList.toggle('hidden', count === 0);
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
  let list = records.filter(r => monthKey(r.date) === currentMonth && (bankFilter === '全部' || r.bank === bankFilter));

  if(transactionTypeFilter !== 'all'){
    list = list.filter(r => recordTransactionType(r) === transactionTypeFilter);
  }

  if(recordStateFilter === 'pending'){
    list = list.filter(isPendingAmount);
  }

  if(q){
    list = list.filter(r => (`${r.item} ${r.note} ${r.card} ${recordTransactionType(r) === 'refund' ? '退刷 退款' : '消費'}`).toLowerCase().includes(q));
  }

  countVal.textContent = list.length;
  const total = list.reduce((sum, r) => sum + signedTwd(r), 0);
  totalVal.textContent = `${total < 0 ? '-' : ''}NT$${Math.abs(total).toLocaleString()}`;

  if(!list.length){
    const typeText = transactionTypeFilter === 'refund' ? '退刷' : transactionTypeFilter === 'purchase' ? '消費' : '';
    const emptyText = recordStateFilter === 'pending'
      ? `這個月份目前沒有${typeText ? typeText + '且' : ''}待補金額`
      : `這個條件下沒有${typeText || ''}紀錄`;
    recordList.innerHTML=`<div class="empty">${emptyText}<br><small>目前月份：${esc(currentMonth || '無')}</small></div>`;
    if(typeof renderBillingOverview === 'function') renderBillingOverview();
    return;
  }

  recordList.innerHTML = list.map(r => {
    const isRefund = recordTransactionType(r) === 'refund';
    const isPending = isPendingAmount(r);
    return `
      <div class="record ${bankClass(r.bank)} ${isRefund ? 'refund-record' : ''}">
        <div class="rtop">
          <div>
            <div class="date">${esc(r.date)}</div>
            <div class="item">${isRefund ? '<span class="refund-badge">退刷</span>' : ''}${esc(r.item)}</div>
          </div>
          <div class="bank">${esc(r.bank)}${r.card?'・'+esc(r.card):''}</div>
        </div>
        <div class="money ${isRefund ? 'refund-money' : ''}">${transactionMoneyText(r)}</div>
        ${r.foreign ? `<div class="meta">${isRefund ? '-' : ''}${esc(r.currency)} ${Math.abs(Number(r.foreign)).toLocaleString()}</div>` : ''}
        ${isPending ? '<div class="pending-inline">待補台幣金額</div>' : ''}
        ${r.note ? `<div class="meta">備註：${esc(r.note)}</div>` : ''}
        <div class="rfoot">
          <span class="status ${isRefund ? 'refund-status' : ''}">${isPending ? '待補' : (isRefund ? '退刷' : esc(r.status || '刷'))}</span>
          <div class="actions"><button class="mini edit" onclick="openEdit(${r.id})">${isPending ? '補金額' : '修改'}</button><button class="mini del" onclick="deleteRec(${r.id})">刪除</button></div>
        </div>
      </div>`;
  }).join('');

  if(typeof renderBillingOverview === 'function') renderBillingOverview();
};

if(Array.isArray(records) && records.length) renderRecords();
