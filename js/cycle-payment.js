// 單一帳單完成流程：先核對本期應繳及下期交易，確認後才寫入。
// 已確認銀行繳費者可重按來補完 Sheet 同步，不會重複記錄銀行繳費。
let ccCyclePaymentBusy=false;

function ccChooseActualPaidDate(bank,month){
  return new Promise(resolve=>{
    const backdrop=document.createElement('div');
    backdrop.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.52);z-index:100000;display:flex;align-items:center;justify-content:center;padding:20px';
    const panel=document.createElement('div');
    panel.style.cssText='background:#fff;color:#202124;border-radius:16px;padding:22px;width:min(100%,380px);box-shadow:0 12px 45px rgba(0,0,0,.25)';
    const title=document.createElement('h3');title.textContent='確認實際繳費日期';title.style.margin='0 0 10px';
    const description=document.createElement('p');description.textContent=bank+' '+month+'：請選擇銀行實際扣款或繳費日期，不是操作網站的日期。';description.style.cssText='line-height:1.6;margin:0 0 14px';
    const input=document.createElement('input');input.type='date';input.required=true;input.max=dateToInput(new Date());input.setAttribute('aria-label','實際繳費日期');input.style.cssText='box-sizing:border-box;width:100%;padding:12px;font-size:16px;border:1px solid #aaa;border-radius:9px;color:inherit';
    const warning=document.createElement('p');warning.style.cssText='font-size:13px;min-height:18px;margin:7px 0;color:#b42318';
    const actions=document.createElement('div');actions.style.cssText='display:flex;gap:10px;justify-content:flex-end;margin-top:12px';
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='取消';cancel.style.cssText='padding:10px 18px;border-radius:9px';
    const ok=document.createElement('button');ok.type='button';ok.textContent='確認日期';ok.style.cssText='padding:10px 18px;border-radius:9px;background:#6e5acb;color:white;border:0';
    const done=value=>{document.removeEventListener('keydown',onKey);backdrop.remove();resolve(value)};
    const onKey=e=>{if(e.key==='Escape')done(null)};
    cancel.addEventListener('click',()=>done(null));
    ok.addEventListener('click',()=>{if(!input.value||input.value>input.max){warning.textContent='請選擇有效且不晚於今天的實際繳費日期';return;}done(input.value)});
    backdrop.addEventListener('click',e=>{if(e.target===backdrop)done(null)});
    actions.append(cancel,ok);panel.append(title,description,input,warning,actions);backdrop.append(panel);document.body.append(backdrop);document.addEventListener('keydown',onKey);input.focus();
  });
}

