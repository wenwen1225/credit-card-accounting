/**
 * 信用卡記帳 GAS 後端 v0.2
 * 新增：dataVersion 輕量資料版本查詢，用 Google Drive 檔案最後修改時間判斷四家 Sheet 是否有更新。
 */

const CREDIT_CARD_CONFIG = {
  ctbc: {
    bank: '中信',
    spreadsheetId: '1i70VExIdT3mxtECgmu5FLXbq4nuWBBVAyOu0KQDvgA8',
    cycleStartDay: 6,
    paymentDueDay: 23
  },
  cathay: {
    bank: '國泰',
    spreadsheetId: '10vcvD_9Lq2EAdepXLZY-F4MCGJYtanq4dLcRvqDifKU',
    cycleStartDay: 9,
    paymentDueDay: 24
  },
  taishin: {
    bank: '台新',
    spreadsheetId: '1wwtXwQ41ikquxyiwq05MGCBGic8koKZZQRFUkZoISUU',
    cycleStartDay: null,
    paymentDueDay: null
  },
  fubon: {
    bank: '富邦',
    spreadsheetId: '1Ni4I3131BMCwqvTl6Hp877DvvUNz30nGMezd08gC4NM',
    cycleStartDay: null,
    paymentDueDay: null
  }
};

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'health';

  try {
    if (action === 'health') {
      return json_({
        ok: true,
        version: '0.2',
        message: 'credit-card backend is running'
      });
    }

    if (action === 'dataVersion') {
      const year = Number(e.parameter.year || new Date().getFullYear());
      return json_({
        ok: true,
        version: '0.2',
        year: year,
        dataVersion: getDataVersion_(year)
      });
    }

    if (action === 'records') {
      const year = Number(e.parameter.year || new Date().getFullYear());
      return json_({
        ok: true,
        records: getAllRecords_(year),
        config: getPublicConfig_(),
        meta: {
          year: year,
          dataVersion: getDataVersion_(year)
        }
      });
    }

    return json_({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.stack ? err.stack : err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = body.action;

    if (action === 'updateRecord') {
      return json_({ ok: true, record: updateRecord_(body.record) });
    }

    if (action === 'deleteRecord') {
      deleteRecord_(body.source);
      return json_({ ok: true });
    }

    return json_({ ok: false, error: 'Unknown POST action: ' + action });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.stack ? err.stack : err) });
  }
}

function getDataVersion_(year) {
  const parts = [String(year)];

  Object.keys(CREDIT_CARD_CONFIG).forEach(key => {
    const cfg = CREDIT_CARD_CONFIG[key];
    if (!cfg.spreadsheetId) return;

    const modified = DriveApp.getFileById(cfg.spreadsheetId).getLastUpdated().getTime();
    parts.push(key + ':' + modified);
  });

  return parts.join('|');
}

