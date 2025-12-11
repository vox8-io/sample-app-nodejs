import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

// Configuration
const VOX8_API_KEY = process.env.VOX8_API_KEY;
const VOX8_API_URL = process.env.VOX8_API_URL || 'https://api.vox8.io';
const VOX8_WS_URL = process.env.VOX8_WS_URL || 'wss://api.vox8.io/v1/translate';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint to get session token (keeps API key secure on server)
app.post('/api/session', async (req, res) => {
  if (!VOX8_API_KEY) {
    console.error('VOX8_API_KEY environment variable not set');
    return res.status(503).json({
      error: 'config_error',
      message: 'API key not configured. Set VOX8_API_KEY environment variable.',
    });
  }

  try {
    const response = await fetch(`${VOX8_API_URL}/v1/session-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: VOX8_API_KEY }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Failed to get session token:', error);
      return res.status(500).json({
        error: 'session_error',
        message: 'Failed to create session',
      });
    }

    const { session_token, expires_in } = await response.json();

    res.json({
      session_token,
      ws_url: VOX8_WS_URL,
      expires_in,
    });
  } catch (error) {
    console.error('Error getting session token:', error);
    res.status(500).json({
      error: 'session_error',
      message: 'Failed to create session',
    });
  }
});

app.listen(PORT, () => {
  console.log(`vox8 sample app running at http://localhost:${PORT}`);
  if (!VOX8_API_KEY) {
    console.warn('WARNING: VOX8_API_KEY not set. Set it before using the app.');
  }
});
