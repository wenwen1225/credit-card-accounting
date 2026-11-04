const APP_CONFIG = {
  apiUrl: '/api/gas',
  version: {
    frontend: '2026.11.04-v5.67',
    expectedBackend: '2.8.1'
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
      paymentDueDay: 9,
      firstPaymentDueDate: '2026-11-09',
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
