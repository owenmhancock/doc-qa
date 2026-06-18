import { useState, useRef, useEffect } from 'react';
import './App.css';

const SYSTEM_PROMPT = `You are this document, speaking in the first person. You have been uploaded as a PDF and the user is now talking directly to you. Respond as though you are the document itself — use "I" and "my" naturally, refer to your own contents, arguments, and findings as things you said, wrote, or believe. Be conversational but stay faithful to what's actually in your pages. If the user asks about something you don't contain, say so honestly — something like "that's not something I cover" rather than breaking character. Never refer to yourself as an AI or a document analyst.`;

const STARTERS = [
  'Introduce yourself — what are you about?',
  'What are your key arguments or findings?',
  'What problem do you address?',
  'What would you push back on in yourself?',
];

function App() {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [pdfBase64, setPdfBase64] = useState(null);
  const [pdfName, setPdfName] = useState('');
  const [messages, setMessages] = useState([]);
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 140) + 'px';
    }
  }, [input]);

  const loadFile = (file) => {
    if (!file || file.type !== 'application/pdf') return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      setPdfBase64(base64);
      setPdfName(file.name);
      setMessages([]);
      setHistory([]);
      greet(base64, apiKey);
    };
    reader.readAsDataURL(file);
  };

  const greet = async (base64, key) => {
    if (!key) return;
    setThinking(true);
    try {
      const res = await fetch('/api/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 300,
          system: SYSTEM_PROMPT,
          messages: [{
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
              { type: 'text', text: 'Introduce yourself in 2-3 sentences. Who are you, what do you cover, and what should I ask you about?' }
            ]
          }]
        })
      });
      const data = await res.json();
      const reply = data.content.map(b => b.text || '').join('');
      const seedHistory = [
        { role: 'user', content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: 'Introduce yourself in 2-3 sentences. Who are you, what do you cover, and what should I ask you about?' }
        ]},
        { role: 'assistant', content: reply }
      ];
      setHistory(seedHistory);
      setMessages([{ role: 'assistant', text: reply }]);
    } catch (e) {
      console.error(e);
    }
    setThinking(false);
  };

  const sendMessage = async (text) => {
    const userText = text || input.trim();
    if (!userText || !pdfBase64 || !apiKey || thinking) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userText }]);
    setThinking(true);

    const newHistory = [...history, { role: 'user', content: userText }];
    setHistory(newHistory);

    let fullReply = '';
    setMessages(prev => [...prev, { role: 'assistant', text: '', streaming: true }]);

    try {
      const res = await fetch('/api/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          stream: true,
          system: SYSTEM_PROMPT,
          messages: newHistory,
        })
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
        for (const line of lines) {
          try {
            const json = JSON.parse(line.slice(6));
            if (json.type === 'content_block_delta' && json.delta?.text) {
              fullReply += json.delta.text;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', text: fullReply, streaming: true };
                return updated;
              });
            }
          } catch (e) {}
        }
      }

      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', text: fullReply, streaming: false };
        return updated;
      });
      setHistory(prev => [...prev, { role: 'assistant', content: fullReply }]);
    } catch (e) {
      setMessages(prev => prev.slice(0, -1));
      console.error(e);
    }
    setThinking(false);
  };

  const canSend = apiKey && pdfBase64 && input.trim() && !thinking;

  return (
    <div className="shell">
      <header className="header">
        <div className="logo">doc<span>·</span>qa</div>
        <div className="status">
          <div className={`dot ${pdfBase64 ? (thinking ? 'thinking' : 'ready') : ''}`} />
          <span>{pdfBase64 ? (thinking ? 'thinking...' : pdfName) : 'no document loaded'}</span>
        </div>
      </header>

      <aside className="sidebar">
        <div className="section">
          <div className="label">API Key</div>
          <div className="key-wrap">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              className="key-input"
            />
            <button className="key-toggle" onClick={() => setShowKey(s => !s)}>
              {showKey ? '🙈' : '👁'}
            </button>
          </div>
        </div>

        <div className="section">
          <div className="label">Document</div>
          {!pdfBase64 ? (
            <div
              className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); loadFile(e.dataTransfer.files[0]); }}
              onClick={() => document.getElementById('fileInput').click()}
            >
              <div className="upload-icon">📄</div>
              <div className="upload-label"><strong>Choose a PDF</strong><br />or drag it here</div>
              <input id="fileInput" type="file" accept=".pdf" style={{ display: 'none' }}
                onChange={e => loadFile(e.target.files[0])} />
            </div>
          ) : (
            <div className="doc-card">
              <div className="doc-name">{pdfName}</div>
              <button className="doc-remove" onClick={() => {
                setPdfBase64(null); setPdfName(''); setMessages([]); setHistory([]);
              }}>Remove document</button>
            </div>
          )}
        </div>

        <div className="section">
          <div className="label">Starter questions</div>
          <div className="starters">
            {STARTERS.map(s => (
              <button key={s} className="starter-btn" onClick={() => sendMessage(s)}
                disabled={!pdfBase64 || !apiKey || thinking}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="chat">
        <div className="messages">
          {messages.length === 0 && !thinking && (
            <div className="empty">
              <div className="empty-icon">📋</div>
              <p>Upload a PDF and it will speak for itself.</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`msg ${msg.role}`}>
              <div className="avatar">{msg.role === 'user' ? 'You' : 'Doc'}</div>
              <div className="bubble">
                {msg.text}
                {msg.streaming && <span className="cursor" />}
              </div>
            </div>
          ))}
          {thinking && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="msg assistant">
              <div className="avatar">Doc</div>
              <div className="bubble">
                <div className="dots"><span /><span /><span /></div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="input-bar">
          <textarea
            ref={textareaRef}
            className="input"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask the document anything..."
            rows={1}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
            }}
          />
          <button className="send-btn" onClick={() => sendMessage()} disabled={!canSend}>↑</button>
        </div>
      </main>
    </div>
  );
}

export default App;