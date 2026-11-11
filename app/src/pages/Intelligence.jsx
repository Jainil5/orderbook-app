import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

export default function Intelligence() {
  const [messages, setMessages] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    api.get('/intelligence/suggestions')
      .then((d) => setSuggestions(d.suggestions))
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  const send = async (text) => {
    const question = text.trim();
    if (!question || busy) return;
    setInput('');
    setError(null);
    const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: 'user', content: question }]);
    setBusy(true);
    try {
      const res = await api.post('/intelligence/chat', { message: question, history });
      setMessages((m) => [...m, { role: 'assistant', content: res.answer }]);
    } catch (exc) {
      setMessages((m) => m.slice(0, -1));
      setError(exc.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chat-page">
      <header className="page-head">
        <div>
          <h1>Intelligence</h1>
          <div className="page-sub">Ask about your sales — answers come from your live order data.</div>
        </div>
      </header>

      <div className="chat-thread">
        {messages.length === 0 && !busy && (
          <div className="chat-empty">
            <p>Try asking:</p>
            <div className="chat-suggestions">
              {suggestions.map((s) => (
                <button key={s} type="button" className="chip" onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            <div className="chat-bubble">
              <div className="chat-text">{m.content}</div>
            </div>
          </div>
        ))}
        {busy && (
          <div className="chat-msg assistant">
            <div className="chat-bubble chat-thinking">Analyzing your sales…</div>
          </div>
        )}
        {error && (
          <div className="error chat-error">
            <span>{error}</span>
            <button type="button" className="chip" onClick={() => send(messages.at(-1)?.content ?? '')}>
              Retry
            </button>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about revenue, products, customers…"
          disabled={busy}
          aria-label="Question for the sales analyst"
        />
        <button type="submit" className="btn primary" disabled={busy || !input.trim()}>Send</button>
      </form>
    </div>
  );
}