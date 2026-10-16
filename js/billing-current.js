// 月份帳務 / 未請款延後
// 只處理現在這一期；更早已繳清的歷史資料完全不動。
// 帳期調整暫存在 localStorage，等後端更新後再同步到雲端。

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

function monthLabelFromDate(d){
  return `${d.getMonth()+1}月`;
}

function nextCalendarMonth(today){
  return new Date(today.getFullYear(), today.getMonth()+1, 1, 12);
}

function isSameCalendarMonth(dateStr, target){
  const d = parseLocalDate(dateStr);
  return Boolean(d && d.getFullYear() === target.getFullYear() && d.getMonth() === target.getMonth());
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
    if(root) root.innerHTML = '<div class="empty">目前沒有可計算的帳務資料</div>';
    return;
  }

  const now = new Date();
  const cards = [];

  Object.entries(APP_CONFIG.banks).forEach(([bank, cfg]) => {
    // 台新、富邦目前還沒有正式帳期規則：不虛構「本月應繳」，只顯示下一個月份。
    if(!cfg.cycleStartDay){
      const currentMonthRecords = records.filter(r => r.bank === bank && isSameCalendarMonth(r.date, now));
      const nextMonth = nextCalendarMonth(now);
      const missing = currentMonthRecords.filter(r => !(Number(r.twd) > 0)).length;

      cards.push(`
        <div class="billing-card ${bankClass(bank)}">
          <div class="billing-head">
            <strong>${esc(bank)}</strong>
            <span>帳期規則待確認</span>
          </div>
          <div class="billing-cycle-label">${monthLabelFromDate(nextMonth)}應繳（目前累積）</div>
          <div class="billing-amount">${moneyText(sumTwd(currentMonthRecords))}</div>
          ${missing ? `<div class="billing-warning">另有 ${missing} 筆尚未補台幣金額</div>` : ''}
          <div class="billing-note">目前先以 ${now.getMonth()+1} 月已記錄交易估算；確認結帳日後再改成正式帳期。</div>
        </div>`);
      return;
    }

    const closedCycle = previousCycleForBank(cfg.cycleStartDay, now);
    const openCycle = activeCycleForBank(cfg.cycleStartDay, now);
    const payableMonthLabel = monthLabelFromDate(closedCycle.e);
    const accumulatingMonthLabel = monthLabelFromDate(openCycle.e);

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
            <button type="button" class="billing-move-btn ${moved ? 'undo' : ''}" data-billing-key="${esc(key)}">${moved ? `移回${payableMonthLabel}` : `延至${accumulatingMonthLabel}`}</button>
          </div>
        </div>`;
    }).join('');

    cards.push(`
      <div class="billing-card ${bankClass(bank)}">
        <div class="billing-head">
          <strong>${esc(bank)}</strong>
          <span>${cfg.paymentDueDay ? `${now.getMonth()+1}/${cfg.paymentDueDay} 繳款` : '繳款日待確認'}</span>
        </div>

        <div class="billing-cycle-label">${payableMonthLabel}應繳｜${rangeText(closedCycle)}</div>
        <div class="billing-amount">${moneyText(sumTwd(payable))}</div>
        ${payableMissing ? `<div class="billing-warning">另有 ${payableMissing} 筆尚未補台幣金額</div>` : ''}

        <div class="billing-next-box">
          <div><span>${accumulatingMonthLabel}累積</span><small>${rangeText(openCycle)}</small></div>
          <strong>${moneyText(sumTwd(nextAccumulated))}</strong>
        </div>
        ${nextMissing ? `<div class="billing-warning soft">${accumulatingMonthLabel}另有 ${nextMissing} 筆尚未補台幣金額</div>` : ''}
        ${deferred.length ? `<div class="billing-moved-note">已有 ${deferred.length} 筆未請款交易移至${accumulatingMonthLabel}</div>` : ''}

        <button type="button" class="billing-detail-btn" data-billing-bank="${esc(bank)}">
          ${isOpen ? `收起${payableMonthLabel}明細` : `檢查${payableMonthLabel}入帳（${closedRaw.length} 筆）`}
        </button>
        <div class="billing-detail ${isOpen ? '' : 'hidden'}">
          ${detailRows || `<div class="empty compact">${payableMonthLabel}沒有紀錄</div>`}
          <div class="billing-help">只調整現在這一期；更早已繳清的歷史資料不會被改動。</div>
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

// 只在既有畫面 render 後補上帳務總覽，不改原本紀錄功能。
const originalRenderRecordsForBilling = renderRecords;
renderRecords = function(){
  originalRenderRecordsForBilling();
  renderBillingOverview();
};

renderBillingOverview();
