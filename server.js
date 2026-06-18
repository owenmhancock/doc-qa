const express = require('express');
const cors = require('cors');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.post('/api/v1/messages', (req, res) => {
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
      proxyRes.on('end', () => {
        res.status(proxyRes.statusCode).send(data);
      });
    }
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err);
    res.status(500).json({ error: err.message });
  });

  proxyReq.write(body);
  proxyReq.end();
});

app.listen(3001, () => console.log('Proxy running on http://localhost:3001'));