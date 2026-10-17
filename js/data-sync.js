// Google Sheet 資料快取 + 雲端版本比對
// 目標：進站先秒開上次資料，只做輕量版本檢查；雲端有變更時再由使用者更新。

const RECORDS_CACHE_KEY = APP_CONFIG.storage.recordsCacheKey;

function normalizeTransactionType(record){
  const raw = String(record?.transactionType || record?.type || '').toLowerCase();
  if(['refund','退刷','退款'].includes(raw)) return 'refund';
  if(Number(record?.twd) < 0) return 'refund';
  return 'purchase';
}

function mapApiRecords(apiRecords){
  return (Array.isArray(apiRecords) ? apiRecords : []).map((r, index) => ({
    id: index + 1,
    bank: r.bank || '',
    card: r.card || '',
    date: normalizeClientDate(r.date || ''),
    item: r.item || '',
    twd: r.twd === '' || r.twd === undefined ? null : r.twd,
    currency: r.foreignCurrency || '',
    foreign: r.foreignAmount === '' || r.foreignAmount === undefined ? null : r.foreignAmount,
    status: r.status || '',
    note: r.note || '',
    transactionType: normalizeTransactionType(r),
    source: r.source || null
  }));
}

function readRecordsCache(year){
  try{
    const raw = localStorage.getItem(RECORDS_CACHE_KEY + '_' + year);
    if(!raw) return null;
    const cache = JSON.parse(raw);
    if(Number(cache.year) !== Number(year) || !Array.isArray(cache.records)) return null;
    cache.records = cache.records.map(r => ({
      ...r,
      transactionType: r.transactionType || (Number(r.twd) < 0 ? 'refund' : 'purchase')
    }));
    return cache;
  }catch(_){
    return null;
  }
}

function saveRecordsCache(year, dataVersion){
  try{
    localStorage.setItem(RECORDS_CACHE_KEY + '_' + year, JSON.stringify({
      year,
      dataVersion: dataVersion || '',
      savedAt: new Date().toISOString(),
      records
    }));
  }catch(err){
    console.warn('saveRecordsCache failed', err);
  }
}

function formatSyncTime(iso){
  if(!iso) return '';
  const d = new Date(iso);
  if(Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-TW', {
    month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false
  });
}

function renderCurrentRecords(syncText){
  const validDates = records.filter(r => monthKey(r.date)).length;
  setSyncInfo(syncText || `已載入 ${records.length} 筆，其中 ${validDates} 筆日期可辨識`);
  buildMonthTabs();
  renderRecords();
  renderPending();
}

function showCloudUpdateNotice(cloudVersion){
  setSyncInfo('雲端有新資料');
  const el = document.getElementById('syncInfo');
  if(!el) return;
  el.innerHTML = '';

  const text = document.createElement('span');
  text.textContent = 'Google Sheet 有新資料';
  text.style.fontWeight = '800';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = '更新資料';
  btn.style.cssText = 'float:right;border:0;border-radius:10px;padding:6px 10px;background:#74b9e6;color:white;font-weight:900;';
  btn.addEventListener('click', () => loadRecords({ force:true, knownVersion:cloudVersion }));

  el.append(text, btn);
}

async function fetchDataVersion(year){
  const response = await fetch(`${API_URL}?action=dataVersion&year=${year}&_=${Date.now()}`, { cache:'no-store' });
  if(!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if(!data.ok || !data.dataVersion) throw new Error(data.error || '無法取得資料版本');
  return String(data.dataVersion);
}

async function fetchCloudRecords(year){
  const response = await fetch(`${API_URL}?action=records&year=${year}&_=${Date.now()}`, { cache:'no-store' });
  if(!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if(!data.ok) throw new Error(data.error || 'GAS 回傳失敗');
  return mapApiRecords(data.records);
}

// 覆寫 app.js 原本每次都整包抓 Sheet 的 loadRecords。
loadRecords = async function(options = {}){
  const year = new Date().getFullYear();
  const force = Boolean(options.force);
  const cache = readRecordsCache(year);

  if(!force && cache){
    records = cache.records;
    renderCurrentRecords(`已顯示上次資料｜最後同步 ${formatSyncTime(cache.savedAt)}｜正在確認雲端…`);

    try{
      const cloudVersion = await fetchDataVersion(year);
      if(cache.dataVersion && cloudVersion === cache.dataVersion){
        setSyncInfo(`資料已是最新｜最後同步 ${formatSyncTime(cache.savedAt)}`);
      }else{
        showCloudUpdateNotice(cloudVersion);
      }
      return;
    }catch(err){
      console.warn('dataVersion unavailable, fallback to full refresh', err);
      // 舊後端還沒有 dataVersion 時，退回完整抓取，避免顯示舊資料。
    }
  }

  recordList.innerHTML = '<div class="empty">正在讀取 Google Sheet 資料…</div>';
  pendingList.innerHTML = '<div class="empty">正在讀取 Google Sheet 資料…</div>';
  setSyncInfo(force ? '正在更新 Google Sheet 資料…' : '正在連接 Google Sheet…');

  try{
    const freshRecords = await fetchCloudRecords(year);
    records = freshRecords;

    let cloudVersion = options.knownVersion || '';
    if(!cloudVersion){
      try{ cloudVersion = await fetchDataVersion(year); }catch(_){ cloudVersion = `legacy-${Date.now()}`; }
    }

    saveRecordsCache(year, cloudVersion);
    renderCurrentRecords(`已同步最新資料：${records.length} 筆｜${formatSyncTime(new Date().toISOString())}`);
  }catch(err){
    console.error('loadRecords error:', err);
    if(cache){
      records = cache.records;
      renderCurrentRecords(`雲端讀取失敗，先顯示上次資料｜${formatSyncTime(cache.savedAt)}`);
    }else{
      setSyncInfo(`讀取失敗：${err.message}`, true);
      const message = `<div class="empty">目前無法讀取 Google Sheet。<br><small>${esc(err.message)}</small></div>`;
      recordList.innerHTML = message;
      pendingList.innerHTML = message;
    }
  }
};
