// 銀行已核對帳單繳費確認：與交易「刷／繳」分離，延後請款不會被誤標已繳。
// 只寫 GAS v2.7.4 Script Properties 的銀行繳費確認，不動任何交易 Sheet。
let ccCyclePaymentBusy=false;
function ccPayableCycle(bank,y,m){
  const cfg=APP_CONFIG.banks[bank];
  if(!cfg?.cycleStartDay || !cfg?.paymentDueDay)throw Error('找不到銀行帳期規則');
  const dueDate=new Date(y,m-1,cfg.paymentDueDay,12);
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
