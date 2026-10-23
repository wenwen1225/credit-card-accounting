// 分析頁：年份 / 月份 + 概況 + 銀行占比 + 消費/退刷 + 卡別排行 + 趨勢分析
// 純前端統計，直接使用目前已讀入的 records，不需要新增後端 API。

let analysisYear = '';
let analysisMonth = '';

function analysisMoney(value){
  const n = Number(value || 0);
  return `${n < 0 ? '-' : ''}NT$${Math.abs(Math.round(n)).toLocaleString()}`;
}

function analysisAvailableYears(){
  const recordYears=(Array.isArray(records) ? records : []).map(r=>monthKey(r.date)).filter(Boolean).map(k=>k.slice(0,4));
  const cycled=Object.keys(ccCycleRowsByYear);
  return [...new Set([...recordYears,...cycled])].sort().reverse();
}

function analysisAvailableMonthsForYear(year){
  if(!year) return [];
  const rows=ccAnalysisRecords(year);
  const cycleMonths=rows.map(r=>ccCycleStartKey(r)).filter(k=>k.startsWith(year+'-')).map(k=>k.slice(5,7));
  const provisional=(Array.isArray(records)?records:[]).map(r=>monthKey(r.date)).filter(k=>k.startsWith(year+'-')).map(k=>k.slice(5,7));
  return [...new Set(cycleMonths.length?cycleMonths:provisional)].sort((a,b)=>Number(b)-Number(a));
}

function ensureAnalysisPeriod(){
  const years = analysisAvailableYears();
  const currentKey = currentMonth || '';
  const currentYear = currentKey ? currentKey.slice(0,4) : '';
  const currentMonthNum = currentKey ? currentKey.slice(5,7) : '';

  if(!analysisYear || !years.includes(analysisYear)){
    analysisYear = currentYear && years.includes(currentYear) ? currentYear : (years[0] || '');
  }

  const months = analysisAvailableMonthsForYear(analysisYear);
  if(!analysisMonth || !months.includes(analysisMonth)){
    analysisMonth = analysisYear === currentYear && months.includes(currentMonthNum)
      ? currentMonthNum
      : (months[0] || '');
  }

  return {years, months};
}

function selectedAnalysisMonthKey(){
  return analysisYear && analysisMonth ? `${analysisYear}-${analysisMonth}` : '';
}

