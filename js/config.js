const APP_CONFIG = {
  apiUrl: 'https://script.google.com/macros/s/AKfycbzWYYRK-VLTixeEDPyKG2jA4--0VUcaXvi4HvXiOIYbp5kKbUMgylqqlrJA2JDDndCG7A/exec',
  storage: {
    paidKey: 'cc_demo_paid_v1'
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
      cycleStartDay: null,
      paymentDueDay: null,
      cards: []
    },
    '富邦': {
      cycleStartDay: null,
      paymentDueDay: null,
      cards: []
    }
  }
};
