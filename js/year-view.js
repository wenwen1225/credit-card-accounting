// 紀錄月份顯示與年度視圖
// app.js 負責資料與互動；這裡只處理「年份＋月份」顯示與初始化。

buildMonthTabs = function(){
  const months = [...new Set(records.map(r => monthKey(r.date)).filter(Boolean))].sort().reverse();
  if(!currentMonth || !months.includes(currentMonth)) currentMonth = months[0] || '';

  monthTabs.innerHTML = months.map(m => {
    const [year, month] = m.split('-');
    const label = `${year}年${Number(month)}月`;
    return `<button class="chip ${m === currentMonth ? 'active' : ''}" data-m="${m}">${label}</button>`;
  }).join('');

  monthTabs.querySelectorAll('.chip').forEach(btn => btn.addEventListener('click', () => {
    currentMonth = btn.dataset.m;
    buildMonthTabs();
    renderRecords();
  }));
};

// 進站時確保使用最新 Sheet 資料。
loadRecords();
updateCycle();
renderReminders();
