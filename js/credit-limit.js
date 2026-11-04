// 額度是銀行共用；核對帳單取代該帳期明細，避免重複占額。
const CC_CREDIT_BANKS=['中信','國泰','台新','富邦'];
const CC_CREDIT_SETTINGS_KEY='cc_credit_limits_v1';
function ccReadCreditLimits(){
  try{const saved=JSON.parse(localStorage.getItem(CC_CREDIT_SETTINGS_KEY)||'{}');return Object.fromEntries(CC_CREDIT_BANKS.map(bank=>[bank,Number.isFinite(saved[bank]) && saved[bank]>0?saved[bank]:null]));}
  catch(_){return Object.fromEntries(CC_CREDIT_BANKS.map(bank=>[bank,null]));}
}
let CC_CREDIT_LIMITS=ccReadCreditLimits();
let ccCreditCloudReady=false,ccCreditCloudRevision='',ccCreditCloudError='',ccCreditCloudBusy=false,ccCreditCloudChecked=0;
function ccCreditAcceptCloud(data){
  if(!data?.limits || !data.creditRevision || CC_CREDIT_BANKS.some(b=>!Number.isInteger(data.limits[b]) || data.limits[b]<=0 || data.limits[b]>1000000000))throw Error('雲端額度回傳不完整');
  CC_CREDIT_LIMITS=Object.fromEntries(CC_CREDIT_BANKS.map(b=>[b,data.limits[b]]));
  ccCreditCloudRevision=data.creditRevision;ccCreditCloudReady=true;ccCreditCloudError='';
  try{localStorage.setItem(CC_CREDIT_SETTINGS_KEY,JSON.stringify(CC_CREDIT_LIMITS));}catch(_){}
}
async function ccCreditCloudSync(interactive=false){
  if(ccCreditCloudBusy)return false;
  ccCreditCloudBusy=true;
  try{
    let deviceToken=ccStatementDeviceToken();
    if(!deviceToken && interactive){
      const adminKey=prompt('首次在這台裝置同步信用額度，請輸入原本的 GAS 管理密碼：');
      if(adminKey===null)return false;
      if(!adminKey)throw Error('請輸入管理密碼');
      const auth=await postToApi({action:'authorizeStatementDevice',adminKey,deviceLabel:ccStatementDeviceName()});
      if(!auth?.deviceToken)throw Error('裝置授權未完成');
      localStorage.setItem(CC_DEVICE_TOKEN_KEY,auth.deviceToken);deviceToken=auth.deviceToken;
    }
    if(!deviceToken){ccCreditCloudError='請按「同步雲端額度」授權這台裝置；目前顯示本機設定。';return false;}
    ccCreditAcceptCloud(await postToApi({action:'getCreditLimits',deviceToken}));
    ccCreditCloudChecked=Date.now();
    return true;
  }catch(err){
    ccCreditCloudReady=false;
    const message=String(err.message||err);
    if(/不支援的 POST action|Unknown.*action/.test(message))ccCreditCloudError='請先部署 GAS v2.7.17，才能啟用跨裝置額度同步。';
    else ccCreditCloudError='雲端額度尚未同步：'+message;
    if(/裝置授權.*(?:無效|過期|撤銷)/.test(message)){try{localStorage.removeItem(CC_DEVICE_TOKEN_KEY);}catch(_){}}
    if(interactive)alert(ccCreditCloudError);
    return false;
  }finally{ccCreditCloudBusy=false;ccRenderCreditLimits();}
}
async function ccEditCreditLimits(){
  if(!await ccCreditCloudSync(true))return;
  const dialog=document.createElement('dialog');dialog.className='cc-credit-settings';
  const form=document.createElement('form');form.method='dialog';
  const title=document.createElement('h3');title.textContent='設定各銀行信用額度';form.append(title);
  const note=document.createElement('p');note.textContent='儲存到雲端後，其他已授權手機與電腦可同步同一份額度。';form.append(note);
  for(const bank of CC_CREDIT_BANKS){
    const label=document.createElement('label');label.textContent=bank;
    const input=document.createElement('input');input.type='text';input.name=bank;input.required=true;input.inputMode='numeric';input.autocomplete='off';input.pattern='[0-9,]+';input.value=CC_CREDIT_LIMITS[bank]===null?'':CC_CREDIT_LIMITS[bank].toLocaleString('en-US');
    input.addEventListener('input',()=>{
      const digitsBefore=input.value.slice(0,input.selectionStart??input.value.length).replace(/[^0-9]/g,'').length;
      const digits=input.value.replace(/[^0-9]/g,'').replace(/^0+(?=\d)/,'');
      input.value=digits.replace(/\B(?=(\d{3})+(?!\d))/g,',');
      let caret=0,count=0;
      while(caret<input.value.length && count<digitsBefore){if(/[0-9]/.test(input.value[caret]))count++;caret++;}
      input.setSelectionRange(caret,caret);
      const amount=Number(digits);
      input.setCustomValidity(digits && (!Number.isInteger(amount)||amount<=0||amount>1000000000)?'請輸入 1～1,000,000,000 的整數額度':'');
    });
    label.append(input);form.append(label);
  }
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='取消';cancel.addEventListener('click',()=>dialog.close());
  const save=document.createElement('button');save.type='submit';save.textContent='儲存到雲端';form.append(cancel,save);
  form.addEventListener('submit',async event=>{event.preventDefault();if(save.disabled)return;const values=Object.fromEntries(CC_CREDIT_BANKS.map(bank=>[bank,Number(form.elements.namedItem(bank).value.replace(/,/g,''))]));if(Object.values(values).some(n=>!Number.isInteger(n)||n<=0||n>1000000000))return;save.disabled=true;save.textContent='儲存中…';try{const data=await postToApi({action:'updateCreditLimits',limits:values,creditRevision:ccCreditCloudRevision,deviceToken:ccStatementDeviceToken()});ccCreditAcceptCloud(data);ccRenderCreditLimits();dialog.close();}catch(err){await ccCreditCloudSync(false);alert('額度儲存未確認：'+err.message+'。請核對雲端額度後再操作。');}finally{save.disabled=false;save.textContent='儲存到雲端';}});
  dialog.append(form);dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
}
const CC_CREDIT_CACHE_KEY='cc_credit_snapshot_v2';
function ccCreditReadSnapshot(){
  try{
    const value=JSON.parse(localStorage.getItem(CC_CREDIT_CACHE_KEY)||'null');
    if(value?.schema!==2 || !value.byYear || !value.archive || !value.payments || !value.savedAt)return null;
    const entries=Object.entries(value.byYear);
    if(!entries.length || entries.some(([year,part])=>!/^20\d{2}$/.test(year) || !Array.isArray(part?.rows) || typeof part.dataVersion!=='string'))return null;
    return value;
  }catch(_){return null;}
}
let ccCreditSnapshot=ccCreditReadSnapshot();
let ccCreditByYear=ccCreditSnapshot?.byYear || {};
let ccCreditRows=ccCreditSnapshot?ccUniqueSourceRecords(Object.values(ccCreditByYear).flatMap(part=>part.rows)):null;
let ccCreditError='',ccCreditLoading=false,ccCreditEpoch=ccCreditSnapshot?ccMutationEpoch:-1;
let ccCreditVerified=false,ccCreditLastChecked=0,ccCreditRefreshPromise=null,ccCreditForceQueued=false,ccCreditChangeTimer=null;
function ccCreditSaveSnapshot(){
  if(!ccCreditVerified || !ccStatementCloudReady || ccCreditEpoch!==ccMutationEpoch)return;
  const snapshot={schema:2,byYear:ccCreditByYear,archive:ccStatementArchive,payments:ccStatementPayments,
    statementRevision:ccStatementRevision,paymentRevision:ccStatementPaymentRevision,savedAt:new Date().toISOString()};
  ccCreditSnapshot=JSON.parse(JSON.stringify(snapshot));
  try{localStorage.setItem(CC_CREDIT_CACHE_KEY,JSON.stringify(snapshot));}catch(_){}
}

