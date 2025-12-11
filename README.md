# Vox8 sample app (Node.js)

A simple Node.js + Express app demonstrating the Vox8 JavaScript SDK for real-time speech translation.

## Features

- Real-time speech-to-speech translation
- Secure session token authentication (API key stays on server)
- Voice matching (translated audio preserves your voice)
- 32 target languages

## Setup

1. Install dependencies:

```bash
npm install
```

2. Set your Vox8 API key:

```bash
export VOX8_API_KEY=vox8_your_api_key_here
```

Get your API key at https://vox8.com/dashboard

3. Start the server:

```bash
npm start
```

4. Open http://localhost:3001 in your browser

## How it works

### Backend (`server.js`)

The Express server:
- Serves the static frontend files
- Provides `/api/session` endpoint that exchanges the API key for a short-lived session token
- Keeps your API key secure on the server

### Frontend (`public/app.js`)

The browser app:
- Requests a session token from the backend
- Connects to the Vox8 WebSocket API with the session token
- Captures microphone audio and sends it as base64-encoded PCM
- Receives transcripts and translated audio
- Plays translated audio automatically

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `VOX8_API_KEY` | (required) | Your Vox8 API key |
| `VOX8_API_URL` | `https://api.vox8.io` | Vox8 API base URL |
| `VOX8_WS_URL` | `wss://api.vox8.io/v1/translate` | Vox8 WebSocket URL |
| `PORT` | `3001` | Server port |

## SDK pattern

This sample follows the recommended pattern from the [@vox8/sdk](https://github.com/vox8-io/sdk-javascript):

1. **Backend**: Exchange API key for session token via `POST /v1/session-token`
2. **Browser**: Use session token (not API key) to connect to WebSocket
3. **WebSocket**: Send `session_start` with `session_token`, then stream audio

See the [full SDK documentation](https://vox8.com/docs#sdk-javascript) for more details.