function getAllRecords_(year) {
  const result = [];

  Object.keys(CREDIT_CARD_CONFIG).forEach(key => {
    const cfg = CREDIT_CARD_CONFIG[key];
    if (!cfg.spreadsheetId) return;

    const ss = SpreadsheetApp.openById(cfg.spreadsheetId);

    ss.getSheets().forEach(sheet => {
      const name = sheet.getName();
      if (!looksLikePeriodSheet_(name)) return;

      const rows = readBankSheet_(sheet, cfg, year);
      result.push.apply(result, rows);
    });
  });

  return result
    .filter(r => String(r.date || '').startsWith(String(year) + '-'))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function readBankSheet_(sheet, cfg, year) {
  const values = sheet.getDataRange().getDisplayValues();
  if (!values || !values.length) return [];

  const header = findHeaderRow_(values);
  if (!header) return [];

  const headerRowIndex = header.rowIndex;
  const map = header.map;
  const out = [];

  for (let r = headerRowIndex + 1; r < values.length; r++) {
    const row = values[r];

    const item = valueBy_(row, map, ['項目', '品名', '消費項目']);
    const amount = valueBy_(row, map, ['金額', '台幣金額']);
    const date = valueBy_(row, map, ['刷卡日期', '日期']);

    if (!item && !amount && !date) continue;

    const dateIso = normalizeDate_(date, year);
    if (!dateIso || !String(dateIso).startsWith(String(year) + '-')) continue;

    out.push({
      bank: cfg.bank,
      card: valueBy_(row, map, ['卡別']),
      date: dateIso,
      item: item,
      twd: numberOrNull_(amount),
      foreignCurrency: inferForeignCurrency_(map),
      foreignAmount: numberOrNull_(valueBy_(row, map, ['外幣金額', '韓幣金額', '日幣金額', '美元金額'])),
      status: valueBy_(row, map, ['進度']),
      note: valueBy_(row, map, ['備註']),
      source: {
        spreadsheetId: cfg.spreadsheetId,
        sheetName: sheet.getName(),
        row: r + 1,
        headerRow: headerRowIndex + 1
      }
    });
  }

  return out;
}

function findHeaderRow_(values) {
  const limit = Math.min(values.length, 12);

  for (let r = 0; r < limit; r++) {
    const row = values[r].map(v => String(v || '').trim());
    const hasItem = row.includes('項目') || row.includes('品名') || row.includes('消費項目');
    const hasAmount = row.includes('金額') || row.includes('台幣金額');
    const hasDate = row.includes('刷卡日期') || row.includes('日期');

    if (hasItem && hasAmount && hasDate) {
      const map = {};
      row.forEach((name, i) => {
        if (name) map[name] = i;
      });
      return { rowIndex: r, map: map };
    }
  }

  return null;
}

function updateRecord_(record) {
  if (!record || !record.source) throw new Error('Missing source information');

  const source = record.source;
  const ss = SpreadsheetApp.openById(source.spreadsheetId);
  const sheet = ss.getSheetByName(source.sheetName);
  if (!sheet) throw new Error('找不到來源分頁：' + source.sheetName);

  const values = sheet.getDataRange().getDisplayValues();
  const header = findHeaderRow_(values);
  if (!header) throw new Error('找不到標題列');

  const rowNumber = Number(source.row);
  if (!rowNumber || rowNumber <= header.rowIndex + 1) throw new Error('來源列號不正確');

  setIfColumnExists_(sheet, rowNumber, header.map, ['項目', '品名', '消費項目'], record.item);
  setIfColumnExists_(sheet, rowNumber, header.map, ['金額', '台幣金額'], record.twd);
  setIfColumnExists_(sheet, rowNumber, header.map, ['刷卡日期', '日期'], record.date);
  setIfColumnExists_(sheet, rowNumber, header.map, ['進度'], record.status);
  setIfColumnExists_(sheet, rowNumber, header.map, ['卡別'], record.card);
  setIfColumnExists_(sheet, rowNumber, header.map, ['備註'], record.note);
  setIfColumnExists_(sheet, rowNumber, header.map,
    ['外幣金額', '韓幣金額', '日幣金額', '美元金額'],
    record.foreignAmount
  );

  return record;
}

function deleteRecord_(source) {
  if (!source) throw new Error('Missing source information');

  const ss = SpreadsheetApp.openById(source.spreadsheetId);
  const sheet = ss.getSheetByName(source.sheetName);
  if (!sheet) throw new Error('找不到來源分頁：' + source.sheetName);

  const rowNumber = Number(source.row);
  if (!rowNumber) throw new Error('來源列號不正確');

  sheet.deleteRow(rowNumber);
}

function setIfColumnExists_(sheet, rowNumber, map, names, value) {
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    if (Object.prototype.hasOwnProperty.call(map, name)) {
      sheet.getRange(rowNumber, map[name] + 1).setValue(value == null ? '' : value);
      return true;
    }
  }
  return false;
}

function valueBy_(row, map, names) {
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    if (Object.prototype.hasOwnProperty.call(map, name)) {
      return String(row[map[name]] || '').trim();
    }
  }
  return '';
}

function inferForeignCurrency_(map) {
  if (Object.prototype.hasOwnProperty.call(map, '韓幣金額')) return 'KRW';
  if (Object.prototype.hasOwnProperty.call(map, '日幣金額')) return 'JPY';
  if (Object.prototype.hasOwnProperty.call(map, '美元金額')) return 'USD';
  return '';
}

function numberOrNull_(value) {
  if (value == null || value === '') return null;
  const cleaned = String(value).replace(/[,\sNT$₩¥$]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function normalizeDate_(value, fallbackYear) {
  if (!value) return '';

  const raw = String(value).trim();

  let m = raw.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) return `${m[1]}-${pad_(m[2])}-${pad_(m[3])}`;

  m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (m) return `${fallbackYear}-${pad_(m[1])}-${pad_(m[2])}`;

  return raw;
}

function looksLikePeriodSheet_(name) {
  return /^\d{2}\/\d{1,2}\/\d{1,2}$/.test(String(name || '').trim());
}

function getPublicConfig_() {
  const out = {};
  Object.keys(CREDIT_CARD_CONFIG).forEach(key => {
    const c = CREDIT_CARD_CONFIG[key];
    out[key] = {
      bank: c.bank,
      cycleStartDay: c.cycleStartDay,
      paymentDueDay: c.paymentDueDay,
      enabled: Boolean(c.spreadsheetId)
    };
  });
  return out;
}

function pad_(n) {
  return String(n).padStart(2, '0');
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