function previousMonthKey(key){
  if(!/^\d{4}-\d{2}$/.test(key)) return '';
  const [year, month] = key.split('-').map(Number);
  const d = new Date(year, month - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function netTotalForList(list){
  const purchaseTotal = list
    .filter(r => recordTransactionType(r) !== 'refund')
    .reduce((sum, r) => sum + Math.abs(Number(r.twd) || 0), 0);
  const refundTotal = list
    .filter(r => recordTransactionType(r) === 'refund')
    .reduce((sum, r) => sum + Math.abs(Number(r.twd) || 0), 0);
  return purchaseTotal - refundTotal;
}

function donutBackground(parts){
  const total = parts.reduce((sum, p) => sum + Math.max(0, Number(p.value) || 0), 0);
  if(total <= 0) return 'conic-gradient(#e9f1f6 0 100%)';

  let cursor = 0;
  const stops = parts.filter(p => Number(p.value) > 0).map(p => {
    const start = cursor;
    cursor += (Number(p.value) / total) * 100;
    return `${p.color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
  });
  return `conic-gradient(${stops.join(',')})`;
}

function renderLegend(root, parts, total, showAmount = false){
  if(!root) return;
  root.innerHTML = parts.filter(p => Number(p.value) > 0).map(p => {
    const pct = total > 0 ? Math.round((Number(p.value) / total) * 100) : 0;
    const amountText = showAmount ? `<small>${analysisMoney(p.value)}</small>` : '';
    return `<div class="analysis-legend-row"><span class="analysis-dot" style="background:${p.color}"></span><span>${esc(p.label)}</span><strong>${pct}%${amountText}</strong></div>`;
  }).join('') || '<div class="analysis-empty-small">目前沒有可統計資料</div>';
}

function renderMonthComparison(selectedKey, currentNet){
  const box = document.getElementById('monthCompare');
  if(!box) return;

  const prevKey = previousMonthKey(selectedKey);
  const prevList = ccAnalysisMonthList(prevKey);
  const prevNet = netTotalForList(prevList);
  const currentLabel = selectedKey ? `${Number(selectedKey.slice(5))}月` : '本月';
  const prevLabel = prevKey ? `${Number(prevKey.slice(5))}月` : '上月';

  if(!prevList.length){
    box.innerHTML = `<div class="compare-main"><div><small>${currentLabel}淨支出</small><strong>${analysisMoney(currentNet)}</strong></div><div class="compare-change neutral">上月無資料</div></div><div class="compare-sub">尚無 ${prevLabel} 紀錄可比較</div>`;
    return;
  }

  let pctText = '持平';
  let changeClass = 'neutral';
  if(prevNet !== 0){
    const pct = ((currentNet - prevNet) / Math.abs(prevNet)) * 100;
    if(Math.abs(pct) >= 0.05){
      pctText = `${pct > 0 ? '↑' : '↓'} ${Math.abs(pct).toFixed(1)}%`;
      changeClass = pct > 0 ? 'up' : 'down';
    }
  }else if(currentNet !== 0){
    pctText = '上月為 0';
  }

  box.innerHTML = `<div class="compare-main"><div><small>${currentLabel}淨支出</small><strong>${analysisMoney(currentNet)}</strong></div><div class="compare-change ${changeClass}">${pctText}</div></div><div class="compare-sub">${prevLabel} ${analysisMoney(prevNet)} ・ 差額 ${analysisMoney(currentNet - prevNet)}</div>`;
}

function renderWeeklyTrend(list){
  const root = document.getElementById('dailyTrend');
  if(!root) return;

  const weekMap = {
    1:{label:'第1週', range:'1–7日', value:0},
    2:{label:'第2週', range:'8–14日', value:0},
    3:{label:'第3週', range:'15–21日', value:0},
    4:{label:'第4週', range:'22–月底', value:0}
  };

  let hasData = false;
  list.forEach(r => {
    const normalized = normalizeClientDate(r.date);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return;
    const day = Number(normalized.slice(8,10));
    const week = day <= 7 ? 1 : day <= 14 ? 2 : day <= 21 ? 3 : 4;
    weekMap[week].value += signedTwd(r);
    hasData = true;
  });

  if(!hasData){
    root.innerHTML = '<div class="analysis-empty-small">這個月份目前沒有每週支出資料</div>';
    return;
  }

  const weeks = Object.values(weekMap);
  const maxAbs = Math.max(...weeks.map(x => Math.abs(x.value)), 1);
  root.innerHTML = '<div class="weekly-list">' + weeks.map(w => {
    const width = w.value === 0 ? 0 : Math.max(3, Math.abs(w.value) / maxAbs * 100);
    const negative = w.value < 0 ? ' negative' : '';
    return '<div class="weekly-row"><div class="weekly-head"><span><b>' + w.label + '</b> <small>' + w.range + '</small></span><strong class="weekly-amount' + negative + '">' + analysisMoney(w.value) + '</strong></div><div class="weekly-track"><div class="weekly-fill' + negative + '" style="width:' + width + '%"></div></div></div>';
  }).join('') + '</div>';
}

function renderTopTransactions(list){
  const root = document.getElementById('topTransactions');
  if(!root) return;

  const top = list
    .filter(r => recordTransactionType(r) !== 'refund' && Math.abs(Number(r.twd) || 0) > 0)
    .sort((a,b) => Math.abs(Number(b.twd)||0) - Math.abs(Number(a.twd)||0))
    .slice(0,5);

  root.innerHTML = top.length ? top.map((r, index) => `
    <div class="top-spend-row">
      <div class="top-spend-rank">${index+1}</div>
      <div class="top-spend-main"><strong>${esc(r.item || '未命名項目')}</strong><small>${esc(r.date)}・${esc(r.bank)}${r.card ? `・${esc(r.card)}` : ''}</small></div>
      <div class="top-spend-amount">${analysisMoney(Math.abs(Number(r.twd)||0))}</div>
    </div>`).join('') : '<div class="analysis-empty-small">這個月份目前沒有可排行的消費紀錄</div>';
}


function renderMonthlyTransactionCounts(year, selectedKey){
  const root = document.getElementById('monthlyTransactionCounts');
  if(!root) return;
  const counts = Array.from({length:12}, (_, i) => ({
    month: i+1, key: `${year}-${String(i+1).padStart(2,'0')}`, purchase:0, refund:0
  }));
  if(year){
    ccAnalysisRecords(year).forEach(r => {
      const key = ccCycleStartKey(r);
      if(!key || !key.startsWith(year+'-')) return;
      const index = Number(key.slice(5,7))-1;
      if(index<0 || index>=12) return;
      if(recordTransactionType(r)==='refund') counts[index].refund++;
      else counts[index].purchase++;
    });
  }
  const total = counts.reduce((sum,m)=>sum+m.purchase+m.refund,0);
  const max = Math.max(1,...counts.map(m=>m.purchase+m.refund));
  const selected = counts.find(m=>m.key===selectedKey);
  const detail = selected ? `${selected.month}月：${selected.purchase+selected.refund} 筆（消費 ${selected.purchase}、退刷 ${selected.refund}）` : '';
  root.innerHTML = `<div class="monthly-count-summary"><strong>${esc(year||'—')} 年合計 ${total} 筆</strong><span>${detail}</span></div>`+
    '<div class="monthly-count-scroll"><div class="monthly-count-chart">'+counts.map(m=>{
      const n=m.purchase+m.refund;
      const height=n?Math.max(6,n/max*100):0;
      const purchaseHeight=n?m.purchase/n*100:0;
      const refundHeight=n?m.refund/n*100:0;
      const active=m.key===selectedKey?' active':'';
      return `<div class="monthly-count-column${active}" title="${m.month}月：${n}筆（消費${m.purchase}、退刷${m.refund}）"><strong>${n}</strong><div class="monthly-count-bar-area"><div class="monthly-count-bar" style="height:${height}%"><div class="monthly-count-purchase" style="height:${purchaseHeight}%"></div><div class="monthly-count-refund" style="height:${refundHeight}%"></div></div></div><span>${m.month}月</span></div>`;
    }).join('')+'</div></div><div class="monthly-count-legend"><span>● 消費筆數</span><span>● 退刷筆數</span></div>';
}

// 銀行已繳費歷史依「消費帳期月份」列示，不拿交易日期或刷／繳明細加總冒充銀行實繳。
// 各銀行「帳期消費」直接按 Google Sheets 原始分頁的交易明細加總。
// 與已繳帳單不同：未繳、未出帳的消費仍計入；退款/退刷抵扣。
// 備註「上期剩餘」已搬到本期分頁，只在新帳期計算一次。
let ccCycleSpendingByYear={};
let ccCycleRowsByYear={};
let ccCycleSpendingLoading=new Set();
let ccCycleSpendingErrors={};
const CC_CYCLE_SPENDING_CACHE_KEY='cc_cycle_spending_cache_v3_';
const CC_CYCLE_CHECK_MS=60000;
let ccCycleSpendingLastCheck={};
function ccReadCycleCache(year){
  try{
    const data=JSON.parse(localStorage.getItem(CC_CYCLE_SPENDING_CACHE_KEY+year)||'null');
    if(data?.year===year && data.totals && typeof data.totals==='object' && Array.isArray(data.rows))return data;
  }catch(_){}
  return null;
}
function ccStoreCycleCache(year,totals,dataVersion,rows){
  try{localStorage.setItem(CC_CYCLE_SPENDING_CACHE_KEY+year,JSON.stringify({year,totals,rows,dataVersion:dataVersion||'',savedAt:new Date().toISOString()}));}catch(_){}
}
function ccHydrateCycleCache(year){
  if(ccCycleSpendingByYear[year] && ccCycleRowsByYear[year])return;
  const cached=ccReadCycleCache(year);
  if(cached){ccCycleSpendingByYear[year]=cached.totals;ccCycleRowsByYear[year]=cached.rows;}
}
async function ccCheckCycleSpendingVersion(year){
  if(!year || ccCycleSpendingLoading.has(year) || !navigator.onLine)return;
  if(Date.now()-(ccCycleSpendingLastCheck[year]||0)<CC_CYCLE_CHECK_MS)return;
  ccCycleSpendingLastCheck[year]=Date.now();
  const cached=ccReadCycleCache(year);
  if(!cached){void ccLoadCycleSpending(year);return;}
  try{
    // 只抓輕量版本號，沒變化不下載整年度交易。
    const version=await fetchDataVersion(Number(year));
    if(!cached.dataVersion || cached.dataVersion!==version){
      await ccLoadCycleSpending(year,true);
    }
  }catch(err){console.warn('帳期消費版本檢查失敗，繼續顯示既有快取',err);}
}
function ccCycleStartKey(record){
  const source=String(record?.source?.sheetName||'');
  const match=source.match(/^(\d{2})\/(\d{2})\/\d{2}$/);
  return match?'20'+match[1]+'-'+match[2]:'';
}
function ccAnalysisRecords(year){
  ccHydrateCycleCache(year);
  return ccCycleRowsByYear[year] || [];
}
function ccAnalysisMonthList(key){
  if(!key)return [];
  return ccAnalysisRecords(key.slice(0,4)).filter(r=>ccCycleStartKey(r)===key);
}
function ccCycleSpendingTotals(rows,year){
  const banks=['中信','國泰','台新','富邦'];
  const totals={};
  for(let i=1;i<=12;i++){
    const key=year+'-'+String(i).padStart(2,'0');
    totals[key]=Object.fromEntries(banks.map(b=>[b,0]));
  }
  const seen=new Set();
  for(const r of rows){
    const key=ccCycleStartKey(r);
    if(!totals[key]||!banks.includes(r.bank))continue;
    const id=r.source?.spreadsheetId+'|'+r.source?.sheetName+'|'+r.source?.row;
    if(r.source?.row && seen.has(id))continue;
    if(r.source?.row)seen.add(id);
    const val=Number(r.twd);
    if(r.twd===null||r.twd===''||!Number.isFinite(val))continue;
    totals[key][r.bank]+=typeof signedTwd==='function'?signedTwd(r):val;
  }
  return totals;
}
async function ccLoadCycleSpending(year,force=false){
  if(!year || ccCycleSpendingLoading.has(year) || (!force && ccCycleSpendingByYear[year] && ccCycleRowsByYear[year]))return;
  ccCycleSpendingLoading.add(year);
  ccCycleSpendingErrors[year]='';
  try{
    const cloud=await fetchCloudRecords(Number(year),{cycleRead:true});
    const rows=ccUniqueSourceRecords(cloud.records).filter(r=>ccCycleStartKey(r).startsWith(year+'-'));
    const totals=ccCycleSpendingTotals(rows,year);
    ccCycleSpendingByYear[year]=totals;
    ccCycleRowsByYear[year]=rows;
    // 優先使用同次交易讀取回傳的資料版本；若沒有則查一次輕量版本。
    let version=cloud.dataVersion||'';
    if(!version){try{version=await fetchDataVersion(Number(year));}catch(_){}}
    ccStoreCycleCache(year,totals,version,rows);
    ccCycleSpendingLastCheck[year]=Date.now();
  }catch(err){
    ccCycleSpendingErrors[year]=err.message||'無法讀取交易資料';
  }finally{
    ccCycleSpendingLoading.delete(year);
    if(analysisYear===year)renderBankPaymentHistory(year);
  }
}
function renderBankPaymentHistory(year){
  const root=document.getElementById('bankPaymentHistory');
  if(!root)return;
  if(!year){root.innerHTML='<div class="analysis-empty-small">請選擇年份</div>';return;}
  ccHydrateCycleCache(year);
  if(!ccCycleSpendingByYear[year]){
    root.innerHTML='<div class="analysis-empty-small">'+(ccCycleSpendingErrors[year]?'Sheet 讀取失敗：'+esc(ccCycleSpendingErrors[year])+'。請重新進入分析頁再試。':'正在依 Google Sheets 帳期分頁計算四家銀行消費…')+'</div>';
    if(!ccCycleSpendingLoading.has(year) && !ccCycleSpendingErrors[year])void ccLoadCycleSpending(year);
    return;
  }
  const banks=['中信','國泰','台新','富邦'],totals=Object.fromEntries(banks.map(b=>[b,0]));
  const rows=Array.from({length:12},(_,i)=>{
    const key=year+'-'+String(i+1).padStart(2,'0'),amounts=ccCycleSpendingByYear[year][key]||{};
    let monthSum=0;
    const cells=banks.map(bank=>{
      const amount=Number(amounts[bank]||0);
      monthSum+=amount;totals[bank]+=amount;
      return '<td>'+analysisMoney(amount)+'</td>';
    }).join('');
    return '<tr'+(key===selectedAnalysisMonthKey()?' class="selected"':'')+'><th scope="row">'+(i+1)+'月</th>'+cells+'<td class="payment-total">'+analysisMoney(monthSum)+'</td></tr>';
  }).join('');
  const yearSum=banks.reduce((v,b)=>v+totals[b],0);
  root.innerHTML='<div class="payment-history-scroll"><table class="payment-history-table"><thead><tr><th scope="col">帳期月份</th>'+
    banks.map(b=>'<th scope="col">'+b+'</th>').join('')+'<th scope="col">合計</th></tr></thead><tbody>'+
    rows+'</tbody><tfoot><tr><th scope="row">全年合計</th>'+banks.map(b=>'<td>'+analysisMoney(totals[b])+'</td>').join('')+
    '<td class="payment-total">'+analysisMoney(yearSum)+'</td></tr></tfoot></table></div>'+
    '<div class="analysis-payment-note">依 Google Sheets 實際帳期分頁中的交易明細加總，消費減退刷；與「已繳費金額」不同。本期尚未繳費的交易也會列入；上期剩餘只在搬入的帳期計一次。</div>';
}
function renderAnalysis(){
  const root = document.getElementById('analysisPage');
  if(!root) return;

  const {years, months} = ensureAnalysisPeriod();
  const yearTabs = document.getElementById('analysisYearTabs');
  const monthTabs = document.getElementById('analysisMonthTabs');

  if(yearTabs){
    yearTabs.innerHTML = years.map(y => `<button class="chip ${y === analysisYear ? 'active' : ''}" data-analysis-year="${y}">${y}年</button>`).join('') || '<span class="analysis-empty-small">目前沒有年份資料</span>';
    yearTabs.querySelectorAll('[data-analysis-year]').forEach(btn => {
      btn.addEventListener('click', () => {
        analysisYear = btn.dataset.analysisYear;
        analysisMonth = '';
        renderAnalysis();
        void ccCheckCycleSpendingVersion(analysisYear);
      });
    });
  }

  if(monthTabs){
    monthTabs.innerHTML = months.map(m => `<button class="chip ${m === analysisMonth ? 'active' : ''}" data-analysis-month="${m}">${Number(m)}月</button>`).join('') || '<span class="analysis-empty-small">這個年份目前沒有月份資料</span>';
    monthTabs.querySelectorAll('[data-analysis-month]').forEach(btn => {
      btn.addEventListener('click', () => {
        analysisMonth = btn.dataset.analysisMonth;
        renderAnalysis();
      });
    });
  }

  const selectedKey = selectedAnalysisMonthKey();
  const list = ccAnalysisMonthList(selectedKey);
  const purchase = list.filter(r => recordTransactionType(r) !== 'refund');
  const refunds = list.filter(r => recordTransactionType(r) === 'refund');
  const purchaseTotal = purchase.reduce((sum, r) => sum + Math.abs(Number(r.twd) || 0), 0);
  const refundTotal = refunds.reduce((sum, r) => sum + Math.abs(Number(r.twd) || 0), 0);
  const netTotal = purchaseTotal - refundTotal;
  const pendingCount = list.filter(r => Number(r.foreign) !== 0 && !(Math.abs(Number(r.twd)) > 0)).length;

  const purchaseEl = document.getElementById('analysisPurchase');
  const refundEl = document.getElementById('analysisRefund');
  const netEl = document.getElementById('analysisNet');
  const pendingEl = document.getElementById('analysisPending');
  if(purchaseEl) purchaseEl.textContent = analysisMoney(purchaseTotal);
  if(refundEl) refundEl.textContent = analysisMoney(-refundTotal);
  if(netEl) netEl.textContent = analysisMoney(netTotal);
  if(pendingEl) pendingEl.textContent = `${pendingCount} 筆`;
  pendingEl?.closest('.analysis-stat')?.classList.toggle('hidden',pendingCount===0);

  renderBankPaymentHistory(analysisYear);
  renderMonthlyTransactionCounts(analysisYear, selectedKey);
  renderMonthComparison(selectedKey, netTotal);
  renderWeeklyTrend(list);
  renderTopTransactions(list);

  const bankColors = {
    '中信':'#94a8d8',
    '國泰':'#8fc7a7',
    '台新':'#e5a4a4',
    '富邦':'#e8c56f'
  };
  // 分母與「本月淨支出」使用相同淨額邏輯：消費加總扣除退刷，不能把退刷轉正加上。
  const bankParts = ['中信','國泰','台新','富邦'].map(bank => ({
    label: bank,
    color: bankColors[bank],
    value: list.filter(r => r.bank === bank).reduce((sum, r) => sum + signedTwd(r), 0)
  }));
  const bankTotal = bankParts.reduce((sum,p)=>sum+Math.max(0,p.value),0);
  // 銀行占比與上方帳期消費總額使用完全相同的 Sheet 分頁資料。
  const bankSumsCheck=bankParts.reduce((sum,p)=>sum+p.value,0);
  const bankShareInfo=document.getElementById('bankShareSource');
  if(bankShareInfo)bankShareInfo.textContent='依帳期月份 '+(selectedKey||'所選月份')+' 的 Sheet 交易，包含上期剩餘，消費扣除退刷'+(Math.round((bankSumsCheck-netTotal)*100)!==0?'；銀行加總與淨支出不一致，請重新讀取資料':'，各銀行合計 '+analysisMoney(bankSumsCheck));

  const bankDonut = document.getElementById('bankDonut');
  if(bankDonut) bankDonut.style.background = donutBackground(bankParts);
  const bankCenter = document.getElementById('bankDonutCenter');
  if(bankCenter) bankCenter.innerHTML = `<strong>${analysisMoney(netTotal)}</strong><span>淨支出</span>`;
  renderLegend(document.getElementById('bankLegend'), bankParts, bankTotal, true);
  const negativeBanks=bankParts.filter(p=>p.value<0);
  if(negativeBanks.length){
    const legend=document.getElementById('bankLegend');
    if(legend)legend.innerHTML+=negativeBanks.map(p=>'<div class="analysis-legend-row"><span class="analysis-dot" style="background:'+p.color+'"></span><span>'+esc(p.label)+'（淨退刷）</span><strong>'+analysisMoney(p.value)+'</strong></div>').join('');
  }

  const typeParts = [
    {label:'消費', value:purchaseTotal, color:'#75b7de'},
    {label:'退刷', value:refundTotal, color:'#dc8ea0'}
  ];
  const typeTotal = purchaseTotal + refundTotal;
  const typeDonut = document.getElementById('typeDonut');
  if(typeDonut) typeDonut.style.background = donutBackground(typeParts);
  const typeCenter = document.getElementById('typeDonutCenter');
  if(typeCenter) typeCenter.innerHTML = `<strong>${list.length}</strong><span>筆交易</span>`;
  renderLegend(document.getElementById('typeLegend'), typeParts, typeTotal);


}

const analysisOriginalRenderRecords = renderRecords;
renderRecords = function(){
  analysisOriginalRenderRecords();
  renderAnalysis();
};

document.querySelector('[data-page="analysisPage"]')?.addEventListener('click', ()=>{
  // 再次進入分析：沿用已成功讀取的帳期快取，背景只比對 Sheet 版本。
  renderAnalysis();
  if(analysisYear)void ccCheckCycleSpendingVersion(analysisYear);
});
renderAnalysis();
