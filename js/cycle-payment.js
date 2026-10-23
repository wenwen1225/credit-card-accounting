// 銀行已核對帳單繳費確認：與交易「刷／繳」分離，延後請款不會被誤標已繳。
// 只寫 GAS v2.7.4 Script Properties 的銀行繳費確認，不動任何交易 Sheet。
let ccCyclePaymentBusy=false;
function ccPayableCycle(bank,y,m){
  const cfg=APP_CONFIG.banks[bank];
  if(!cfg?.cycleStartDay || !cfg?.paymentDueDay)throw Error('找不到銀行帳期規則');
  const dueDate=new Date(y,m-1,cfg.paymentDueDay,12);
  if(cfg.firstPaymentDueDate && dateToInput(dueDate)<cfg.firstPaymentDueDate)throw Error(bank+' 第一筆帳單從 '+cfg.firstPaymentDueDate+' 才開始繳款，不能標記更早月份');
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
async function ccMarkCyclePaid(bank,y,m){
  if(ccCyclePaymentBusy)return;
  if(!navigator.onLine){alert('離線時無法確認銀行帳單繳費，請連線後再試');return;}
  ccCyclePaymentBusy=true;
  const button=[...document.querySelectorAll('.donePay')].find(x=>x.getAttribute('onclick')?.includes("markPaid('"+bank+"'"));
  if(button){button.disabled=true;button.textContent='正在核對銀行帳單…';}
  try{
    // 要求前後端均已支援獨立繳費紀錄；絕不回退到「把整期交易改成繳」。
    await ccRefreshStatementArchive();
    if(!ccStatementCloudReady || ccStatementBackendVersion!=='2.7.4' || !ccStatementPaymentRevision)
      throw Error('請先部署 GAS v2.7.4，才能使用安全的銀行帳單繳費確認');
    const month=y+'-'+pad(m);
    const amount=ccStatementArchive?.[month]?.[bank];
    if(typeof amount!=='number'||!Number.isFinite(amount))throw Error('此期尚未登記銀行正式帳單金額，請先核對金額');
    const done=ccStatementPayments?.[month]?.[bank];
    if(done?.paid && Number(done.amount)===amount)throw Error('此期銀行帳單已確認繳納，無需重複操作');
    const label=bank+'銀行帳單 '+month+'，正式應繳 NT$'+amount.toLocaleString('zh-TW');
    if(!confirm(label+'\n\n確定你已實際向銀行完成這筆繳費？\n\n這裡只同步「銀行帳單已繳」狀態，不會把延至下期的刷卡交易改成已繳。'))return;
    let deviceToken=typeof ccStatementDeviceToken==='function'?ccStatementDeviceToken():'';
    let adminKey='';
    if(!deviceToken){
      adminKey=prompt('請輸入 GAS 管理密碼以確認繳費（授權過的裝置不需重複輸入）：');
      if(adminKey===null)return;
      if(!adminKey)throw Error('未輸入管理密碼，已取消操作');
    }
    const response=await postToApi({action:'updateVerifiedPayment',bank,month,amount,
      statementRevision:ccStatementRevision,paymentRevision:ccStatementPaymentRevision,
      ...(deviceToken?{deviceToken}:{adminKey})});
    if(!response?.payments?.[month]?.[bank]?.paid || !response?.paymentRevision)
      throw Error('後端未確認繳費狀態，請重新讀取後再操作');
    ccStatementPayments=response.payments;
    ccStatementPaymentRevision=response.paymentRevision;
    ccCyclePaymentStatus(label+'：已同步銀行繳費確認');
    if(typeof renderBillingOverview==='function')renderBillingOverview();
    if(typeof renderReminders==='function')await renderReminders();
    alert('銀行帳單繳費已確認並同步至雲端。\n交易明細與延至下期的紀錄沒有被修改。');
  }catch(err){
    if(/裝置授權已過期|裝置授權無效|裝置授權已.*撤銷/.test(String(err.message||''))){
      try{localStorage.removeItem(CC_DEVICE_TOKEN_KEY);}catch(_){}
    }
    // 連線中斷時可能已成功寫入，先重新讀取；避免直接重送重複請求。
    try{await ccRefreshStatementArchive();}catch(_){}
    ccCyclePaymentStatus('繳費確認結果需核對：'+err.message);
    alert('繳費確認未完成或需核對：'+err.message+'\n請先查看網頁的銀行帳單狀態，不要直接重複按。');
  }finally{
    ccCyclePaymentBusy=false;
    if(button && button.isConnected){button.disabled=false;button.textContent='完成繳費';}
  }
}


// 已確認銀行付款後，額外同步該帳期 Sheet「刷→繳」；絕不包含延至下一期的交易。
let ccPaidTransactionsSyncBusy=false;
async function ccSyncPaidTransactions(bank,month){
  if(ccPaidTransactionsSyncBusy)return;
  if(!/^\d{4}-\d{2}$/.test(month)){alert('帳單月份不正確');return;}
  const [y,m]=month.split('-').map(Number);
  const cfg=APP_CONFIG.banks[bank];
  if(!cfg || !navigator.onLine){alert('銀行資料不正確或目前離線，無法同步');return;}
  if(typeof ccQueueBusy!=='undefined' && ccQueueBusy){alert('仍有交易正在同步，請先處理');return;}
  const queued=typeof ccQueueRead==='function'?ccQueueRead().filter(x=>x.record?.bank===bank):[];
  if(queued.length){alert(bank+'仍有 '+queued.length+' 筆待同步或待確認交易，請先處理');return;}
  let completed=0,total=0;
  ccPaidTransactionsSyncBusy=true;
  try{
    await ccRefreshStatementArchive();
    if(!ccStatementCloudReady || ccStatementBackendVersion!=='2.7.4')throw Error('目前無法確認 GAS v2.7.4 銀行帳單付款資料');
    const amount=ccStatementArchive?.[month]?.[bank];
    const confirmation=ccStatementPayments?.[month]?.[bank];
    if(typeof amount!=='number' || !Number.isFinite(amount) || !confirmation?.paid || Number(confirmation.amount)!==amount)
      throw Error('該期銀行帳單尚未確認已繳，不能修改交易');
    const cycle=ccPayableCycle(bank,y,m);
    const years=[...new Set([cycle.s.getFullYear(),cycle.e.getFullYear()])];
    const results=await Promise.all(years.map(year=>fetchCloudRecords(year,{cycleRead:true})));
    const rows=ccUniqueSourceRecords(results.flatMap(x=>x.records)).filter(r=>r.bank===bank && r.source?.sheetName===cycle.tab);
    if(!rows.length)throw Error('本期 Sheet 找不到交易，請確認資料分頁');
    const invalid=rows.filter(r=>r.twd===null || r.twd==='' || !Number.isFinite(Number(r.twd)) || !r.source?.rowHash);
    if(invalid.length)throw Error('本期有 '+invalid.length+' 筆金額或來源未確認，已停止以免誤改');
    const suspicious=rows.filter(r=>/(?:^|[｜\s])下期(?:$|[｜\s])|延至下期|延下期/.test(String(r.note||'')));
    if(suspicious.length)throw Error('本期還有 '+suspicious.length+' 筆備註「下期」的交易（例如 NT$149）；請先使用「延至下期」搬到下一期 Sheet，再執行進度同步');
    const totalAmount=rows.reduce((sum,r)=>sum+(r.transactionType==='refund'?-Math.abs(Number(r.twd)):Number(r.twd)),0);
    if(Math.round((totalAmount-amount)*100)!==0)
      throw Error('銀行已繳帳單 NT$'+amount.toLocaleString('zh-TW')+'，本期 Sheet 交易合計 NT$'+totalAmount.toLocaleString('zh-TW')+'，差額 NT$'+Math.abs(totalAmount-amount).toLocaleString('zh-TW')+'。請先核對並搬移延後交易，尚未修改任何進度');
    const pending=rows.filter(r=>(r.status||'刷')==='刷');
    total=pending.length;
    if(!total){alert(bank+' '+month+' 本期交易已全部標示「繳」，無須重複更新');return;}
    const range=fmtDate(cycle.s)+'～'+fmtDate(cycle.e);
    if(!confirm(bank+' '+month+' 銀行帳單 NT$'+amount.toLocaleString('zh-TW')+' 已確認繳費。\n本期 Sheet：'+cycle.tab+'（'+range+'）\n金額已核對相符，即將把 '+total+' 筆「刷」更新為「繳」。\n下一期 Sheet 交易不會修改。確定執行？'))return;
    for(const row of pending){
      ccCyclePaymentStatus(bank+' 進度同步 '+completed+'/'+total+' 筆');
      const result=await postToApi({action:'updateRecord',record:{...row,status:'繳',foreignCurrency:row.currency||'',foreignAmount:row.foreign??null}});
      if(!result?.record?.source?.rowHash)throw Error('後端未確認交易更新，請核對 Sheet');
      const updated=mapApiRecords([result.record])[0];
      if(typeof ccMarkLocalMutation==='function')ccMarkLocalMutation();
      const sourceKey=ccSourceKey(row.source);
      records=records.map(existing=>ccSourceKey(existing.source)===sourceKey?{...updated,id:existing.id}:existing);
      if(typeof ccConfirmedWrites!=='undefined')ccConfirmedWrites.delete(sourceKey);
      completed++;
    }
    await loadRecords({force:true});
    ccCyclePaymentStatus(bank+' '+month+' 已同步 '+completed+' 筆交易進度');
    alert('已將 '+completed+' 筆本期交易同步為「繳」。\n延至下期的交易仍保留「刷」，不會被修改。');
  }catch(err){
    ccCyclePaymentStatus('同步中止：'+completed+'/'+total+' 筆。請核對 Sheet');
    alert('交易進度同步未全部完成：'+err.message+'\n已成功 '+completed+'/'+total+' 筆。\n請先核對 Google Sheet；重新執行時會只更新仍為「刷」的本期交易。');
  }finally{
    ccPaidTransactionsSyncBusy=false;
    if(typeof renderBillingOverview==='function')renderBillingOverview();
  }
}
