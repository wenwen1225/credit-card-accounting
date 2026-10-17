const APP_CONFIG = {
  apiUrl: '/api/gas',
  version: {
    frontend: '2026.10.17-v5.7',
    expectedBackend: '1.8'
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
      cards: []
    },
    '富邦': {
      cycleStartDay: 23,
      paymentDueDay: 7,
      cards: []
    }
  }
};
