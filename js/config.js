const APP_CONFIG = {
  storage: {
    recordsKey: 'cc_demo_records_v1',
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
  },
  seedRecords: [
    {id:1,bank:'中信',card:'無限卡VISA',date:'2026-10-09',item:'Olive Young',twd:3460,currency:'KRW',foreign:144500,status:'刷',note:''},
    {id:2,bank:'國泰',card:'',date:'2026-10-10',item:'午餐-3人 豬肉湯飯',twd:752,currency:'KRW',foreign:31500,status:'刷',note:''},
    {id:3,bank:'台新',card:'',date:'2026-10-15',item:'萬聖節三麗鷗盲盒*4',twd:1596,currency:'',foreign:null,status:'刷',note:''},
    {id:4,bank:'富邦',card:'',date:'2026-10-08',item:'秀泰 IU電影票*1',twd:1140,currency:'',foreign:null,status:'刷',note:'被請款'},
    {id:5,bank:'中信',card:'UniOpen卡',date:'2026-09-18',item:'便利商店',twd:428,currency:'KRW',foreign:18000,status:'刷',note:''},
    {id:6,bank:'國泰',card:'',date:'2026-09-21',item:'J.estina',twd:5380,currency:'KRW',foreign:226000,status:'刷',note:''},
    {id:7,bank:'中信',card:'line pay卡',date:'2026-10-16',item:'待補台幣示範',twd:null,currency:'KRW',foreign:50000,status:'刷',note:'這筆會出現在待處理'}
  ]
};
