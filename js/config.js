const APP_CONFIG = {
  apiUrl: '/api/gas',
  version: {
    frontend: '2026.10.25-v5.57',
    expectedBackend: '2.7.11'
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
