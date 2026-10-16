const GAS_URL = 'https://script.google.com/macros/s/AKfycbzWYYRK-VLTixeEDPyKG2jA4--0VUcaXvi4HvXiOIYbp5kKbUMgylqqlrJA2JDDndCG7A/exec';

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
    } else if (req.method === 'POST') {
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
    } else {
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    const text = await response.text();
    res.status(response.status);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(text);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
};
