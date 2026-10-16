// 本月應繳 / 下期累積 / 延至下期
// 目前只處理「最近一期已結帳」與「目前進行中的下一期」，完全不碰更早已繳清的歷史帳期。
// 帳期調整先存在本機 localStorage；等後端更新時再改成雲端同步。

const BILLING_OVERRIDE_KEY = 'cc_billing_cycle_overrides_v1';
let billingOverrides = readBillingOverrides();
const billingDetailOpen = {};

function readBillingOverrides(){
  try{ return JSON.parse(localStorage.getItem(BILLING_OVERRIDE_KEY) || '{}'); }
  catch(_){ return {}; }
}

function saveBillingOverrides(){
  localStorage.setItem(BILLING_OVERRIDE_KEY, JSON.stringify(billingOverrides));
}

function recordStableKey(r){
  if(r?.source?.spreadsheetId && r?.source?.sheetName && r?.source?.row){
    return `${r.bank}|${r.source.spreadsheetId}|${r.source.sheetName}|${r.source.row}`;
  }
  return `${r.bank}|${r.date}|${r.item}|${r.twd ?? ''}`;
}

function parseLocalDate(dateStr){
  const normalized = normalizeClientDate(dateStr);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const d = new Date(`${normalized}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function inDateRange(dateStr, start, end){
  const d = parseLocalDate(dateStr);
  return Boolean(d && d >= start && d <= end);
}

function dateToInput(d){
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function previousCycleForBank(startDay, today){
  const active = getCycle(startDay, dateToInput(today));
  const priorDay = new Date(active.s);
  priorDay.setDate(priorDay.getDate() - 1);
  return getCycle(startDay, dateToInput(priorDay));
}

function activeCycleForBank(startDay, today){
  return getCycle(startDay, dateToInput(today));
}

function sumTwd(list){
  return list.reduce((sum, r) => sum + (Number(r.twd) || 0), 0);
}

function moneyText(value){
  return `NT$${Number(value || 0).toLocaleString()}`;
}

function rangeText(cycle){
  return `${fmtDate(cycle.s)}～${fmtDate(cycle.e)}`;
}

function effectiveCycleState(record){
  return billingOverrides[recordStableKey(record)] === 'next' ? 'next' : 'current';
}

function toggleRecordToNext(recordKey){
  if(billingOverrides[recordKey] === 'next') delete billingOverrides[recordKey];
  else billingOverrides[recordKey] = 'next';
  saveBillingOverrides();
  renderBillingOverview();
}

function toggleBillingDetail(bank){
  billingDetailOpen[bank] = !billingDetailOpen[bank];
  renderBillingOverview();
}

function renderBillingOverview(){
  const root = document.getElementById('billingOverview');
  if(!root || !Array.isArray(records) || !records.length){
    if(root) root.innerHTML = '<div class="empty">目前沒有可計算的帳期資料</div>';
    return;
  }

  const now = new Date();
  const cards = [];

  Object.entries(APP_CONFIG.banks).forEach(([bank, cfg]) => {
    if(!cfg.cycleStartDay){
      cards.push(`
        <div class="billing-card billing-unknown">
          <div class="billing-head"><strong>${esc(bank)}</strong><span>帳期待確認</span></div>
          <div class="billing-note">等你確認結帳週期後，再加入本月應繳與下期累積。</div>
        </div>`);
      return;
    }

    const closedCycle = previousCycleForBank(cfg.cycleStartDay, now);
    const openCycle = activeCycleForBank(cfg.cycleStartDay, now);

    const closedRaw = records.filter(r => r.bank === bank && inDateRange(r.date, closedCycle.s, closedCycle.e));
    const openRaw = records.filter(r => r.bank === bank && inDateRange(r.date, openCycle.s, openCycle.e));

    const deferred = closedRaw.filter(r => effectiveCycleState(r) === 'next');
    const payable = closedRaw.filter(r => effectiveCycleState(r) !== 'next');
    const nextAccumulated = [...openRaw, ...deferred];

    const payableMissing = payable.filter(r => !(Number(r.twd) > 0)).length;
    const nextMissing = nextAccumulated.filter(r => !(Number(r.twd) > 0)).length;
    const isOpen = Boolean(billingDetailOpen[bank]);

    const detailRows = closedRaw.map(r => {
      const key = recordStableKey(r);
      const moved = effectiveCycleState(r) === 'next';
      return `
        <div class="billing-row ${moved ? 'moved' : ''}">
          <div class="billing-row-main">
            <div class="billing-row-title">${esc(r.item || '未命名項目')}</div>
            <div class="billing-row-meta">${esc(r.date)}${r.card ? `・${esc(r.card)}` : ''}</div>
          </div>
          <div class="billing-row-right">
            <strong>${r.twd === null || r.twd === '' ? '待補' : moneyText(r.twd)}</strong>
            <button type="button" class="billing-move-btn ${moved ? 'undo' : ''}" data-billing-key="${esc(key)}">${moved ? '移回本期' : '延至下期'}</button>
          </div>
        </div>`;
    }).join('');

    cards.push(`
      <div class="billing-card ${bankClass(bank)}">
        <div class="billing-head">
          <strong>${esc(bank)}</strong>
          <span>${cfg.paymentDueDay ? `${now.getMonth()+1}/${cfg.paymentDueDay} 繳款` : '繳款日待確認'}</span>
        </div>
        <div class="billing-cycle-label">本月應繳｜${rangeText(closedCycle)}</div>
        <div class="billing-amount">${moneyText(sumTwd(payable))}</div>
        ${payableMissing ? `<div class="billing-warning">另有 ${payableMissing} 筆尚未補台幣金額</div>` : ''}

        <div class="billing-next-box">
          <div><span>下期已累積</span><small>${rangeText(openCycle)}</small></div>
          <strong>${moneyText(sumTwd(nextAccumulated))}</strong>
        </div>
        ${nextMissing ? `<div class="billing-warning soft">下期另有 ${nextMissing} 筆尚未補台幣金額</div>` : ''}
        ${deferred.length ? `<div class="billing-moved-note">已將 ${deferred.length} 筆未請款交易延至下期</div>` : ''}

        <button type="button" class="billing-detail-btn" data-billing-bank="${esc(bank)}">
          ${isOpen ? '收起本期明細' : `檢查本期入帳（${closedRaw.length} 筆）`}
        </button>
        <div class="billing-detail ${isOpen ? '' : 'hidden'}">
          ${detailRows || '<div class="empty compact">本期沒有紀錄</div>'}
          <div class="billing-help">只有目前最近一期可以調整；更早已繳清的歷史資料不會被改動。</div>
        </div>
      </div>`);
  });

  root.innerHTML = cards.join('');

  root.querySelectorAll('[data-billing-bank]').forEach(btn => {
    btn.addEventListener('click', () => toggleBillingDetail(btn.dataset.billingBank));
  });
  root.querySelectorAll('[data-billing-key]').forEach(btn => {
    btn.addEventListener('click', () => toggleRecordToNext(btn.dataset.billingKey));
  });
}

// 只在既有畫面 render 後補上帳期總覽，不改原本紀錄功能。
const originalRenderRecordsForBilling = renderRecords;
renderRecords = function(){
  originalRenderRecordsForBilling();
  renderBillingOverview();
};

// 第一次若資料已經載入，也立即畫一次。
renderBillingOverview();
