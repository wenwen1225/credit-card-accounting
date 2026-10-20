// 年度管理：只在使用者操作時查詢/建立，不會自動建立試算表。
let ccAvailableYears = [new Date().getFullYear()];
async function ccRefreshYears(){
  const status=document.getElementById('yearManagerStatus');
  try{
    const res=await fetch(APP_CONFIG.apiUrl+'?action=years&_='+Date.now(),{cache:'no-store'});
    const data=await res.json();
    if(!data.ok || !Array.isArray(data.years))throw Error(data.error||'年度資料讀取失敗');
    ccAvailableYears=data.years.filter(y=>y.ready).map(y=>Number(y.year));
    const next=new Date().getFullYear()+1;
    const entry=data.years.find(y=>Number(y.year)===next);
    const btn=document.getElementById('createNextYearBtn');
    if(btn){btn.disabled=Boolean(entry?.ready);btn.textContent=entry?.ready?next+' 年已建立':'建立 '+next+' 年四家銀行';}
    if(status)status.textContent=entry?.ready?next+' 年四家銀行已建立，可切換年份查看。':'目前可使用：'+ccAvailableYears.join('、')+' 年。';
    if(typeof buildMonthTabs==='function')buildMonthTabs();
    return data;
  }catch(err){
    if(status)status.textContent='年度管理查詢失敗（'+err.message+'）';
    return null;
  }
}
document.getElementById('refreshYearsBtn')?.addEventListener('click',ccRefreshYears);
document.getElementById('createNextYearBtn')?.addEventListener('click',async()=>{
  const year=new Date().getFullYear()+1;
  if(!confirm('確定建立 '+year+' 年中信、國泰、台新、富邦共四份新試算表？\n只複製帳期格式，不複製舊年度交易。'))return;
  const adminKey=prompt('請輸入 Apps Script 指令碼屬性 CC_ADMIN_KEY 設定的年度管理密碼：');
  if(!adminKey)return;
  const btn=document.getElementById('createNextYearBtn');
  btn.disabled=true;btn.textContent='建立中，請稍候…';
  try{
    const res=await fetch(APP_CONFIG.apiUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'createYear',year,adminKey})});
    const data=await res.json();
    if(!data.ok)throw Error(data.error||'建立失敗');
    alert(year+' 年四家銀行試算表已建立。');
  }catch(err){alert('建立年度失敗：'+err.message+'\n如果已建立部分銀行，請先按「更新年度清單」確認，不要自行複製。');}
  finally{btn.disabled=false;await ccRefreshYears();}
});
// 年度清單只在使用者按「更新年度清單」時查詢，避免每次重整都呼叫 GAS。


// 帳期分頁：先從 Sheet 讀取最新分頁，再建立緊接的下一期。
let ccNextCyclePreview=null;
const ccCycleBank=document.getElementById('cycleCreateBank');
const ccCycleStatus=document.getElementById('cycleCreateStatus');
const ccCycleCreateBtn=document.getElementById('createCycleSheetBtn');
async function ccPreviewNextCycle(){
  ccNextCyclePreview=null;
  if(ccCycleCreateBtn)ccCycleCreateBtn.disabled=true;
  const bank=ccCycleBank?.value;
  const year=typeof selectedYear!=='undefined'?Number(selectedYear):new Date().getFullYear();
  if(ccCycleStatus)ccCycleStatus.textContent='正在讀取 '+bank+' 的最新帳期…';
  try{
    const url=APP_CONFIG.apiUrl+'?action=nextCycle&bank='+encodeURIComponent(bank)+'&year='+year+'&_='+Date.now();
    const res=await fetch(url,{cache:'no-store'});
    if(!res.ok)throw Error('HTTP '+res.status);
    const data=await res.json();
    if(!data.ok)throw Error(data.error||'查詢失敗');
    if(!['2.5','2.7.2',String(APP_CONFIG.version.expectedBackend)].includes(String(data.version||'').replace(/^v/i,'')))throw Error('下一期分頁 API 版本不相容：'+(data.version||'未知'));
    if(typeof data.latestTab!=='string'||typeof data.nextTab!=='string'||!data.nextTab.trim())throw Error('後端未回傳有效的下一期分頁資訊');
    ccNextCyclePreview={bank,year,latestTab:data.latestTab,nextTab:data.nextTab};
    if(ccCycleStatus)ccCycleStatus.textContent=bank+'：最新 '+data.latestTab+' → 下一期 '+data.nextTab;
    if(ccCycleCreateBtn){ccCycleCreateBtn.disabled=false;ccCycleCreateBtn.textContent='建立 '+data.nextTab+' 分頁';}
  }catch(err){
    if(ccCycleStatus)ccCycleStatus.textContent='無法查詢下一期：'+err.message;
  }
}
document.getElementById('previewNextCycleBtn')?.addEventListener('click',ccPreviewNextCycle);
ccCycleBank?.addEventListener('change',()=>{
  ccNextCyclePreview=null;
  if(ccCycleCreateBtn){ccCycleCreateBtn.disabled=true;ccCycleCreateBtn.textContent='建立下一期分頁';}
  if(ccCycleStatus)ccCycleStatus.textContent='已切換銀行，請按「查詢下一期」。';
});
ccCycleCreateBtn?.addEventListener('click',async()=>{
  const info=ccNextCyclePreview;
  if(!info || ccCycleBank?.value!==info.bank)return;
  if(!confirm('確定為 '+info.bank+' 建立下一期 '+info.nextTab+' 分頁？\n原本 '+info.latestTab+' 不會被修改。'))return;
  ccCycleCreateBtn.disabled=true;
  ccCycleCreateBtn.textContent='建立中…';
  try{
    const data=await postToApi({action:'createNextCycleSheet',bank:info.bank,year:info.year,expectedTab:info.nextTab});
    if(ccCycleStatus)ccCycleStatus.textContent=data.alreadyExists
      ? data.tab+' 已存在，沒有覆蓋資料。'
      : '已成功建立 '+info.bank+' '+data.tab+' 分頁。';
    ccNextCyclePreview=null;
    ccCycleCreateBtn.textContent='建立下一期分頁';
  }catch(err){
    if(ccCycleStatus)ccCycleStatus.textContent='建立未確認：'+err.message+'。請先檢查 Google Sheet，再重新查詢，避免重複操作。';
    ccCycleCreateBtn.textContent='建立下一期分頁';
  }
});
