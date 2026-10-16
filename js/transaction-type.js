// 消費 / 退刷前端支援
// 目前只處理畫面、顯示與統計；真正寫入 Google Sheet 等後端更新時再接上。

const transactionTypeSel = document.getElementById('transactionTypeSel');
const transactionTypeHint = document.getElementById('transactionTypeHint');
const addBox = document.querySelector('#addPage .box');

function recordTransactionType(record){
  if(record?.transactionType === 'refund') return 'refund';
  if(Number(record?.twd) < 0) return 'refund';
  return 'purchase';
}

function signedTwd(record){
  if(record?.twd === null || record?.twd === '' || record?.twd === undefined) return 0;
  const amount = Math.abs(Number(record.twd) || 0);
  return recordTransactionType(record) === 'refund' ? -amount : amount;
}

function transactionMoneyText(record){
  if(record?.twd === null || record?.twd === '' || record?.twd === undefined) return '待補';
  const amount = Math.abs(Number(record.twd) || 0).toLocaleString();
  return recordTransactionType(record) === 'refund' ? `-NT$${amount}` : `NT$${amount}`;
}

function updateTransactionTypeUi(){
  const isRefund = transactionTypeSel?.value === 'refund';
  addBox?.classList.toggle('refund-mode', isRefund);
  if(transactionTypeHint){
    transactionTypeHint.textContent = isRefund
      ? '退刷金額請照正常輸入正數，之後統計會自動扣除。'
      : '一般刷卡消費。';
  }
  if(twdInp){
    twdInp.placeholder = isRefund ? '例如：1280（不用輸入負號）' : '可留空，之後再補';
  }
  const saveText = isRefund ? '儲存退刷紀錄' : '儲存刷卡紀錄';
  if(saveBtn) saveBtn.textContent = saveText;
}

transactionTypeSel?.addEventListener('change', updateTransactionTypeUi);
updateTransactionTypeUi();

// 讓月份統計把退刷當作負數。
renderRecords = function(){
  if(!records.length){
    countVal.textContent='0'; totalVal.textContent='NT$0';
    recordList.innerHTML='<div class="empty">目前沒有讀到紀錄</div>';
    if(typeof renderBillingOverview === 'function') renderBillingOverview();
    return;
  }

  const q = searchInp.value.trim().toLowerCase();
  let list = records.filter(r => monthKey(r.date) === currentMonth && (bankFilter === '全部' || r.bank === bankFilter));
  if(q) list = list.filter(r => (`${r.item} ${r.note} ${r.card} ${recordTransactionType(r) === 'refund' ? '退刷 退款' : '消費'}`).toLowerCase().includes(q));

  countVal.textContent = list.length;
  const total = list.reduce((sum, r) => sum + signedTwd(r), 0);
  totalVal.textContent = `${total < 0 ? '-' : ''}NT$${Math.abs(total).toLocaleString()}`;

  if(!list.length){
    recordList.innerHTML=`<div class="empty">這個條件下沒有紀錄<br><small>目前月份：${esc(currentMonth || '無')}</small></div>`;
    if(typeof renderBillingOverview === 'function') renderBillingOverview();
    return;
  }

  recordList.innerHTML = list.map(r => {
    const isRefund = recordTransactionType(r) === 'refund';
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
        ${r.note ? `<div class="meta">備註：${esc(r.note)}</div>` : ''}
        <div class="rfoot">
          <span class="status ${isRefund ? 'refund-status' : ''}">${isRefund ? '退刷' : esc(r.status || '刷')}</span>
          <div class="actions"><button class="mini edit" onclick="openEdit(${r.id})">修改</button><button class="mini del" onclick="deleteRec(${r.id})">刪除</button></div>
        </div>
      </div>`;
  }).join('');

  if(typeof renderBillingOverview === 'function') renderBillingOverview();
};

renderPending = function(){
  const list = records.filter(r => Number(r.foreign) !== 0 && !(Math.abs(Number(r.twd)) > 0));
  if(!list.length){ pendingList.innerHTML='<div class="empty">目前沒有待補台幣金額</div>'; return; }
  pendingList.innerHTML = list.map(r => {
    const isRefund = recordTransactionType(r) === 'refund';
    return `<div class="record ${bankClass(r.bank)} ${isRefund ? 'refund-record' : ''}"><div class="date">${esc(r.date)}</div><div class="item">${isRefund ? '<span class="refund-badge">退刷</span>' : ''}${esc(r.item)}</div><div class="money ${isRefund ? 'refund-money' : ''}">${isRefund ? '-' : ''}${esc(r.currency)} ${Math.abs(Number(r.foreign)).toLocaleString()}</div><div class="meta">${esc(r.bank)}・待補台幣</div><div class="rfoot"><span class="status">待補</span><button class="mini edit" onclick="openEdit(${r.id})">補金額</button></div></div>`;
  }).join('');
};

// billing-current.js 使用這個函式計算月份帳務；改成支援退刷扣抵。
if(typeof sumTwd === 'function'){
  sumTwd = function(list){
    return list.reduce((sum, record) => sum + signedTwd(record), 0);
  };
}

// 若資料已載入，立即套用新版顯示。
if(Array.isArray(records) && records.length){
  renderRecords();
  renderPending();
}
