const GAS_URL = 'https://script.google.com/macros/s/AKfycbzWYYRK-VLTixeEDPyKG2jA4--0VUcaXvi4HvXiOIYbp5kKbUMgylqqlrJA2JDDndCG7A/exec';

function getRecordYear(value) {
  if (!value) return null;
  const match = String(value).trim().match(/^(\d{4})[-\/]/);
  return match ? Number(match[1]) : null;
}

module.exports = async function handler(req, res) {
  try {
    let response;

    if (req.method === 'GET') {
      const params = new URLSearchParams();
      Object.entries(req.query || {}).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach(v => params.append(key, String(v)));
        } else if (value !== undefined && value !== null) {
          params.set(key, String(value));
        }
      });

      const url = params.toString() ? `${GAS_URL}?${params.toString()}` : GAS_URL;
      response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        cache: 'no-store'
      });

      const text = await response.text();
      const action = String(req.query?.action || '');
      const requestedYear = Number(req.query?.year || 0);

      if (response.ok && action === 'records' && requestedYear) {
        try {
          const data = JSON.parse(text);
          if (data.ok && Array.isArray(data.records)) {
            const before = data.records.length;
            data.records = data.records.filter(record => getRecordYear(record?.date) === requestedYear);
            data.meta = {
              ...(data.meta || {}),
              requestedYear,
              sourceRecordCount: before,
              returnedRecordCount: data.records.length
            };
          }

          res.status(response.status);
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          return res.send(JSON.stringify(data));
        } catch (_) {
          // 若 GAS 回傳不是 JSON，保留原始內容，方便前端顯示錯誤。
        }
      }

      res.status(response.status);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.send(text);
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body || {});

      response = await fetch(GAS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body,
        redirect: 'follow'
      });

      const text = await response.text();
      res.status(response.status);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.send(text);
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
};
