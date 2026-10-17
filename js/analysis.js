// 分析頁：本月概況 + 銀行占比 + 消費/退刷占比 + 卡別排行
// 純前端統計，直接使用目前已讀入的 records，不需要新增後端 API。

let analysisMonth = '';

function analysisMoney(value){
  const n = Number(value || 0);
  return `${n < 0 ? '-' : ''}NT$${Math.abs(n).toLocaleString()}`;
}

function analysisAvailableMonths(){
  return [...new Set((Array.isArray(records) ? records : []).map(r => monthKey(r.date)).filter(Boolean))].sort().reverse();
}

function ensureAnalysisMonth(){
  const months = analysisAvailableMonths();
  if(!analysisMonth || !months.includes(analysisMonth)){
    analysisMonth = (currentMonth && months.includes(currentMonth)) ? currentMonth : (months[0] || '');
  }
  return months;
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

function renderLegend(root, parts, total){
  if(!root) return;
  root.innerHTML = parts.filter(p => Number(p.value) > 0).map(p => {
    const pct = total > 0 ? Math.round((Number(p.value) / total) * 100) : 0;
    return `<div class="analysis-legend-row"><span class="analysis-dot" style="background:${p.color}"></span><span>${esc(p.label)}</span><strong>${pct}%</strong></div>`;
  }).join('') || '<div class="analysis-empty-small">目前沒有可統計資料</div>';
}

function renderAnalysis(){
  const root = document.getElementById('analysisPage');
  if(!root) return;

  const months = ensureAnalysisMonth();
  const monthTabs = document.getElementById('analysisMonthTabs');
  if(monthTabs){
    monthTabs.innerHTML = months.map(m => `<button class="chip ${m === analysisMonth ? 'active' : ''}" data-analysis-month="${m}">${Number(m.slice(5))}月</button>`).join('') || '<span class="analysis-empty-small">目前沒有月份資料</span>';
    monthTabs.querySelectorAll('[data-analysis-month]').forEach(btn => {
      btn.addEventListener('click', () => {
        analysisMonth = btn.dataset.analysisMonth;
        renderAnalysis();
      });
    });
  }

  const list = (Array.isArray(records) ? records : []).filter(r => monthKey(r.date) === analysisMonth);
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
  renderLegend(document.getElementById('bankLegend'), bankParts, bankTotal);

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
    const label = r.card ? `${r.bank}・${r.card}` : r.bank;
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
