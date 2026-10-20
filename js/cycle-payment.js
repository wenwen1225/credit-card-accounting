// 帳期繳費：只使用 GAS v2.5 已有的 updateRecord，逐筆確認成功後才完成提醒。
// 不新增後端動作；若中途失敗，已成功的交易保留「繳」，未成功者可再次執行。
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
function ccCyclePaymentStatus(text){
  const el=document.getElementById('ccCyclePaymentStatus');
  if(el)el.textContent=text;
}
async function ccMarkCyclePaid(bank,y,m){
  if(ccCyclePaymentBusy)return;
  const key=`${bank}-${y}-${pad(m)}`;
  // 不用裝置上的歷史 paid 註記阻止更新；每次以 Google Sheet 的最新交易為準。
  if(!navigator.onLine){alert('目前離線，無法確認 Google Sheet。請連線後再繳費。');return;}
  if(typeof ccQueueBusy!=='undefined' && ccQueueBusy){alert('仍有交易正在同步，請稍後再試。');return;}
  const queued=typeof ccQueueRead==='function'?ccQueueRead().filter(x=>x.record?.bank===bank):[];
  if(queued.length){alert(`${bank}還有 ${queued.length} 筆待同步或待確認交易，請先處理後再標記繳費。`);return;}
  let cycle;
  try{cycle=ccPayableCycle(bank,y,m);}catch(err){alert(err.message);return;}
  const label=`${bank}信用卡｜${fmtDate(cycle.s)}～${fmtDate(cycle.e)}`;
  ccCyclePaymentBusy=true;
  const button=[...document.querySelectorAll('.donePay')].find(x=>x.getAttribute('onclick')?.includes(`markPaid('${bank}'`));
  if(button){button.disabled=true;button.textContent='核對帳期中…';}
  let completed=0, total=0;
  try{
    // 每次按下繳費，都先讀最新 Sheet，不能以可能過時的本機快取直接批次修改。
    const years=[...new Set([cycle.s.getFullYear(),cycle.e.getFullYear()])];
    const results=await Promise.all(years.map(year=>fetchCloudRecords(year)));
    const all=results.flatMap(x=>x.records);
    const selected=all.filter(r=>r.bank===bank && r.source?.sheetName===cycle.tab);
    const inconsistent=selected.filter(r=>!inDateRange(r.date,cycle.s,cycle.e) && !/(?:^|[｜\n])\s*上期剩餘\s*(?:$|[｜\n])/.test(r.note||''));
    if(inconsistent.length)throw Error(`帳期分頁中有 ${inconsistent.length} 筆日期不符，為避免誤改請先核對 Sheet`);
    const pending=selected.filter(r=>(r.status||'刷')==='刷');
    const unsafe=pending.filter(r=>!r.source?.rowHash);
    if(unsafe.length)throw Error(`有 ${unsafe.length} 筆缺少來源驗證資訊，無法安全更新`);
    total=pending.length;
    if(!selected.length)throw Error('這個帳期的 Sheet 沒有找到交易，為避免誤標已繳，請先確認帳期分頁');
    if(!total)throw Error('Google Sheet 目前沒有狀態為「刷」的交易；沒有可更新的紀錄，不能僅憑本機狀態標記整期已繳。');
    const message=`${label}\n即將把本期 ${total} 筆「刷」改成「繳」，並同步 Google Sheet。\n${total===0?'本期沒有需要修改的「刷」紀錄，僅會完成繳費提醒。\n':''}確認執行？`;
    if(!confirm(message))return;
    for(const r of pending){
      ccCyclePaymentStatus(`${bank}帳期同步中：${completed}/${total} 筆`);
      const response=await postToApi({action:'updateRecord',record:{
        ...r,status:'繳',foreignCurrency:r.currency||'',foreignAmount:r.foreign??null
      }});
      if(!response.record?.source?.rowHash)throw Error('後端未回傳最新來源驗證資訊');
      const updated=mapApiRecords([response.record])[0];
      const sourceKey=ccSourceKey(r.source);
      if(typeof ccMarkLocalMutation==='function')ccMarkLocalMutation();
      records=records.map(x=>ccSourceKey(x.source)===sourceKey?{...updated,id:x.id}:x);
      if(typeof ccConfirmedWrites!=='undefined')ccConfirmedWrites.delete(sourceKey);
      completed++;
      // 逐筆保存成功進度；中斷後重新按會略過已標「繳」的交易。
      const displayYear=Number(window.ccSelectedDataYear||new Date().getFullYear());
      saveRecordsCache(displayYear,'');
      renderCurrentRecords(`${bank}帳期已更新 ${completed}/${total} 筆`);
    }
    // 僅在實際更新成功後保存本機操作記號；其他裝置仍以 Sheet 的「刷／繳」狀態判斷。
    paid[key]=true;
    persistPaid();
    renderReminders();
    ccCyclePaymentStatus(`${bank} ${fmtDate(cycle.s)}～${fmtDate(cycle.e)}：已完成繳費，${completed} 筆同步成功`);
    alert(`${label}\n完成繳費！${completed} 筆「刷」已同步改成「繳」。`);
  }catch(err){
    ccCyclePaymentStatus(`更新中斷：已成功 ${completed}/${total} 筆；繳費提醒尚未完成`);
    alert(`帳期更新未全部完成：${err.message}\n已成功 ${completed}/${total} 筆。\n請先檢查 Google Sheet；再次按「完成繳費」會重新核對並只處理仍是「刷」的交易。`);
  }finally{
    ccCyclePaymentBusy=false;
    if(button && !paid[key]){button.disabled=false;button.textContent='完成繳費';}
  }
}
