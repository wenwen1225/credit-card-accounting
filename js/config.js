const APP_CONFIG = {
  apiUrl: '/api/gas',
  version: {
    frontend: '2026.11.09-v5.83',
    expectedBackend: '2.8.19'
  },
  storage: {
    paidKey: 'cc_demo_paid_v1',
    recordsCacheKey: 'cc_sheet_records_cache_v1'
  },
  banks: {
    '中信': {
      cycleStartDay: 6,
      paymentDueDay: 23,
      cards: ['無限卡VISA', 'UniOpen卡', 'line pay卡', '無限卡JCB', 'Sogo聯名卡']
    },
    '國泰': {
      cycleStartDay: 9,
      paymentDueDay: 24,
      cards: []
    },
    '台新': {
      cycleStartDay: 21,
      paymentDueDay: 5,
      firstPaymentDueDate: '2026-11-05',
      cards: []
    },
    '富邦': {
      cycleStartDay: 23,
      paymentDueDay: 7,
      firstPaymentDueDate: '2026-11-07',
      cards: []
    }
  }
};

// 帳單同步支援 v2.7.11 起，以及保留相同 API 的 v2.8 系列。
function ccSupportsPaymentBackend(version){
  return /^2\.7\.(?:1[1-9]|[2-9]\d)$/.test(String(version||'')) || /^2\.8(?:\.\d+)?$/.test(String(version||''));
}
function ccReminderEligible(cfg,now){
  if(!cfg.paymentDueDay)return false;
  const due=new Date(now.getFullYear(),now.getMonth(),cfg.paymentDueDay,12);
  const start=new Date(due);start.setDate(start.getDate()-4);
  return dateToInput(now)>=dateToInput(start) && (!cfg.firstPaymentDueDate || dateToInput(due)>=cfg.firstPaymentDueDate);
}

// 海外手續費補登起始帳期：舊帳期不補，已繳帳單不開放補登。
// 使用交易日所屬的帳期，不以交易月份或繳費月份判斷。
const CC_FEE_FIRST_CYCLES = Object.freeze({
  '中信': {start:'2026-10-06',end:'2026-11-05',due:'2026-11-23'},
  '國泰': {start:'2026-10-09',end:'2026-11-08',due:'2026-11-24'},
  '台新': {start:'2026-10-21',end:'2026-11-20',due:'2026-12-05'},
  '富邦': {start:'2026-10-02',end:'2026-10-22',due:'2026-11-07'}
});
function ccFeeCycleEligible(bank,date){
  const first=CC_FEE_FIRST_CYCLES[bank];
  const d=String(date||'').slice(0,10);
  if(!first||!/^\d{4}-\d{2}-\d{2}$/.test(d))return false;
  // 只允許指定起始帳期及後續帳期；更早的交易不開放補登。
  return d>=first.start;
}
function ccFeeCanEdit(record){
  if(!record||!ccFeeCycleEligible(record.bank,record.date))return false;
  if(record.transactionType==='refund'||record.status==='繳')return false;
  if(typeof ccPaidArchive!=='undefined' && ccPaidArchive){
    try{
      const c=getBankCycle(record.bank,record.date);
      const due=ccDueDateForClosedCycle(c,APP_CONFIG.banks[record.bank].paymentDueDay);
      const key=due?dateToInput(due).slice(0,7):'';
      const paid=ccPaidArchive?.[key]?.[record.bank];
      if(paid?.paid===true)return false;
    }catch(_e){}
  }
  return true;
}
