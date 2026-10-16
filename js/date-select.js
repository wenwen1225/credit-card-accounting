(() => {
  const dateInput = document.getElementById('dateInp');
  const yearSel = document.getElementById('dateYear');
  const monthSel = document.getElementById('dateMonth');
  const daySel = document.getElementById('dateDay');

  if (!dateInput || !yearSel || !monthSel || !daySel) return;

  const pad = n => String(n).padStart(2, '0');

  function daysInMonth(year, month) {
    return new Date(Number(year), Number(month), 0).getDate();
  }

  function renderYears(selectedYear) {
    const currentYear = new Date().getFullYear();
    const start = currentYear - 2;
    const end = currentYear + 2;
    yearSel.innerHTML = '';
    for (let y = start; y <= end; y++) {
      const opt = document.createElement('option');
      opt.value = String(y);
      opt.textContent = `${y}年`;
      if (y === Number(selectedYear)) opt.selected = true;
      yearSel.appendChild(opt);
    }
  }

  function renderMonths(selectedMonth) {
    monthSel.innerHTML = '';
    for (let m = 1; m <= 12; m++) {
      const opt = document.createElement('option');
      opt.value = pad(m);
      opt.textContent = `${m}月`;
      if (m === Number(selectedMonth)) opt.selected = true;
      monthSel.appendChild(opt);
    }
  }

  function renderDays(selectedDay) {
    const maxDay = daysInMonth(yearSel.value, monthSel.value);
    const target = Math.min(Number(selectedDay) || 1, maxDay);
    daySel.innerHTML = '';
    for (let d = 1; d <= maxDay; d++) {
      const opt = document.createElement('option');
      opt.value = pad(d);
      opt.textContent = `${d}日`;
      if (d === target) opt.selected = true;
      daySel.appendChild(opt);
    }
  }

  function syncHiddenDate() {
    dateInput.value = `${yearSel.value}-${monthSel.value}-${daySel.value}`;
    dateInput.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function init() {
    const initial = /^\d{4}-\d{2}-\d{2}$/.test(dateInput.value)
      ? dateInput.value.split('-')
      : [new Date().getFullYear(), pad(new Date().getMonth() + 1), pad(new Date().getDate())];

    renderYears(initial[0]);
    renderMonths(initial[1]);
    renderDays(initial[2]);
    syncHiddenDate();
  }

  yearSel.addEventListener('change', () => {
    const oldDay = daySel.value;
    renderDays(oldDay);
    syncHiddenDate();
  });

  monthSel.addEventListener('change', () => {
    const oldDay = daySel.value;
    renderDays(oldDay);
    syncHiddenDate();
  });

  daySel.addEventListener('change', syncHiddenDate);

  init();
})();
