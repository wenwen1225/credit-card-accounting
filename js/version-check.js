// 前後端版本比對：沿用旅遊記帳的概念
// 顯示網站版本、Apps Script 版本與一致性，並可手動重新檢查。

async function checkAppVersion(){
  const status = document.getElementById('versionStatus');
  const detail = document.getElementById('versionDetail');
  const button = document.getElementById('checkVersionBtn');
  if(!status || !detail) return;

  const frontend = APP_CONFIG.version.frontend;
  const expected = APP_CONFIG.version.expectedBackend;

  status.className = 'version-state checking';
  status.textContent = '檢查中';
  detail.textContent = `網站 ${frontend}｜需要後端 v${expected}`;
  if(button){ button.disabled = true; button.textContent = '檢查中…'; }

  try{
    const response = await fetch(`${APP_CONFIG.apiUrl}?action=health&_=${Date.now()}`, { cache:'no-store' });
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if(!data.ok) throw new Error(data.error || '版本檢查失敗');

    const backend = String(data.version || '').replace(/^v/i, '');
    const matched = backend === String(expected).replace(/^v/i, '');

    detail.textContent = `網站 ${frontend}｜Apps Script v${backend || '未知'}`;
    status.className = `version-state ${matched ? 'ok' : 'mismatch'}`;
    status.textContent = matched ? '版本一致' : '版本不一致';
  }catch(err){
    status.className = 'version-state error';
    status.textContent = '檢查失敗';
    detail.textContent = `網站 ${frontend}｜無法取得 Apps Script 版本`;
  }finally{
    if(button){ button.disabled = false; button.textContent = '檢查版本'; }
  }
}

document.getElementById('checkVersionBtn')?.addEventListener('click', checkAppVersion);
checkAppVersion();
setInterval(checkAppVersion, 60000);