function ccCreditCycleMonth(bank, tab){
  const match=String(tab||'').match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if(!match)throw Error('有交易缺少可辨識的帳期分頁');
  const cycle=getBankCycle(bank,'20'+match[1]+'-'+match[2]+'-'+match[3]);
  // 雲端核對帳單依結帳月份存放；台新／富邦繳款日落在下個月，不能用繳款月份配對。
  return dateToInput(cycle.e).slice(0,7);
}
// 帳單鍵為結帳月份，繳款日可能落在下一個月。
function ccCreditDueDate(bank,month){
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(String(month)))return '';
  const cfg=APP_CONFIG.banks[bank];
  if(!Number.isInteger(cfg?.cycleStartDay) || !Number.isInteger(cfg?.paymentDueDay))return '';
  const [year,m]=month.split('-').map(Number);
  const end=new Date(year,m-1,cfg.cycleStartDay-1,12);
  const due=ccDueDateForClosedCycle({e:end},cfg.paymentDueDay);
  return due?dateToInput(due):'';
}
function ccCreditCalculate(bank, rows, archive, payments){
  const groups=new Map();
  for(const r of ccUniqueSourceRecords(rows).filter(r=>r.bank===bank)){
    const month=ccCreditCycleMonth(bank,r.source.sheetName);
    if(!groups.has(month))groups.set(month,[]);
    groups.get(month).push(r);
  }
  for(const month of Object.keys(archive||{}))if(archive[month]?.[bank]!==undefined && !groups.has(month))groups.set(month,[]);
  let billed=0, unbilled=0, missing=0;
  const dueDates=new Set();
  for(const [month,items] of groups){
    const statement=archive?.[month]?.[bank], payment=payments?.[month]?.[bank];
    const verified=typeof statement==='number' && Number.isFinite(statement) && statement>=0;
    // 銀行帳單已繳後，即使舊 Sheet 尚未完成同步也不再次占額。
    if(verified && payment?.paid===true && Number(payment.amount)===statement)continue;
    if(verified){
      billed+=statement;
      if(statement>0){const due=ccCreditDueDate(bank,month);if(due)dueDates.add(due);}
      continue;
    }
    const unpaid=items.filter(r=>(r.status||'刷')!=='繳');
    missing+=unpaid.filter(r=>!['刷',''].includes(r.status||'') || r.twd===null || r.twd==='' || !Number.isFinite(Number(r.twd))).length;
    unbilled+=sumTwd(unpaid);
  }
  const used=Math.max(0,Math.round((billed+unbilled)*100)/100);
  return {billed,unbilled,used,missing,dueDates:[...dueDates].sort(),available:CC_CREDIT_LIMITS[bank]-used};
}
function ccRenderCreditLimits(){
  const root=document.getElementById('creditLimits');if(!root)return;
  const ready=ccCreditVerified && ccCreditRows!==null && ccStatementCloudReady && ccCreditEpoch===ccMutationEpoch;
  if(ready && (ccCreditSnapshot?.statementRevision!==ccStatementRevision || ccCreditSnapshot?.paymentRevision!==ccStatementPaymentRevision))ccCreditSaveSnapshot();
  const cached=!ready && ccCreditSnapshot;
  const displayRows=ready?ccCreditRows:cached?ccUniqueSourceRecords(Object.values(cached.byYear).flatMap(part=>part.rows)):null;
  const displayArchive=ready?ccStatementArchive:cached?.archive;
  const displayPayments=ready?ccStatementPayments:cached?.payments;
  const savedTime=ccCreditSnapshot?.savedAt && typeof formatSyncTime==='function'?formatSyncTime(ccCreditSnapshot.savedAt):'';
  const snapshotNote=ccCreditError?'背景核對未完成，保留上次金額：'+ccCreditError:
    ccCreditLoading || !ccCreditVerified?'顯示上次核對金額'+(savedTime?'（'+savedTime+'）':'')+'；正在背景確認資料有無變更。':
    '額度帳務已核對'+(savedTime?'（'+savedTime+'）':'')+'；資料沒有變更時沿用上次結果。';
  root.innerHTML='<div class="billing-note">'+(ccCreditCloudReady?'額度已從雲端同步；其他裝置可按下方按鈕更新。':esc(ccCreditCloudError||'額度尚未連接雲端；請先部署 GAS v2.7.17。'))+'</div><button type="button" id="ccCreditCloudSync" class="chip" '+(ccCreditCloudBusy?'disabled':'')+'>'+(ccCreditCloudBusy?'同步中…':'同步雲端額度')+'</button><div class="section-label">信用額度</div><div class="cc-credit-grid">'+Object.entries(CC_CREDIT_LIMITS).map(([bank,limit])=>{
    let result=null,error='';
    if(displayRows){try{result=ccCreditCalculate(bank,displayRows,displayArchive,displayPayments);}catch(e){error=e.message;}}
    const valid=result && !result.missing && limit!==null;
    const percent=valid?Math.min(100,result.used/limit*100):0;
    return `<div class="billing-card ${bankClass(bank)} cc-credit-card"><div class="billing-head"><strong>${esc(bank)}</strong><span>共用額度 ${limit===null?'尚未設定':moneyText(limit)}</span></div><div class="billing-cycle-label">估算可用額度</div><div class="billing-amount">${valid?moneyText(result.available):'待確認'}</div>${valid?`<progress max="100" value="${percent}" aria-label="${esc(bank)}額度使用比例"></progress><div class="cc-credit-detail"><span>已占用</span><strong>${moneyText(result.used)}</strong><div class="cc-credit-due-row"><span class="cc-credit-due-label">已核對待繳</span><span class="cc-credit-due-dates">${result.dueDates.map(d=>'<time class="cc-credit-due-date" datetime="'+d+'" title="繳費期限：'+d.replace(/-/g,'/')+'" aria-label="繳費期限：'+d.replace(/-/g,'/')+'">'+d.slice(5).replace('-','/')+' 繳</time>').join('')}</span><strong class="${result.billed>0?'cc-credit-due-amount':''}">${moneyText(result.billed)}</strong></div><span>其餘未繳消費（含未出帳）</span><strong>${moneyText(result.unbilled)}</strong></div>${result.available<0?'<div class="billing-warning">記錄金額已超過設定額度，請核對帳務。</div>':''}`:`<div class="billing-note">${esc((limit===null?'請按「設定額度」填入銀行共用額度':error) || (result?.missing?'有未繳交易尚未補齊金額或進度':ccCreditError || (!ccStatementCloudReady?'帳單繳費狀態尚未確認':'正在核對全部年度帳務…')))}</div>`}</div>`;
  }).join('')+'</div><div class="billing-note">依已記錄的消費、退刷與繳費狀態估算；完成本期繳費後恢復額度。同銀行卡片共用額度。未記錄的分期餘額、預授權或銀行入帳時間差，請以銀行 App 為準。</div>';
  if(ccCreditSnapshot)root.insertAdjacentHTML('afterbegin','<div class="billing-note">'+esc(snapshotNote)+'</div>');
  root.querySelector('#ccCreditCloudSync')?.addEventListener('click',()=>ccCreditCloudSync(true));
  const queue=typeof ccQueueRead==='function'?ccQueueRead():[];
  if(queue.length)root.insertAdjacentHTML('beforeend','<div class="billing-warning">此裝置另有 '+queue.length+' 筆待同步交易，尚未計入額度。</div>');
}
async function ccRefreshCreditLimits(options={}){
  const force=options.force===true;
  if(ccCreditRefreshPromise){if(force)ccCreditForceQueued=true;return ccCreditRefreshPromise;}
  if(!force && ccCreditVerified && ccCreditEpoch===ccMutationEpoch && Date.now()-ccCreditLastChecked<60000){ccRenderCreditLimits();return;}
  ccCreditLoading=true;ccCreditError='';ccRenderCreditLimits();
  const epoch=ccMutationEpoch;
  const mutationChanged=ccCreditEpoch!==epoch;
  ccCreditRefreshPromise=(async()=>{
    try{
      const response=await fetch(API_URL+'?action=years&_='+Date.now(),{cache:'no-store'});
      if(!response.ok)throw Error('年度查詢失敗');
      const data=await response.json();
      if(!data.ok || !Array.isArray(data.years))throw Error('無法核對完整年度清單');
      const years=[...new Set(data.years.filter(y=>y.ready).map(y=>Number(y.year)))];
      if(!years.length || years.some(y=>!Number.isInteger(y)))throw Error('年度清單不完整');
      const versions=await Promise.all(years.map(async year=>{
        const cached=ccCreditByYear[year];
        if(force || mutationChanged || !cached?.dataVersion)return '';
        return fetchDataVersion(year);
      }));
      const byYear={};
      for(let i=0;i<years.length;i++){
        const year=years[i],cached=ccCreditByYear[year];
        if(!force && !mutationChanged && cached && versions[i] && versions[i]===cached.dataVersion){
          byYear[year]=cached;continue;
        }
        const cloud=await fetchCloudRecords(year,{cycleRead:true});
        byYear[year]={rows:cloud.records,dataVersion:cloud.dataVersion || await fetchDataVersion(year)};
      }
      if(epoch!==ccMutationEpoch){ccCreditForceQueued=true;return;}
      const all=Object.values(byYear).flatMap(part=>part.rows);
      if(all.some(r=>!ccSourceKey(r.source)))throw Error('有交易缺少來源，無法確認完整額度');
      ccCreditByYear=byYear;ccCreditRows=ccUniqueSourceRecords(all);ccCreditEpoch=epoch;
      ccCreditVerified=true;ccCreditLastChecked=Date.now();ccCreditSaveSnapshot();
    }catch(err){ccCreditError=String(err.message||err);}
    finally{ccCreditLoading=false;ccRenderCreditLimits();}
  })();
  try{await ccCreditRefreshPromise;}finally{
    ccCreditRefreshPromise=null;
    if(ccCreditForceQueued){ccCreditForceQueued=false;void ccRefreshCreditLimits({force:true});}
  }
}
function ccCreditScheduleMutation(){
  if(ccCreditEpoch===ccMutationEpoch || ccCreditLoading ||
    (typeof ccQueueBusy!=='undefined' && ccQueueBusy) ||
    (typeof ccCyclePaymentBusy!=='undefined' && ccCyclePaymentBusy))return;
  clearTimeout(ccCreditChangeTimer);
  ccCreditChangeTimer=setTimeout(()=>{void ccRefreshCreditLimits();},250);
}
const ccCreditOriginalBilling=renderBillingOverview;
renderBillingOverview=function(){ccCreditOriginalBilling();ccRenderCreditLimits();ccCreditScheduleMutation();};
const ccCreditOriginalLoad=loadRecords;
loadRecords=async function(options={}){await ccCreditOriginalLoad(options);await ccRefreshCreditLimits();};
document.getElementById('editCreditLimits')?.addEventListener('click',ccEditCreditLimits);
document.getElementById('refreshCreditLimits')?.addEventListener('click',async()=>{await ccRefreshStatementArchive();await ccCreditCloudSync(false);await ccRefreshCreditLimits({force:true});});
ccRenderCreditLimits();

window.addEventListener('DOMContentLoaded',()=>{void ccCreditCloudSync(false);});
function ccCreditCloudOnReturn(){
  if(document.visibilityState==='hidden' || !navigator.onLine || Date.now()-ccCreditCloudChecked<60000 || document.querySelector('.cc-credit-settings'))return;
  ccCreditCloudChecked=Date.now();void ccCreditCloudSync(false);void ccRefreshCreditLimits();
}
window.addEventListener('focus',ccCreditCloudOnReturn);
window.addEventListener('visibilitychange',ccCreditCloudOnReturn);
