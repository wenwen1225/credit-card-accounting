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
function ccFeeEditRender(){
  const target=document.getElementById('ccFeeEditStatus');
  if(!target)return;
  const queued=ccFeeEditQueue.filter(x=>x.state==='queued').length;
  const sending=ccFeeEditQueue.filter(x=>x.state==='sending').length;
  const uncertain=ccFeeEditQueue.filter(x=>x.state==='uncertain').length;
  target.style.display=ccFeeEditQueue.length||ccFeeEditAlert?'block':'none';
  target.innerHTML='<strong>海外手續費同步：'+(sending?'傳送中 '+sending+' 筆　':'')+(queued?'等待 '+queued+' 筆　':'')+(uncertain?'需核對 '+uncertain+' 筆':'')+'</strong>'+
    (ccFeeEditAlert?'<p>'+esc(ccFeeEditAlert)+'</p>':'')+
    (ccFeeEditQueue.length?'<div>'+ccFeeEditQueue.map(x=>
      '<div style="margin-top:5px">'+esc(x.bank)+'・'+esc(x.item)+'：NT$'+Number(x.fee).toLocaleString('zh-TW')+'（'+(x.state==='queued'?'待同步':x.state==='sending'?'正在同步':'結果不明，請到 Sheet 核對')+'）</div>'
    ).join('')+'</div>':'');
}
function ccFeeEditQueueRecord(before,after){
  const key=ccFeeEditSourceKey(before.source);
  if(!key||ccFeeEditIsPending(before.source)){alert('這筆手續費仍在同步或待核對，不能重複送出。');return false;}
  if(!navigator.onLine){alert('目前離線。請先恢復網路再補登手續費。');return false;}
  if(typeof ccQueueRead==='function'&&ccQueueRead().some(x=>x.record?.bank===before.bank)){
    alert('這家銀行還有新增交易待同步，請先完成同步後再補手續費。');return false;
  }
  const entry={id:String(Date.now())+'-'+Math.random().toString(36).slice(2),key,bank:before.bank,item:before.item,fee:Number(after.overseasFee),record:{...after,source:{...before.source}},state:'queued',createdAt:new Date().toISOString()};
  ccFeeEditQueue.push(entry);
  try{ccFeeEditPersist();}catch(err){ccFeeEditQueue=ccFeeEditQueue.filter(x=>x.id!==entry.id);alert('無法安全暫存手續費：'+err.message);return false;}
  ccFeeEditAlert='已加入背景同步。可繼續補登其他筆；離開分頁前請確認全部已同步。';
  ccFeeEditRender();
  if(typeof renderRecords==='function')renderRecords();
  void ccFeeEditFlush();
  return true;
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
        records=records.map(r=>ccFeeEditSourceKey(r.source)===entry.key?{...fresh,id:r.id}:r);
        if(typeof saveRecordsCache==='function')saveRecordsCache(Number(window.ccSelectedDataYear||new Date().getFullYear()),'');
        ccFeeEditQueue=ccFeeEditQueue.filter(x=>x.id!==entry.id);
        ccFeeEditPersist();
        ccFeeEditAlert='「'+entry.item+'」海外手續費 NT$'+entry.fee.toLocaleString('zh-TW')+' 已成功同步 Google Sheet。';
        if(typeof renderCurrentRecords==='function')renderCurrentRecords('手續費已同步 Google Sheet');
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
  ccFeeEditAlert='上次有手續費尚未確認。請先到 Google Sheet 核對，不會自動重送。';
  try{ccFeeEditPersist();}catch(_){}
}
window.addEventListener('beforeunload',event=>{
  if(ccFeeEditQueue.some(x=>x.state==='queued'||x.state==='sending')){
    event.preventDefault();
    event.returnValue='';
  }
});
ccFeeEditRender();
