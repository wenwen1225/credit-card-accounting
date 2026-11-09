// 海外手續費背景修改佇列：僅適用於「其他欄位完全不變」的補登。
// 同一時間只送出一筆，保留 rowHash 驗證。網路錯誤時不自動重試，避免重覆寫入。
const CC_FEE_EDIT_QUEUE_KEY='cc_fee_edits_v1';
let ccFeeEditBusy=false;
let ccFeeEditQueue=[];
let ccFeeEditAlert='';
function ccFeeEditSourceKey(source){
  if(!source?.spreadsheetId||!source?.sheetName||!source?.row)return '';
  return [source.spreadsheetId,source.sheetName,source.row].join('|');
}
function ccFeeEditStorageRead(){
  try {
    const saved=JSON.parse(localStorage.getItem(CC_FEE_EDIT_QUEUE_KEY)||'[]');
    return Array.isArray(saved)?saved:[];
  } catch(e){console.warn('無法讀取手續費待同步紀錄',e);return [];}
}
function ccFeeEditPersist(){
  localStorage.setItem(CC_FEE_EDIT_QUEUE_KEY,JSON.stringify(ccFeeEditQueue));
}
function ccFeeEditIsPending(source){
  const key=ccFeeEditSourceKey(source);
  return Boolean(key&&ccFeeEditQueue.some(x=>x.key===key));
}
function ccIsFeeOnlyEdit(before,after){
  if(!before?.source?.rowHash||!after)return false;
  if(!ccFeeCanEdit(before)||!Number(before.foreign))return false;
  if(recordTransactionType(before)!=='purchase'||recordTransactionType(after)!=='purchase')return false;
  const oldFee=Number(before.overseasFee)||0;
  const nextFee=Number(after.overseasFee)||0;
  if(!Number.isFinite(nextFee)||nextFee===oldFee||nextFee<0)return false;
  const oldOriginal=Math.abs(Number(before.twd)||0)-oldFee;
  const same=(x,y)=>String(x??'')===String(y??'');
  return Math.abs(oldOriginal-Number(after.twd))<0.005 &&
    same(before.bank,after.bank)&&same(before.card,after.card)&&
    same(before.date,after.date)&&same(before.item,after.item)&&
    same(before.status,after.status)&&same(before.note,after.note)&&
    same(before.currency,after.currency)&&
    Math.abs(Number(before.foreign)-Number(after.foreign))<0.005;
}
function ccIsAmountOnlyEdit(before,after){
  if(!before?.source?.rowHash||!after||!(Number(after.twd)>0))return false;
  if(recordTransactionType(before)!==recordTransactionType(after))return false;
  const oldFee=Number(before.overseasFee)||0, newFee=Number(after.overseasFee)||0;
  if(Math.abs(oldFee-newFee)>0.005)return false;
  const oldAmount=Math.abs(Number(before.twd));
  if(!Number.isFinite(oldAmount)||Math.abs(oldAmount-(Number(after.twd)+newFee))<0.005)return false;
  const same=(a,b)=>String(a??'')===String(b??'');
  return ['bank','card','date','item','status','note','currency'].every(k=>same(before[k],after[k]))&&
    Math.abs((Number(before.foreign)||0)-(Number(after.foreign)||0))<0.005;
}
function ccFeeEditRender(){
  const target=document.getElementById('ccFeeEditStatus');
  if(!target)return;
  const queued=ccFeeEditQueue.filter(x=>x.state==='queued').length;
  const sending=ccFeeEditQueue.filter(x=>x.state==='sending').length;
  const uncertain=ccFeeEditQueue.filter(x=>x.state==='uncertain').length;
  target.style.display=ccFeeEditQueue.length||ccFeeEditAlert?'block':'none';
  target.innerHTML='<strong>交易修改背景同步：'+(sending?'傳送中 '+sending+' 筆　':'')+(queued?'等待 '+queued+' 筆　':'')+(uncertain?'需核對 '+uncertain+' 筆':'')+'</strong>'+
    (ccFeeEditAlert?'<p>'+esc(ccFeeEditAlert)+'</p>':'')+
    (ccFeeEditQueue.length?'<div>'+ccFeeEditQueue.map(x=>
      '<div style="margin-top:5px">'+esc(x.bank)+'・'+esc(x.item)+'：'+(x.kind==='amount'?'台幣金額 NT$'+Number(x.amount).toLocaleString('zh-TW'):'海外手續費 NT$'+Number(x.fee).toLocaleString('zh-TW'))+'（'+(x.state==='queued'?'待同步':x.state==='sending'?'正在同步':'結果不明，請到 Sheet 核對')+'）</div>'
    ).join('')+'</div>':'')+
    (uncertain?'<button type="button" id="ccFeeEditReviewBtn" style="margin-top:8px;padding:8px 12px;border-radius:9px;border:1px solid currentColor;background:transparent;cursor:pointer">核對 Sheet</button><button type="button" id="ccFeeEditClearBtn" style="margin:8px 0 0 8px;padding:8px 12px;border-radius:9px;border:1px solid currentColor;background:transparent;cursor:pointer">人工確認後解除鎖定</button>':'');
  target.querySelector('#ccFeeEditReviewBtn')?.addEventListener('click',()=>void ccFeeEditReview());
  target.querySelector('#ccFeeEditClearBtn')?.addEventListener('click',async()=>{
    if(!confirm('只有你已經核對 Google Sheet 的實際手續費、確定不用重送待確認修改時，才可以解除鎖定。\\n這會清除本機待確認佇列，不會修改 Sheet。確認嗎？'))return;
    ccFeeEditQueue=ccFeeEditQueue.filter(x=>x.state!=='uncertain');
    try{ccFeeEditPersist();}catch(err){alert('本機儲存失敗：'+err.message);return;}
    ccFeeEditAlert='已解除本機待核對鎖定，請從 Sheet 更新資料後再修改。';
    ccFeeEditRender();
    try{await loadRecords({force:true});}catch(_){}
  });
}
function ccFeeEditQueueRecord(before,after){
  const key=ccFeeEditSourceKey(before.source);
  if(!key||ccFeeEditIsPending(before.source)){alert('這筆交易仍在同步或待核對，不能重複送出。');return false;}
  if(!navigator.onLine){alert('目前離線。請先恢復網路再修改交易。');return false;}
  if(typeof ccQueueRead==='function'&&ccQueueRead().some(x=>x.record?.bank===before.bank)){
    alert('這家銀行還有新增交易待同步，請先完成同步後再補手續費。');return false;
  }
  if(ccFeeEditQueue.some(x=>x.state==='uncertain')){alert('先前的修改結果尚未確認，請先按「核對 Sheet」後再修改。');return false;}
  const kind=ccIsAmountOnlyEdit(before,after)?'amount':'fee';
  const oldFee=Number(before.overseasFee)||0,fee=Number(after.overseasFee)||0;
  const amount=Number(after.twd);
  const sign=['refund','points_offset'].includes(recordTransactionType(after))?-1:1;
  const entry={id:String(Date.now())+'-'+Math.random().toString(36).slice(2),key,bank:before.bank,item:before.item,kind,
    oldFee,oldTwd:Number(before.twd),fee,amount,expectedTwd:sign*Math.abs(amount+fee),
    record:{...after,source:{...before.source}},state:'queued',createdAt:new Date().toISOString()};
  ccFeeEditQueue.push(entry);
  try{ccFeeEditPersist();}catch(err){ccFeeEditQueue=ccFeeEditQueue.filter(x=>x.id!==entry.id);alert('無法安全暫存交易修改：'+err.message);return false;}
  if(typeof ccMarkLocalMutation==='function')ccMarkLocalMutation();
  ccFeeEditAlert='已加入背景同步。可繼續修改其他筆；離開分頁前請確認全部已同步。';
  ccFeeEditRender();
  if(typeof renderRecords==='function')renderRecords();
  void ccFeeEditFlush();
  return true;
}
async function ccFeeEditReview(){
  const uncertain=ccFeeEditQueue.filter(x=>x.state==='uncertain');
  if(!uncertain.length)return;
  ccFeeEditAlert='正在核對 Sheet 最新資料，請勿重複點擊…';ccFeeEditRender();
  try{
    const year=Number(window.ccSelectedDataYear||new Date().getFullYear());
    const cloud=await fetchCloudRecords(year,{cycleRead:true});
    let confirmed=0,unwritten=0,ambiguous=0;
    for(const entry of uncertain){
      const remote=cloud.records.find(r=>ccFeeEditSourceKey(r.source)===entry.key);
      if(!remote){ambiguous++;continue;}
      const currentFee=Number(remote.overseasFee)||0;
      const currentTwd=Number(remote.twd);
      const correctTwd=entry.expectedTwd===undefined||Math.abs(currentTwd-entry.expectedTwd)<0.005;
      const oldTwd=entry.oldTwd===undefined||Math.abs(currentTwd-entry.oldTwd)<0.005;
      if(Math.abs(currentFee-entry.fee)<0.005&&correctTwd){
        if(typeof ccMarkLocalMutation==='function')ccMarkLocalMutation();
        records=records.map(r=>ccFeeEditSourceKey(r.source)===entry.key?{...remote,id:r.id}:r);
        ccFeeEditQueue=ccFeeEditQueue.filter(x=>x.id!==entry.id);
        confirmed++;
      }else if(Math.abs(currentFee-entry.oldFee)<0.005&&oldTwd){
        unwritten++;
        entry.error='Sheet 仍是補登前的金額；若要重試，請先從 Sheet 更新資料後重新修改此筆。';
      }else{
        ambiguous++;
        entry.error='Sheet 手續費已被其他操作修改，請人工核對。';
      }
    }
    ccFeeEditPersist();
    if(typeof saveRecordsCache==='function')saveRecordsCache(year,'');
    if(typeof renderCurrentRecords==='function')renderCurrentRecords('已重新核對 Sheet 交易修改');
    ccFeeEditAlert='核對完成：'+confirmed+' 筆確認已寫入，'+unwritten+' 筆仍為原金額，'+ambiguous+' 筆需要人工確認。未確認的紀錄不會自動重送。';
    // 已確認沒有寫入時，使用者可以清除此筆待同步狀態後重新從 Sheet 編輯。
    ccFeeEditRender();
  }catch(err){ccFeeEditAlert='核對失敗：'+String(err.message||err)+'。請勿重複送出。';ccFeeEditRender();}
}
async function ccFeeEditFlush(){
  if(ccFeeEditBusy)return;
  ccFeeEditBusy=true;
  try{
    while(true){
      const entry=ccFeeEditQueue.find(x=>x.state==='queued');
      if(!entry)break;
      entry.state='sending';
      try{ccFeeEditPersist();}catch(err){entry.state='uncertain';ccFeeEditAlert='無法儲存同步狀態，請先核對 Google Sheet。';ccFeeEditRender();break;}
      ccFeeEditRender();
      try{
        const response=await postToApi({action:'updateRecord',record:entry.record});
        if(!response?.record?.source?.rowHash)throw new Error('GAS 未回傳來源驗證資料');
        const fresh=mapApiRecords([response.record])[0];
        if(!fresh||ccFeeEditSourceKey(fresh.source)!==entry.key)throw new Error('回傳的交易位置不符，需人工核對');
        // 後端回傳才視為成功；用新的 rowHash 更新前端和快取。
        if(typeof ccMarkLocalMutation==='function')ccMarkLocalMutation();
        if(typeof ccCreditAcceptConfirmedRecord==='function')ccCreditAcceptConfirmedRecord(fresh);
        records=records.map(r=>ccFeeEditSourceKey(r.source)===entry.key?{...fresh,id:r.id}:r);
        if(typeof saveRecordsCache==='function')saveRecordsCache(Number(window.ccSelectedDataYear||new Date().getFullYear()),'');
        ccFeeEditQueue=ccFeeEditQueue.filter(x=>x.id!==entry.id);
        ccFeeEditPersist();
        ccFeeEditAlert='「'+entry.item+'」'+(entry.kind==='amount'?'台幣金額 NT$'+entry.amount.toLocaleString('zh-TW'):'海外手續費 NT$'+entry.fee.toLocaleString('zh-TW'))+' 已成功同步 Google Sheet。';
        if(typeof renderCurrentRecords==='function')renderCurrentRecords('交易修改已同步 Google Sheet');
      }catch(err){
        entry.state='uncertain';
        entry.error=String(err.message||err);
        try{ccFeeEditPersist();}catch(_){}
        ccFeeEditAlert='「'+entry.item+'」同步結果未確認：'+entry.error+'。請先查看 Sheet；這筆不會自動重送，避免重覆記帳。';
        ccFeeEditRender();
        break; // 一筆結果不明時停止，避免與後端操作交錯
      }
      ccFeeEditRender();
    }
  }finally{
    ccFeeEditBusy=false;
    ccFeeEditRender();
  }
}
// 瀏覽器刷新後，先前未確認的請求不自動重送。
ccFeeEditQueue=ccFeeEditStorageRead().map(x=>({...x,state:'uncertain'}));
if(ccFeeEditQueue.length){
  ccFeeEditAlert='上次有交易修改尚未確認。請先到 Google Sheet 核對，不會自動重送。';
  try{ccFeeEditPersist();}catch(_){}
}
window.addEventListener('beforeunload',event=>{
  if(ccFeeEditQueue.some(x=>x.state==='queued'||x.state==='sending')){
    event.preventDefault();
    event.returnValue='';
  }
});
ccFeeEditRender();
