// 分析頁：年份 / 月份 + 概況 + 銀行占比 + 消費/退刷 + 卡別排行 + 趨勢分析
// 純前端統計，直接使用目前已讀入的 records，不需要新增後端 API。

let analysisYear = '';
let analysisMonth = '';

function analysisMoney(value){
  const n = Number(value || 0);
  return `${n < 0 ? '-' : ''}NT$${Math.abs(Math.round(n)).toLocaleString()}`;
}

function analysisAvailableYears(){
  return [...new Set((Array.isArray(records) ? records : [])
    .map(r => monthKey(r.date))
    .filter(Boolean)
    .map(m => m.slice(0, 4)))].sort().reverse();
}

function analysisAvailableMonthsForYear(year){
  if(!year) return [];
  return [...new Set((Array.isArray(records) ? records : [])
    .map(r => monthKey(r.date))
    .filter(m => m && m.startsWith(`${year}-`))
    .map(m => m.slice(5, 7)))].sort((a,b) => Number(b) - Number(a));
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
  const prevList = (Array.isArray(records) ? records : []).filter(r => monthKey(r.date) === prevKey);
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
    (Array.isArray(records) ? records : []).forEach(r => {
      const key = monthKey(r.date);
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
  const list = (Array.isArray(records) ? records : []).filter(r => monthKey(r.date) === selectedKey);
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
  const bankParts = ['中信','國泰','台新','富邦'].map(bank => ({
    label: bank,
    color: bankColors[bank],
    value: list.filter(r => r.bank === bank).reduce((sum, r) => sum + Math.abs(signedTwd(r)), 0)
  }));
  const bankTotal = bankParts.reduce((sum, p) => sum + p.value, 0);
  const bankDonut = document.getElementById('bankDonut');
  if(bankDonut) bankDonut.style.background = donutBackground(bankParts);
  const bankCenter = document.getElementById('bankDonutCenter');
  if(bankCenter) bankCenter.innerHTML = `<strong>${analysisMoney(netTotal)}</strong><span>淨支出</span>`;
  renderLegend(document.getElementById('bankLegend'), bankParts, bankTotal, true);

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

  const cardMap = {};
  list.forEach(r => {
    if(r.bank!=='中信' || !r.card)return;
    const label = r.card;
    cardMap[label] = (cardMap[label] || 0) + Math.abs(signedTwd(r));
  });
  const cards = Object.entries(cardMap).sort((a,b) => b[1] - a[1]).slice(0, 6);
  const max = cards.length ? Math.max(...cards.map(x => x[1])) : 0;
  const cardRank = document.getElementById('cardRank');
  if(cardRank){
    cardRank.innerHTML = cards.length ? cards.map(([label, value], i) => `
      <div class="rank-row">
        <div class="rank-head"><span>${i+1}. ${esc(label)}</span><strong>${analysisMoney(value)}</strong></div>
        <div class="rank-track"><div class="rank-fill" style="width:${max ? Math.max(5, (value/max)*100) : 0}%"></div></div>
      </div>`).join('') : '<div class="analysis-empty-small">目前沒有卡別資料</div>';
  }
}

const analysisOriginalRenderRecords = renderRecords;
renderRecords = function(){
  analysisOriginalRenderRecords();
  renderAnalysis();
};

document.querySelector('[data-page="analysisPage"]')?.addEventListener('click', renderAnalysis);
renderAnalysis();
