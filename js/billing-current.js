// 月份帳務 / 未請款延後
// 只處理現在這一期；更早已繳清的歷史資料完全不動。
// 金額優先依「實際所在 Sheet 分頁」計算，避免只看刷卡日期造成跨期錯算。
// 帳期調整暫存在 localStorage，等後端更新後再同步到雲端。

// v2：忽略前一版可能留下的本機帳期調整，重新以 Sheet 為準。
const BILLING_OVERRIDE_KEY = 'cc_billing_cycle_overrides_v2';
let billingOverrides = readBillingOverrides();
const billingDetailOpen = {};

// 使用者核對過的上一期帳單快照（只對 2026 年 10 月有效）。
// 不把前期交易加總誤認為銀行實際出帳金額。
const CC_STATEMENT_KEY='cc_verified_statements_v1';
const CC_STATEMENT_SEED={'2026-10':{'中信':62814,'國泰':23245}};
function ccLoadStatements(){try{const value=JSON.parse(localStorage.getItem(CC_STATEMENT_KEY));if(value&&typeof value==='object'&&!Array.isArray(value))return value;}catch(e){console.warn(e);}return JSON.parse(JSON.stringify(CC_STATEMENT_SEED));}
let ccStatementArchive=ccLoadStatements();
let ccStatementCloudReady=false;
let ccStatementRevision='';
let ccStatementCloudError='正在向雲端確認銀行核對金額…';
let ccStatementWriteBusy=false;
async function ccRefreshStatementArchive(){
  try{
    const response=await fetch(APP_CONFIG.apiUrl+'?action=verifiedStatements&_='+Date.now(),{cache:'no-store'});
    if(!response.ok)throw Error('HTTP '+response.status);
    const data=await response.json();
    if(!data.ok||!data.archive||!data.revision)throw Error(data.error||'GAS 尚未部署 v2.7.2 或回傳格式不符');
    if(!/^2\.7\.[2-9]$/.test(String(data.version||'')))throw Error('GAS 必須先部署 v2.7.2 才能跨裝置同步');
    ccStatementArchive=data.archive;
    ccStatementRevision=data.revision;
    ccStatementCloudReady=true;
    ccStatementCloudError='';
    try{localStorage.setItem(CC_STATEMENT_KEY,JSON.stringify(data.archive));}catch(err){console.warn('瀏覽器快取未儲存',err);}
  }catch(err){
    ccStatementCloudReady=false;
    ccStatementCloudError='無法同步銀行帳單核對金額：'+err.message+'。目前僅顯示本機舊資料，禁止編輯，避免兩台裝置互相覆蓋。';
  }
  if(typeof renderBillingOverview==='function')renderBillingOverview();
}
async function ccEditStatement(bank,month){
  if(ccStatementWriteBusy)return;
  if(!ccStatementCloudReady){
    alert(ccStatementCloudError+'\n請先由 GAS 編輯器部署 v2.7.2，再重新開啟網站。');
    return;
  }
  const old=ccStatementArchive[month]?.[bank];
  const value=prompt(bank+' '+month+' 銀行實際帳單金額（跨裝置同步，不修改交易 Sheet）',old===undefined?'':String(old));
  if(value===null)return;
  const clean=value.replace(/,/g,'').trim();
  if(!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(clean)||!Number.isFinite(Number(clean))||Number(clean)>1000000000){
    alert('金額不正確，請輸入非負數（最多兩位小數）');return;
  }
  if(!confirm('確認把 '+bank+' '+month+' 銀行帳單核對金額 NT$'+Number(clean).toLocaleString()+' 儲存到雲端？\n不會修改任何刷卡交易。'))return;
  const adminKey=prompt('請輸入 GAS 指令碼屬性的 CC_ADMIN_KEY 管理密碼（不會儲存在瀏覽器）：');
  if(adminKey===null)return;
  if(!adminKey){alert('未輸入密碼，已取消操作');return;}
  ccStatementWriteBusy=true;
  try{
    const data=await postToApi({action:'updateVerifiedStatement',bank,month,amount:Number(clean),revision:ccStatementRevision,adminKey});
    if(!data?.archive||!data?.revision)throw Error('雲端尚未確認儲存，請重新讀取核對金額');
    ccStatementArchive=data.archive;
    ccStatementRevision=data.revision;
    ccStatementCloudReady=true;
    ccStatementCloudError='';
    try{localStorage.setItem(CC_STATEMENT_KEY,JSON.stringify(data.archive));}catch(err){console.warn('本機快取寫入失敗',err);}
    renderBillingOverview();
    alert('銀行帳單金額已儲存到雲端，可在其他裝置重新開啟網頁查看。');
  }catch(err){
    // 不確定是否已送達 GAS 時，一律重新讀取雲端；不可將本機值冒充雲端成功。
    await ccRefreshStatementArchive();
    alert('儲存未確認：'+err.message+'\n已重新核對雲端，請確認金額後再操作。');
  }finally{ccStatementWriteBusy=false;}
}

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

