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
    if(status)status.textContent='年度管理尚未連線：請先部署 GAS v1.1（'+err.message+'）';
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


// 帳期管理：按鈕建立分頁；不影響一般新增消費的自動建表。
document.getElementById('createCycleSheetBtn')?.addEventListener('click',async()=>{
  const bank=document.getElementById('cycleCreateBank')?.value;
  const date=document.getElementById('cycleCreateDate')?.value;
  const status=document.getElementById('cycleCreateStatus');
  const btn=document.getElementById('createCycleSheetBtn');
  if(!bank || !date){if(status)status.textContent='請先選擇銀行與帳期日期。';return;}
  const cycle=typeof getBankCycle==='function'?getBankCycle(bank,date):null;
  const tab=cycle?.tab || '所選日期對應的帳期';
  if(!confirm('確定為 '+bank+' 建立帳期分頁 '+tab+' 嗎？\n如果已存在，系統不會覆蓋。'))return;
  const adminKey=prompt('請輸入 Apps Script 指令碼屬性 CC_ADMIN_KEY 的管理密碼：');
  if(!adminKey)return;
  btn.disabled=true;
  btn.textContent='建立中…';
  if(status)status.textContent='正在檢查 '+bank+' 的帳期分頁…';
  try{
    const data=await postToApi({action:'createCycleSheet',bank,date,adminKey});
    if(status)status.textContent=data.alreadyExists
      ? bank+' '+data.tab+' 已存在，沒有修改原有資料。'
      : '已建立 '+bank+' '+data.tab+' 分頁。';
  }catch(err){
    if(status)status.textContent='建立失敗：'+err.message+'。請確認 GAS v2.1 已部署；如網路中斷，先到 Sheet 檢查，避免重複操作。';
  }finally{
    btn.disabled=false;btn.textContent='新增帳期分頁';
  }
});

// 帳期日期預設為使用者裝置的今天，避免固定日期過期。
const ccCycleDateInput=document.getElementById('cycleCreateDate');
if(ccCycleDateInput){const now=new Date();ccCycleDateInput.value=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');}
