// Google Sheet 資料快取 + 雲端版本比對
// 目標：進站先秒開上次資料，只做輕量版本檢查；雲端有變更時再由使用者更新。

const RECORDS_CACHE_KEY = APP_CONFIG.storage.recordsCacheKey;
// 帳務總覽同步狀態：不把本機快取誤稱為即時 Sheet 金額。
window.ccDataStatus = {kind:'loading',savedAt:null};
function ccSetDataStatus(kind,savedAt){
  window.ccDataStatus={kind,savedAt:savedAt||null};
  if(typeof renderBillingOverview==='function')renderBillingOverview();
}

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

// GAS 已確認寫入的交易立即顯示；重新讀取尚未回傳時不丟失已確認的交易。
const ccConfirmedWrites = new Map();
function ccSourceKey(source){
  if(!source || !source.spreadsheetId || !source.sheetName || !source.row)return '';
  return [source.spreadsheetId,source.sheetName,Number(source.row)].join('|');
}
function ccShowConfirmedWrite(record, response){
  const source=response?.record?.source;
  const key=ccSourceKey(source);
  if(!key)return false;
  const apiRecord={...record,...response.record,source};
  const normalized=mapApiRecords([apiRecord])[0];
  if(!normalized)return false;
  ccConfirmedWrites.set(key,normalized);
  const exists=records.some(r=>ccSourceKey(r.source)===key);
  if(!exists)records.unshift({...normalized,id:Math.max(0,...records.map(r=>Number(r.id)||0))+1});
  const year=Number(normalized.date.slice(0,4));
  if(year===Number(window.ccSelectedDataYear||new Date().getFullYear())){
    saveRecordsCache(year,'');
    ccSetDataStatus('confirmed-write',new Date().toISOString());
    renderCurrentRecords('已寫入 Sheet，紀錄已立即顯示；正在核對雲端資料…');
    ccSyncToolbar('已寫入 Sheet，紀錄已立即顯示；正在核對雲端資料…');
  }
  return true;
}
function ccMergeConfirmedWrites(fresh){
  const found=new Set(fresh.map(r=>ccSourceKey(r.source)));
  for(const [key,record] of ccConfirmedWrites){
    if(found.has(key)){ccConfirmedWrites.delete(key);continue;}
    if(Number(record.date.slice(0,4))===Number(window.ccSelectedDataYear))fresh.unshift({...record,id:fresh.length+1});
  }
  return fresh;
}

// 快取優先：重新整理網頁不主動讀取 Google Sheet；只有無快取或手動更新時才下載。
let ccLoadSequence = 0;
function ccSyncToolbar(message, isError = false){
  setSyncInfo(message, isError);
  const el = document.getElementById('syncInfo');
  if(!el) return;
  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.textContent = '從 Sheet 更新資料';
  refresh.className = 'cc-refresh-btn';
  refresh.addEventListener('click', () => loadRecords({force:true}));
  el.appendChild(refresh);
}

loadRecords = async function(options = {}){
  const year = Number(options.year || window.ccSelectedDataYear || new Date().getFullYear());
  window.ccSelectedDataYear = year;
  const force = Boolean(options.force);
  const cache = readRecordsCache(year);
  const seq = ++ccLoadSequence;

  if(!force && cache){
    records = cache.records;
    ccSetDataStatus('cache',cache.savedAt);
    renderCurrentRecords(`已顯示本機資料｜上次同步 ${formatSyncTime(cache.savedAt)}`);
    ccSyncToolbar(`已顯示本機資料｜上次同步 ${formatSyncTime(cache.savedAt)}`);
    return;
  }

  // 只有沒有快取、手動按更新，或成功同步完待處理紀錄才抓整年度資料。
  recordList.innerHTML = '<div class="empty">正在讀取 Google Sheet 資料…</div>';
  setSyncInfo('正在讀取 Google Sheet…');
  try{
    const freshRecords = await fetchCloudRecords(year);
    if(seq !== ccLoadSequence || year !== Number(window.ccSelectedDataYear)) return;
    records = ccMergeConfirmedWrites(freshRecords);
    ccSetDataStatus(ccConfirmedWrites.size?'confirmed-write':'fresh',new Date().toISOString());
    saveRecordsCache(year, '');
    const label=ccConfirmedWrites.size?'已更新雲端資料；剛寫入的交易已顯示，仍待讀取核對':'已同步 '+records.length+' 筆｜'+formatSyncTime(new Date().toISOString());
    renderCurrentRecords(label);
    ccSyncToolbar(label);
  }catch(err){
    if(seq !== ccLoadSequence) return;
    console.error('loadRecords error:', err);
    if(cache){
      records = cache.records;
      ccSetDataStatus('error-cache',cache.savedAt);
      renderCurrentRecords(`雲端讀取失敗，顯示本機資料｜${formatSyncTime(cache.savedAt)}`);
      ccSyncToolbar(`雲端讀取失敗，顯示本機資料｜${formatSyncTime(cache.savedAt)}`,true);
    }else{
      ccSetDataStatus('error',null);
      setSyncInfo('讀取失敗：'+err.message,true);
      recordList.innerHTML = '<div class="empty">目前無法讀取 Google Sheet。<small>'+esc(err.message)+'</small></div>';
      pendingList.innerHTML = recordList.innerHTML;
    }
  }
};

// 等所有顯示與篩選模組載入完成，才渲染快取，避免初次畫面漏掉年份分頁。
window.addEventListener('DOMContentLoaded', () => loadRecords());
