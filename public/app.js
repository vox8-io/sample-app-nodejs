// vox8 sample app - browser client
// Uses the @vox8/sdk pattern but implemented directly for this sample

const toggleBtn = document.getElementById('toggleBtn');
const targetLanguageSelect = document.getElementById('targetLanguage');
const transcriptArea = document.getElementById('transcriptArea');
const originalTranscript = document.getElementById('originalTranscript');
const translatedTranscript = document.getElementById('translatedTranscript');
const errorMessage = document.getElementById('errorMessage');

let isRecording = false;
let ws = null;
let stream = null;
let audioContext = null;
let processor = null;
let playbackContext = null;
let audioQueue = [];
let isPlaying = false;
let sessionReady = false;

// Transcript history
let originalHistory = [];
let translatedHistory = [];
let currentOriginal = '';

// Audio utilities (from @vox8/sdk)
function floatTo16BitPCM(float32Array) {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16Array;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Audio playback queue
async function playNextAudio() {
  if (audioQueue.length === 0) {
    isPlaying = false;
    return;
  }

  isPlaying = true;
  const audioData = audioQueue.shift();

  try {
    if (!playbackContext) {
      playbackContext = new AudioContext();
    }

    const arrayBuffer = base64ToArrayBuffer(audioData);
    const audioBuffer = await playbackContext.decodeAudioData(arrayBuffer);
    const source = playbackContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(playbackContext.destination);
    source.onended = () => playNextAudio();
    source.start(0);
  } catch (error) {
    console.error('Error playing audio:', error);
    playNextAudio();
  }
}

function queueAudio(audioBase64) {
  audioQueue.push(audioBase64);
  if (!isPlaying) {
    playNextAudio();
  }
}

// Update transcript display
function updateTranscripts() {
  let originalHtml = originalHistory.map(text => `<p>${text}</p>`).join('');
  if (currentOriginal) {
    originalHtml += `<p class="interim">${currentOriginal}</p>`;
  }
  originalTranscript.innerHTML = originalHtml;
  originalTranscript.scrollTop = originalTranscript.scrollHeight;

  translatedTranscript.innerHTML = translatedHistory.map(text => `<p>${text}</p>`).join('');
  translatedTranscript.scrollTop = translatedTranscript.scrollHeight;
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.style.display = 'block';
}

function hideError() {
  errorMessage.style.display = 'none';
}

// Cleanup function
function cleanup() {
  if (ws) {
    ws.close();
    ws = null;
  }
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  if (processor) {
    processor.disconnect();
    processor = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  sessionReady = false;
}

// Start recording
async function startRecording() {
  hideError();

  if (!navigator.mediaDevices?.getUserMedia) {
    showError('Microphone access is not available in this browser.');
    return;
  }

  try {
    // Update UI
    toggleBtn.disabled = true;
    toggleBtn.innerHTML = 'Connecting...';

    // Clear previous transcripts
    originalHistory = [];
    translatedHistory = [];
    currentOriginal = '';
    audioQueue = [];
    updateTranscripts();
    transcriptArea.style.display = 'grid';

    // Get microphone access
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
      }
    });

    // Get session token from backend
    const response = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to get session');
    }

    const { ws_url, session_token } = await response.json();

    // Connect to WebSocket
    ws = new WebSocket(ws_url);

    ws.onopen = () => {
      // Send session_start with secure session token (not API key)
      ws.send(JSON.stringify({
        type: 'session_start',
        session_token,
        source_language: 'auto',
        target_language: targetLanguageSelect.value,
        voice_mode: 'match',
        audio_format: 'pcm_s16le',
      }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      switch (msg.type) {
        case 'session_ready':
          sessionReady = true;
          startAudioCapture();
          break;

        case 'transcript':
          if (msg.text) {
            currentOriginal = msg.text;
          }
          if (msg.is_final && msg.translation) {
            originalHistory.push(msg.text);
            translatedHistory.push(msg.translation);
            currentOriginal = '';
          }
          updateTranscripts();
          break;

        case 'audio':
          if (msg.audio) {
            queueAudio(msg.audio);
          }
          break;

        case 'error':
          console.error('API error:', msg);
          showError(msg.message || 'Unknown error');
          if (msg.fatal) {
            stopRecording();
          }
          break;

        case 'session_complete':
          break;
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      showError('Connection error. Please try again.');
      stopRecording();
    };

    ws.onclose = () => {
      isRecording = false;
      updateButton();
    };

  } catch (error) {
    console.error('Error starting recording:', error);
    let message = 'Failed to start recording. Please try again.';
    if (error.name === 'NotAllowedError') {
      message = 'Microphone permission denied. Please allow mic access and try again.';
    } else if (error.name === 'NotFoundError') {
      message = 'No microphone found. Please connect a microphone.';
    }
    showError(message);
    cleanup();
    updateButton();
  }
}

function startAudioCapture() {
  // Create AudioContext for PCM conversion
  audioContext = new AudioContext({ sampleRate: 16000 });
  const source = audioContext.createMediaStreamSource(stream);
  processor = audioContext.createScriptProcessor(4096, 1, 1);

  processor.onaudioprocess = (event) => {
    if (!ws || ws.readyState !== WebSocket.OPEN || !sessionReady) return;

    const inputData = event.inputBuffer.getChannelData(0);
    const pcm16 = floatTo16BitPCM(inputData);
    const base64 = arrayBufferToBase64(pcm16.buffer);

    ws.send(JSON.stringify({
      type: 'audio',
      audio: base64,
    }));
  };

  source.connect(processor);
  processor.connect(audioContext.destination);

  isRecording = true;
  updateButton();
}

// Stop recording
function stopRecording() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'session_end' }));
  }
  cleanup();
  isRecording = false;
  updateButton();
}

// Update button state
function updateButton() {
  toggleBtn.disabled = false;
  if (isRecording) {
    toggleBtn.innerHTML = '<span class="recording-indicator"></span> Stop recording';
    toggleBtn.classList.add('btn-danger');
    toggleBtn.classList.remove('btn-primary');
  } else {
    toggleBtn.innerHTML = '<span class="mic-icon">🎤</span> Start speaking';
    toggleBtn.classList.add('btn-primary');
    toggleBtn.classList.remove('btn-danger');
  }
}

// Event listeners
toggleBtn.addEventListener('click', () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});
