// 紀錄年份 / 月份分離顯示
// app.js 負責資料與互動；這裡覆寫月份列，改成「年份一排、月份一排」。

let currentYear = '';

buildMonthTabs = function(){
  const monthKeys = [...new Set(records.map(r => monthKey(r.date)).filter(Boolean))].sort().reverse();
  const years = [...new Set([...monthKeys.map(m => m.slice(0, 4)), ...(typeof ccAvailableYears !== 'undefined' ? ccAvailableYears.map(String) : [])])].sort().reverse();

  if(!currentYear || !years.includes(currentYear)){
    currentYear = String(window.ccSelectedDataYear || new Date().getFullYear());\n    if(!years.includes(currentYear)) currentYear = years[0] || '';
  }

  const monthsInYear = monthKeys.filter(m => m.startsWith(`${currentYear}-`));
  if(!currentMonth || !monthsInYear.includes(currentMonth)){
    currentMonth = monthsInYear[0] || '';
  }

  const yearTabs = document.getElementById('yearTabs');
  if(yearTabs){
    yearTabs.innerHTML = years.map(year =>
      `<button class="chip ${year === currentYear ? 'active' : ''}" data-y="${year}">${year}年</button>`
    ).join('');

    yearTabs.querySelectorAll('.chip').forEach(btn => btn.addEventListener('click', () => {
      currentYear = btn.dataset.y;
      window.ccSelectedDataYear = Number(currentYear);
      currentMonth = '';
      loadRecords({year:Number(currentYear),force:true});
    }));
  }

  monthTabs.innerHTML = monthsInYear.map(m => {
    const month = Number(m.slice(5));
    return `<button class="chip ${m === currentMonth ? 'active' : ''}" data-m="${m}">${month}月</button>`;
  }).join('');

  monthTabs.querySelectorAll('.chip').forEach(btn => btn.addEventListener('click', () => {
    currentMonth = btn.dataset.m;
    buildMonthTabs();
    renderRecords();
  }));
};

// 進站時讀取最新 Sheet 資料。
loadRecords();
updateCycle();
renderReminders();