function previousCycleForBank(startDay, today, bank){
  if((bank==='富邦' && dateToInput(today)>='2026-10-02' && dateToInput(today)<='2026-10-22') || (bank==='台新' && dateToInput(today)>='2026-10-06' && dateToInput(today)<='2026-10-20'))return null;
  const active = getBankCycle(bank, dateToInput(today));
  const priorDay = new Date(active.s);
  priorDay.setDate(priorDay.getDate() - 1);
  const previous=getBankCycle(bank, dateToInput(priorDay));
  if(bank==='台新' && previous.s < new Date(2026,9,6,12))return null;
  if(bank==='富邦' && previous.s < new Date(2026,9,2,12))return null;
  return previous;
}

function activeCycleForBank(startDay, today, bank){
  return getBankCycle(bank, dateToInput(today));
}

function sumTwd(list){
  return list.reduce((sum, r) => {
    const amount=Number(r.twd)||0;
    return sum + (r.transactionType==='refund' ? -Math.abs(amount) : amount);
  },0);
}

function pendingForCycle(bank, cycle){
  if(!cycle || typeof ccQueueRead!=='function') return {count:0,total:0,uncertain:0};
  try{
    const items=ccQueueRead().filter(x=>x.record?.bank===bank && inDateRange(x.record.date,cycle.s,cycle.e));
    return {count:items.length,total:sumTwd(items.map(x=>x.record)),uncertain:items.filter(x=>x.state==='uncertain').length};
  }catch(_){return {count:0,total:0,uncertain:0};}
}
function pendingCycleHtml(bank,cycle){
  const p=pendingForCycle(bank,cycle);
  return p.count ? `<div class="billing-warning">此裝置另有 ${p.count} 筆待同步（${moneyText(p.total)}），尚未計入上方已同步金額${p.uncertain?'；其中 '+p.uncertain+' 筆同步結果待確認':''}。後端恢復前請勿重複送出。</div>` : '';
}

function billingDataNotice(){
  const state=window.ccDataStatus||{kind:'loading'};
  const time=state.savedAt && typeof formatSyncTime==='function' ? formatSyncTime(state.savedAt) : '';
  if(state.kind==='confirmed-write')return `交易已由 Google Sheet 確認寫入（${time}）；若曾在 Sheet 手動修改其他資料，可按「從 Sheet 更新資料」核對。`;
  if(state.kind==='fresh')return `已從 Sheet 讀取（${time}）；本期金額為交易明細加總，仍須與結算列核對。`;
  if(state.kind==='cache')return `目前是此裝置的舊資料（${time||'時間不明'}），不代表 Sheet 最新金額。`;
  if(state.kind==='error-cache')return `Sheet 讀取失敗，目前顯示舊資料（${time||'時間不明'}）；金額可能過時。`;
  if(state.kind==='error')return 'Sheet 讀取失敗，目前無法確認最新帳務金額。';
  return '正在讀取資料；目前金額尚未核對。';
}
function cycleMismatchNotice(bank,cycle){
  const mismatch=records.filter(r=>r.bank===bank && r.source?.sheetName && inDateRange(r.date,cycle.s,cycle.e) && !belongsToCycle(r,cycle) && !String(r.note||'').includes('上期剩餘'));
  return mismatch.length ? `<div class="billing-warning">帳期核對：有 ${mismatch.length} 筆日期落在本期、但實際位於其他 Sheet 分頁的紀錄，未計入本期。請檢查分頁與帳期，勿直接修改資料。</div>` : '';
}
function moneyText(value){
  return `NT$${Number(value || 0).toLocaleString()}`;
}

function rangeText(cycle){
  return `${fmtDate(cycle.s)}～${fmtDate(cycle.e)}`;
}

function monthLabelFromCycle(cycle){
  return `${cycle.s.getMonth()+1}月`;
}

function isSameCalendarMonth(dateStr, target){
  const d = parseLocalDate(dateStr);
  return Boolean(d && d.getFullYear() === target.getFullYear() && d.getMonth() === target.getMonth());
}

function belongsToCycle(record, cycle){
  const sourceSheet = String(record?.source?.sheetName || '').trim();
  if(sourceSheet){
    return sourceSheet === cycle.tab;
  }
  // 沒有來源分頁資訊時才退回刷卡日期判斷。
  return inDateRange(record.date, cycle.s, cycle.e);
}

