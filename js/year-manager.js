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
ccRefreshYears();
