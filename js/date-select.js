(() => {
  const pad = n => String(n).padStart(2, '0');

  function daysInMonth(year, month) {
    return new Date(Number(year), Number(month), 0).getDate();
  }

  function setupDateSelectors({ hiddenId, yearId, monthId, dayId, dispatchChange = false }) {
    const hidden = document.getElementById(hiddenId);
    const yearSel = document.getElementById(yearId);
    const monthSel = document.getElementById(monthId);
    const daySel = document.getElementById(dayId);
    if (!hidden || !yearSel || !monthSel || !daySel) return null;

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
      hidden.value = `${yearSel.value}-${monthSel.value}-${daySel.value}`;
      if (dispatchChange) hidden.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function setDate(value) {
      const now = new Date();
      const initial = /^\d{4}-\d{2}-\d{2}$/.test(value || '')
        ? value.split('-')
        : [String(now.getFullYear()), pad(now.getMonth() + 1), pad(now.getDate())];

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

    setDate(hidden.value);
    return { setDate };
  }

  setupDateSelectors({
    hiddenId: 'dateInp',
    yearId: 'dateYear',
    monthId: 'dateMonth',
    dayId: 'dateDay',
    dispatchChange: true
  });

  const editSelectors = setupDateSelectors({
    hiddenId: 'editDate',
    yearId: 'editDateYear',
    monthId: 'editDateMonth',
    dayId: 'editDateDay',
    dispatchChange: false
  });

  // app.js 會在打開修改視窗時先把原始日期寫進 editDate；
  // 監看彈窗開啟，再把三個下拉選單同步成該筆日期。
  const editModal = document.getElementById('editModal');
  if (editModal && editSelectors) {
    const observer = new MutationObserver(() => {
      if (editModal.classList.contains('show')) editSelectors.setDate(document.getElementById('editDate')?.value || '');
    });
    observer.observe(editModal, { attributes: true, attributeFilter: ['class'] });
  }
})();