function effectiveCycleState(record){
  return billingOverrides[recordStableKey(record)] === 'next' ? 'next' : 'current';
}

let ccMoveCycleBusy=false;
async function toggleRecordToNext(recordKey){
  if(ccMoveCycleBusy)return;
  const record=records.find(r=>recordStableKey(r)===recordKey);
  if(!record?.source?.rowHash){alert('請先從 Sheet 更新資料，再搬移交易。');return;}
  if(record.status!=='刷'){alert('只有狀態為「刷」的交易可以延至下期。');return;}
  if(!navigator.onLine){alert('離線時無法搬移交易。');return;}
  if(typeof ccQueueRead==='function' && ccQueueRead().some(x=>x.record?.bank===record.bank)){alert('這家銀行仍有待同步交易，請先處理。');return;}
  if(!confirm('確定將「'+record.item+'」搬到下一期 Google Sheet？\n原刷卡日期不變，備註加上「上期剩餘」。'))return;
  ccMoveCycleBusy=true;
  try{
    const response=await fetch(API_URL+'?action=health&_='+Date.now(),{cache:'no-store'});
    const health=await response.json();
    if(!health.ok || !['2.7.1','2.7.2'].includes(String(health.version||'')))throw Error('後端版本不相容；未執行搬移');
    const result=await postToApi({action:'moveRecordToNextCycle',source:record.source});
    if(!result.record?.source?.rowHash)throw Error('搬移結果尚未確認，請檢查 Sheet');
    if(typeof ccMarkLocalMutation==='function')ccMarkLocalMutation();
    await loadRecords({force:true});
    alert('已搬至下一期 Google Sheet！\n備註：'+result.record.note);
  }catch(err){alert('搬移未確認：'+err.message+'\n請先檢查兩期 Sheet，勿直接重複操作。');}
  finally{ccMoveCycleBusy=false;renderBillingOverview();}
}

function toggleBillingDetail(bank){
  billingDetailOpen[bank] = !billingDetailOpen[bank];
  renderBillingOverview();
}