function ccPayableCycle(bank,y,m){
  const cfg=APP_CONFIG.banks[bank];
  if(!cfg?.cycleStartDay || !cfg?.paymentDueDay)throw Error('找不到銀行帳期規則');
  const dueDate=new Date(y,m-1,cfg.paymentDueDay,12);
  if(cfg.firstPaymentDueDate && dateToInput(dueDate)<cfg.firstPaymentDueDate)throw Error(bank+' 第一筆帳單從 '+cfg.firstPaymentDueDate+' 才開始繳款');
  if(dueDate.getMonth()!==m-1)throw Error('繳費月份不正確');
  const current=getBankCycle(bank,dateToInput(dueDate));
  const lastDay=new Date(current.s);
  lastDay.setDate(lastDay.getDate()-1);
  return getBankCycle(bank,dateToInput(lastDay));
}
function ccCyclePaymentStatus(message){
  const el=document.getElementById('ccCyclePaymentStatus');
  if(el)el.textContent=message;
}
const CC_DEFER_NOTE=/(?:^|[｜\s])下期(?:$|[｜\s])|延至下期|延下期/;
function ccBillAmount(rows){
  return rows.reduce((n,r)=>n+(r.transactionType==='refund'?-Math.abs(Number(r.twd)):Number(r.twd)),0);
}
async function ccMarkCyclePaid(bank,y,m){
  return ccFinishCycleBill(bank,y+'-'+pad(m));
}
async function ccSyncPaidTransactions(bank,month){
  // 舊版已繳帳單的補做入口，使用完全相同的單一流程。
  return ccFinishCycleBill(bank,month);
}
async function ccFinishCycleBill(bank,month){
  if(ccCyclePaymentBusy)return;
  if(!/^\d{4}-\d{2}$/.test(month)){alert('帳單月份不正確');return;}
  if(!APP_CONFIG.banks[bank] || !navigator.onLine){alert('銀行設定錯誤或目前離線');return;}
  if(typeof ccQueueBusy!=='undefined' && ccQueueBusy){alert('尚有交易正在同步，請先完成');return;}
  const queue=typeof ccQueueRead==='function'?ccQueueRead().filter(x=>x.record?.bank===bank):[];
  if(queue.length){alert(bank+' 仍有 '+queue.length+' 筆待同步交易，請先處理');return;}
  ccCyclePaymentBusy=true;
  const buttons=[...document.querySelectorAll('.donePay, .billing-sync-paid')].filter(b=>
    b.getAttribute('onclick')?.includes("markPaid('"+bank+"'") || b.dataset.bank===bank);
  buttons.forEach(b=>{b.disabled=true;b.textContent='核對本期帳務中…';});
  let moved=0,updated=0,planned=0;
  try{
    // 跨裝置資料一律重新從 GAS 讀取，不根據快取做修改。
    await ccRefreshStatementArchive();
    if(!ccStatementCloudReady || !/^2\.7\.(?:1[1-9]|[2-9]\d)$/.test(ccStatementBackendVersion) || !ccStatementPaymentRevision)
      throw Error('請先部署 GAS v2.7.11（或相容新版）後，再執行帳單繳費同步');
    const [y,m]=month.split('-').map(Number);
    const cycle=ccPayableCycle(bank,y,m);
    const amount=ccStatementArchive?.[month]?.[bank];
    if(typeof amount!=='number' || !Number.isFinite(amount) || amount<=0)
      throw Error('本期沒有已核對的正數銀行帳單，無需繳費');
    const payment=ccStatementPayments?.[month]?.[bank];
    const alreadyPaid=payment?.paid===true && Number(payment.amount)===amount;
    const fetchCycle=async()=>{
      const response=await fetch(`${API_URL}?action=cycleRecords&bank=${encodeURIComponent(bank)}&tab=${encodeURIComponent(cycle.tab)}&_=${Date.now()}`,{cache:'no-store'});
      if(!response.ok)throw Error('帳期讀取失敗 HTTP '+response.status);
      const data=await response.json();
      if(!data.ok || !Array.isArray(data.records))throw Error(data.error||'帳期讀取失敗');
      return ccUniqueSourceRecords(mapApiRecords(data.records));
    };
    let rows=await fetchCycle();
    if(!rows.length)throw Error('找不到 '+cycle.tab+' 的交易，請確認 Google Sheet');
    const invalid=rows.filter(r=>r.twd===null || r.twd==='' || !Number.isFinite(Number(r.twd)) || !r.source?.rowHash);
    if(invalid.length)throw Error('帳期內有 '+invalid.length+' 筆金額或來源驗證不完整，已停止修改');
    // 真正帳期以 Sheet 分頁為準；補登及入帳日晚於結帳日不在此阻擋。
    const deferred=rows.filter(r=>(r.status||'刷')==='刷' && CC_DEFER_NOTE.test(String(r.note||'')));
    const markedButPaid=rows.filter(r=>(r.status||'刷')!=='刷' && CC_DEFER_NOTE.test(String(r.note||'')));
    if(markedButPaid.length)throw Error('有 '+markedButPaid.length+' 筆備註延至下期但已標「繳」，需要先人工核對');
    const currentRows=rows.filter(r=>!deferred.includes(r));
    const subtotal=ccBillAmount(currentRows);
    if(Math.round((subtotal-amount)*100)!==0)
      throw Error('銀行本期 NT$'+amount.toLocaleString('zh-TW')+'，排除待延後交易後 Sheet 為 NT$'+subtotal.toLocaleString('zh-TW')+'，差額 NT$'+Math.abs(subtotal-amount).toLocaleString('zh-TW')+'。請先確認哪些交易延後，尚未修改資料');
    // v2.7.4 會拒絕修改「日期屬於下期、但實際入帳在本期分頁」的交易進度。
    // 先攔截，避免只同步部分交易後才發現；v2.7.5 允許僅改狀態。
    const misplacedStatusRows=currentRows.filter(r=>(r.status||'刷')==='刷'
      && getBankCycle(bank,r.date).tab!==cycle.tab
      && !String(r.note||'').includes('上期剩餘'));
    // 新版 GAS 允許跨帳期入帳交易僅更新進度。
    const initialCount=currentRows.length;
    const alreadyMarked=currentRows.filter(r=>(r.status||'刷')==='繳').length;
    const unexpectedStatuses=currentRows.filter(r=>!['刷','繳'].includes(r.status||'刷'));
    if(unexpectedStatuses.length)throw Error('本期有 '+unexpectedStatuses.length+' 筆未知交易狀態，請先核對');
    const pending=currentRows.filter(r=>(r.status||'刷')==='刷');
    planned=pending.length;
    if(alreadyPaid && !deferred.length && !pending.length){if(typeof renderReminders==='function')await renderReminders();alert(bank+' '+month+' 已完成繳費，Sheet 全部交易也已是「繳」，不需重複操作。');return;}
    const names=deferred.map(r=>'・'+r.item+'　NT$'+Number(r.twd).toLocaleString('zh-TW')).join('\n');
    const confirmText = [
      bank+' '+month+' 帳單 NT$'+amount.toLocaleString('zh-TW'),
      alreadyPaid?'銀行繳費：已確認（不會重複繳費）':'銀行繳費：確認你已實際繳納這期帳單',
      deferred.length?'延至下期 '+deferred.length+' 筆：'+names:'',
      '本期 Sheet 交易：'+initialCount+' 筆',
      '本期 Sheet 合計：NT$'+subtotal.toLocaleString('zh-TW'),
      '已標記「繳」：'+alreadyMarked+' 筆',
      '待同步「刷→繳」：'+pending.length+' 筆',
      '只有總額符合銀行帳單才會執行，完成後會重新核對全部交易。確定執行？'
    ].filter(Boolean).join(String.fromCharCode(10));
    if(!confirm(confirmText))return;
    // 每筆搬移均由 GAS 寫入下一期、刪除本期原行並加註「上期剩餘」。
    for(const row of deferred){
      ccCyclePaymentStatus(bank+' 搬移延後請款 '+(moved+1)+'/'+deferred.length);
      const response=await postToApi({action:'moveRecordToNextCycle',source:row.source});
      if(!response?.record?.source?.rowHash)throw Error('延後交易搬移結果未確認，請檢查兩期 Sheet');
      moved++;
      if(typeof ccMarkLocalMutation==='function')ccMarkLocalMutation();
    }
    // 重新讀取以確認延後的交易真的離開本期，金額仍一致。
    rows=await fetchCycle();
    if(rows.some(r=>CC_DEFER_NOTE.test(String(r.note||''))))throw Error('仍有備註「下期」的交易在原帳期，請先核對');
    if(Math.round((ccBillAmount(rows)-amount)*100)!==0)
      throw Error('搬移後帳期合計與銀行帳單不相符，已停止交易進度修改');
    if(rows.length!==initialCount)throw Error('搬移後本期交易筆數異常：原 '+initialCount+' 筆，現 '+rows.length+' 筆，已停止修改');
    const expectedIds=new Set(rows.map(r=>[r.source?.spreadsheetId,r.source?.sheetName,r.source?.row].join('|')));
    if(expectedIds.size!==rows.length)throw Error('本期交易來源列號重複，已停止修改');
    for(const row of rows.filter(r=>(r.status||'刷')==='刷')){
      ccCyclePaymentStatus(bank+' 更新交易進度 '+(updated+1)+'/'+planned);
      const result=await postToApi({action:'updateRecord',record:{...row,status:'繳',foreignCurrency:row.currency||'',foreignAmount:row.foreign??null}});
      if(!result?.record?.source?.rowHash)throw Error('交易進度未獲後端確認，請檢查 Sheet');
      updated++;
      if(typeof ccMarkLocalMutation==='function')ccMarkLocalMutation();
    }
    // 真正再次從 Sheet 核對，而不是僅憑 POST 成功或瀏覽器快取宣稱同步完成。
    const verifiedRows=await fetchCycle();
    if(verifiedRows.length!==rows.length)throw Error('Sheet 回讀交易筆數不符：預期 '+rows.length+' 筆，實際 '+verifiedRows.length+' 筆');
    const verifiedIds=new Set(verifiedRows.map(r=>[r.source?.spreadsheetId,r.source?.sheetName,r.source?.row].join('|')));
    if(verifiedIds.size!==expectedIds.size || [...expectedIds].some(id=>!verifiedIds.has(id)))throw Error('Sheet 回讀交易來源不一致，請先核對');
    const unconfirmed=verifiedRows.filter(r=>(r.status||'刷')!=='繳');
    if(unconfirmed.length)throw Error('Google Sheet 回讀後仍有 '+unconfirmed.length+' 筆未顯示「繳」，請確認 G 欄狀態；本次已更新 '+updated+' 筆');
    if(Math.round((ccBillAmount(verifiedRows)-amount)*100)!==0)
      throw Error('Sheet 回讀金額與銀行帳單不符，請核對後再操作');
    // 交易回讀核對成功後，最後才確認整期已繳。
    if(!alreadyPaid){
      let deviceToken=typeof ccStatementDeviceToken==='function'?ccStatementDeviceToken():'';
      let adminKey='';
      if(!deviceToken){
        adminKey=prompt('請輸入 GAS 管理密碼以確認本期繳費：');
        if(adminKey===null)return;
        if(!adminKey)throw Error('管理密碼未輸入');
      }
      const paidDate=await ccChooseActualPaidDate(bank,month);
      if(!paidDate)throw Error('未選擇實際繳費日期；交易已同步，但帳單尚未標記繳清');
      const confirmation=await postToApi({action:'updateVerifiedPayment',bank,month,amount,paidDate,
        statementRevision:ccStatementRevision,paymentRevision:ccStatementPaymentRevision,
        ...(deviceToken?{deviceToken}:{adminKey})});
      if(!confirmation?.payments?.[month]?.[bank]?.paid || !confirmation.paymentRevision)
        throw Error('後端未確認本期繳費狀態，請先檢查再重試');
      ccStatementPayments=confirmation.payments;
      ccStatementPaymentRevision=confirmation.paymentRevision;
    }
    await loadRecords({force:true});
    if(typeof renderReminders==='function')await renderReminders();
    if(typeof renderBillingOverview==='function')renderBillingOverview();
    ccCyclePaymentStatus(bank+' '+month+' 帳務已完成同步');
    alert([
      '已完成本期帳務！',
      '銀行帳單：NT$'+amount.toLocaleString('zh-TW'),
      'Sheet 總筆數：'+verifiedRows.length+' 筆',
      '全部已繳：'+verifiedRows.length+'/'+verifiedRows.length+' 筆',
      '實際繳費日期：'+(ccStatementPayments?.[month]?.[bank]?.paidDate||'保留原繳費紀錄'),
      '本次更新：'+updated+' 筆；延至下期：'+moved+' 筆。'
    ].join(String.fromCharCode(10)));
  }catch(err){
    // 逐筆寫入可能部分成功；雲端重讀後再執行，已完成的部分不會重複更新。
    try{await loadRecords({force:true});}catch(_){}
    try{await ccRefreshStatementArchive();}catch(_){}
    ccCyclePaymentStatus('帳務整理中斷：延後 '+moved+' 筆，更新 '+updated+' 筆');
    alert('帳務整理尚未全部完成：'+err.message+
      '\n已搬移 '+moved+' 筆、更新 '+updated+' 筆。\n請先確認 Sheet，再重按同一個按鈕補完。');
  }finally{
    ccCyclePaymentBusy=false;
    if(typeof renderBillingOverview==='function')renderBillingOverview();
    buttons.forEach(b=>{if(b.isConnected){b.disabled=false;b.textContent='完成本期繳費';}});
  }
}

