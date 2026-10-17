// 信用卡記帳：本機先存、手動批次同步（不自動重送不確定是否已寫入的請求）
const CC_QUEUE_KEY = 'cc_pending_creates_v1';
let ccQueueBusy = false;
function ccQueueRead(){
  try{
    const rows = JSON.parse(localStorage.getItem(CC_QUEUE_KEY) || '[]');
    if(!Array.isArray(rows)) throw Error('格式錯誤');
    return rows.map(x => ({...x,state:x.state==='sending'?'uncertain':x.state}));
  }catch(err){throw Error('無法讀取待同步紀錄，請勿清除瀏覽器資料：'+err.message);}
}
function ccQueueWrite(queue){
  localStorage.setItem(CC_QUEUE_KEY,JSON.stringify(queue));
  if(localStorage.getItem(CC_QUEUE_KEY) === null) throw Error('手機儲存空間不足');
}
function ccQueueCreate(record){
  const queue = ccQueueRead();
  const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Date.now()+'-'+Math.random().toString(36).slice(2);
  queue.push({id,record,createdAt:new Date().toISOString(),state:'queued'});
  ccQueueWrite(queue); // 儲存成功後才清空表單
  ccQueueRender();
  const note=document.getElementById('ccQueueSaved');
  if(note){note.textContent='已存入此裝置，尚未寫入 Google Sheet。可繼續新增，之後按「同步待處理」。';note.classList.remove('hidden');}
}
function ccQueueRender(){
  const panel=document.getElementById('ccQueuePanel');
  const panelRecords=document.getElementById('ccQueueRecords');
  if(!panel)return;
  let queue;
  try{queue=ccQueueRead();}catch(err){panel.textContent=err.message;return;}
  const waiting=queue.filter(x=>x.state==='queued').length;
  const uncertain=queue.filter(x=>x.state==='uncertain').length;
  const title='待同步 '+queue.length+' 筆'+(uncertain?'｜'+uncertain+' 筆需確認':'');
  const html='<div class="cc-queue-head"><strong>'+title+'</strong><button type="button" class="cc-queue-sync" '+(ccQueueBusy||!waiting?'disabled':'')+'>同步待處理</button></div>'+
    (queue.length?'<div class="cc-queue-list">'+queue.map(x=>{
      const status=x.state==='uncertain'?'需先確認 Sheet 是否已寫入':x.state==='sending'?'正在傳送': '尚未同步';
      return '<div class="cc-queue-row"><span>'+esc(x.record.date)+'・'+esc(x.record.bank)+'・'+esc(x.record.item)+'・'+(x.record.twd==null?'待補台幣':'NT$'+Math.abs(Number(x.record.twd)).toLocaleString())+'</span><small>'+status+'</small><div>'+
        (x.state==='queued'?'<button type="button" data-cc-remove="'+esc(x.id)+'">刪除此待同步項目</button>':'')+
        (x.state==='uncertain'?'<button type="button" data-cc-review="'+esc(x.id)+'">確認後處理</button>':'')+
        '</div></div>';
    }).join('')+'</div>':'<small>目前沒有待同步紀錄</small>')+
    (uncertain?'<p class="cc-queue-warning">部分請求結果不明，為避免重複記帳，請先到 Google Sheet 查核，再決定是否重試。</p>':'')+
    '<small>待同步資料只存在這台裝置的這個瀏覽器；清除網站資料或更換手機可能遺失。</small>';
  for(const el of [panel,panelRecords]){
    if(!el)continue;
    el.innerHTML=html;
    el.querySelector('.cc-queue-sync')?.addEventListener('click',ccQueueSync);
    el.querySelectorAll('[data-cc-remove]').forEach(btn=>btn.addEventListener('click',()=>{
      if(!confirm('只刪除手機內這筆「尚未同步」的資料，確定嗎？'))return;
      ccQueueWrite(ccQueueRead().filter(x=>x.id!==btn.dataset.ccRemove));ccQueueRender();
    }));
    el.querySelectorAll('[data-cc-review]').forEach(btn=>btn.addEventListener('click',()=>{
      const id=btn.dataset.ccReview;
      const row=ccQueueRead().find(x=>x.id===id);
      if(!row)return;
      const found=confirm('請先開啟 Google Sheet，確認「'+row.record.item+'」這筆交易是否已寫入。\n\n如果「已經寫入」，按「確定」從待同步清單移除。\n如果「確定沒有寫入」，按「取消」後再選擇重試。');
      if(found){ccQueueWrite(ccQueueRead().filter(x=>x.id!==id));ccQueueRender();return;}
      if(!confirm('你已確認 Google Sheet「沒有」這筆資料嗎？\n只有確定沒有寫入，才可以重新同步，避免重複記帳。'))return;
      const q=ccQueueRead();const x=q.find(x=>x.id===id);if(x)x.state='queued';ccQueueWrite(q);ccQueueRender();
    }));
  }
}
async function ccQueueSync(){
  if(ccQueueBusy)return;
  ccQueueBusy=true;ccQueueRender();
  let sent=0;
  try{
    const items=ccQueueRead().filter(x=>x.state==='queued');
    for(const entry of items){
      let q=ccQueueRead();const target=q.find(x=>x.id===entry.id);
      if(!target||target.state!=='queued')continue;
      target.state='sending';ccQueueWrite(q);ccQueueRender();
      try{
        await postToApi({action:'createRecord',record:target.record});
        q=ccQueueRead().filter(x=>x.id!==entry.id);
        ccQueueWrite(q);
        sent++;
      }catch(err){
        q=ccQueueRead();const failed=q.find(x=>x.id===entry.id);
        if(failed){failed.state='uncertain';failed.error=String(err.message||err);ccQueueWrite(q);}
        // 網路中斷時不確定 GAS 是否已寫入；停止批次，避免重複送出。
        alert('同步中斷：'+err.message+'\n請先查看 Google Sheet 是否已有這筆資料，確認後再處理。');
        break;
      }
      ccQueueRender();
    }
  }finally{
    ccQueueBusy=false;ccQueueRender();
    if(sent){
      await loadRecords({year:Number(window.ccSelectedDataYear||new Date().getFullYear()),force:true});
      const note=document.getElementById('ccQueueSaved');
      if(note){note.textContent='已成功同步 '+sent+' 筆到 Google Sheet。';note.classList.remove('hidden');}
    }
  }
}
ccQueueRender();