function renderBillingOverview(){
  const root = document.getElementById('billingOverview');
  if(!root || !Array.isArray(records)){
    if(root) root.innerHTML = '<div class="empty">目前沒有可計算的帳務資料</div>';
    return;
  }

  const now = new Date();
  const cards = [`<div class="billing-note" style="margin-bottom:12px">${esc(billingDataNotice())}</div>`];

  Object.entries(APP_CONFIG.banks).forEach(([bank, cfg]) => {
    // 尚未確認帳期的銀行才以當月交易估算。
    if(!cfg.cycleStartDay){
      const currentMonthRecords = records.filter(r => r.bank === bank && isSameCalendarMonth(r.date, now));
      const missing = currentMonthRecords.filter(r => !(Number(r.twd) > 0)).length;
      const label = `${now.getMonth()+1}月`;

      cards.push(`
        <div class="billing-card ${bankClass(bank)}">
          <div class="billing-head">
            <strong>${esc(bank)}</strong>
            <span>帳期待確認</span>
          </div>
          <div class="billing-cycle-label">${label}應繳（目前累積）</div>
          <div class="billing-amount">${moneyText(sumTwd(currentMonthRecords))}</div>
          ${missing ? `<div class="billing-warning">另有 ${missing} 筆尚未補台幣金額</div>` : ''}
          <div class="billing-note">目前先以 ${label} 已記錄交易估算；確認結帳日後會改成正式帳期。</div>
        </div>`);
      return;
    }

    const closedCycle = previousCycleForBank(cfg.cycleStartDay, now, bank);
    const openCycle = activeCycleForBank(cfg.cycleStartDay, now, bank);
    if(!closedCycle){
      const openRaw=records.filter(r=>r.bank===bank && belongsToCycle(r,openCycle));
      cards.push('<div class="billing-card '+bankClass(bank)+'"><div class="billing-head"><strong>'+esc(bank)+'</strong><span>繳款日：每月 '+cfg.paymentDueDay+' 日</span></div><div class="billing-cycle-label">首期累積｜'+rangeText(openCycle)+'</div><div class="billing-amount">'+moneyText(sumTwd(openRaw))+'</div>'+cycleMismatchNotice(bank,openCycle)+pendingCycleHtml(bank,openCycle)+'<div class="billing-note">首期依實際 Google Sheet 分頁計算；前一期資訊尚未確認，不推算上一期應繳金額。</div></div>');
      return;
    }
    const snapshotKey = dateToInput(now).slice(0,7);
    const knownStatement = ccStatementArchive[snapshotKey]?.[bank];
    const payableMonthLabel = monthLabelFromCycle(closedCycle);
    const accumulatingMonthLabel = monthLabelFromCycle(openCycle);

    // 重要：以實際來源 Sheet 分頁為主，而不是只依刷卡日期。
    const closedRaw = records.filter(r => r.bank === bank && belongsToCycle(r, closedCycle));
    const openRaw = records.filter(r => r.bank === bank && belongsToCycle(r, openCycle));

    const deferred = [];
    const payable = closedRaw;
    const nextAccumulated = openRaw;
    const carried = openRaw.filter(r=>String(r.note||'').includes('上期剩餘'));

    const payableMissing = payable.filter(r => r.twd === null || r.twd === '').length;
    const nextMissing = nextAccumulated.filter(r => r.twd === null || r.twd === '').length;
    const isOpen = Boolean(billingDetailOpen[bank]);

    const detailRows = closedRaw.map(r => {
      const key = recordStableKey(r);
      const moved = false;
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

        <div class="billing-cycle-label">${knownStatement !== undefined ? "上期帳單（已確認）" : "上期帳單（尚未核對）"}</div>
        <div class="billing-amount">${knownStatement !== undefined ? moneyText(knownStatement) : "待確認"}</div>
        <button type="button" data-cc-statement="${esc(bank)}" data-month="${esc(snapshotKey)}">登記／修正銀行帳單金額</button>
        <div class="billing-note">${ccStatementCloudReady ? "核對金額已由 GAS 雲端同步；不修改交易 Google Sheet。" : esc(ccStatementCloudError)}</div>
        ${payableMissing ? `<div class="billing-warning">另有 ${payableMissing} 筆尚未補台幣金額</div>` : ''}

        <div class="billing-next-box">
          <div><span>本期累積消費（${rangeText(openCycle)}）</span></div>
          <strong>${moneyText(sumTwd(nextAccumulated))}</strong>
        </div>
        ${cycleMismatchNotice(bank,openCycle)}
        ${pendingCycleHtml(bank,openCycle)}
        ${nextMissing ? `<div class="billing-warning soft">${accumulatingMonthLabel}另有 ${nextMissing} 筆尚未補台幣金額</div>` : ''}
        ${carried.length ? `<div class="billing-moved-note">${accumulatingMonthLabel}含 ${carried.length} 筆上期剩餘（已存於下一期 Sheet）</div>` : ''}

        <button type="button" class="billing-detail-btn" data-billing-bank="${esc(bank)}">
          ${isOpen ? '收起詳細' : '展開詳細'}
        </button>
        <div class="billing-detail ${isOpen ? '' : 'hidden'}">
          <div class="billing-cycle-detail">
            <div><span>${payableMonthLabel}帳期</span><strong>${rangeText(closedCycle)}</strong></div>
            <div><span>${accumulatingMonthLabel}帳期</span><strong>${rangeText(openCycle)}</strong></div>
          </div>
          <div class="billing-detail-title">${payableMonthLabel}入帳明細（${closedRaw.length} 筆）</div>
          ${detailRows || `<div class="empty compact">${payableMonthLabel}沒有紀錄</div>`}
          ${carried.length ? `<div class="billing-detail-title">${accumulatingMonthLabel}上期剩餘（${carried.length} 筆）</div>`+carried.map(r=>`<div class="billing-row moved"><div class="billing-row-main"><div class="billing-row-title">${esc(r.item)}</div><div class="billing-row-meta">原刷卡日 ${esc(r.date)}・${esc(r.note)}</div></div><strong>${moneyText(r.twd)}</strong></div>`).join('') : ''}
          <div class="billing-help">本期消費由實際交易明細加總；上期帳單以銀行帳單核對金額為準。尚未同步的新增紀錄不計入。</div>
        </div>
      </div>`);
  });

  root.innerHTML = cards.join('');

  root.querySelectorAll('[data-cc-statement]').forEach(btn=>btn.addEventListener('click',()=>ccEditStatement(btn.dataset.ccStatement,btn.dataset.month)));
  root.querySelectorAll('[data-billing-bank]').forEach(btn => {
    btn.addEventListener('click', () => toggleBillingDetail(btn.dataset.billingBank));
  });
  root.querySelectorAll('[data-billing-key]').forEach(btn => {
    btn.addEventListener('click', () => toggleRecordToNext(btn.dataset.billingKey));
  });
}

const originalRenderRecordsForBilling = renderRecords;
renderRecords = function(){
  originalRenderRecordsForBilling();
  renderBillingOverview();
};

renderBillingOverview();

// 讀取後端核對金額；GAS 尚未升級時只顯示本機舊值，絕不寫入真實交易表。
void ccRefreshStatementArchive();
