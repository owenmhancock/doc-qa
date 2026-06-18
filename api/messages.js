const https = require('https');

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = req.headers['x-api-key'];
  const body = JSON.stringify(req.body);
  const isStream = req.body.stream === true;

  const options = {
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(body),
    },
  };

  if (isStream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
  }

  const proxyReq = https.request(options, (proxyRes) => {
    if (isStream) {
      proxyRes.on('data', chunk => res.write(chunk));
      proxyRes.on('end', () => res.end());
    } else {
      let data = '';
      proxyRes.on('data', chunk => data += chunk);
      proxyRes.on('end', () => res.status(proxyRes.statusCode).send(data));
    }
  });

  proxyReq.on('error', (err) => {
    res.status(500).json({ error: err.message });
  });

  proxyReq.write(body);
  proxyReq.end();
}