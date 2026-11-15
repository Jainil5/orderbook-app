import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AlertTriangle, RotateCcw, Send, Sparkles } from 'lucide-react';
import { api } from '../api.js';
import { PageHeader } from '../components/ui/page.jsx';
import { Button } from '../components/ui/button.jsx';
import { Meteors } from '../components/effects/meteors.jsx';
import { cn } from '../lib/cn.js';

function Dots() {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <span className="text-[0.84rem] italic text-muted">Analyzing your sales…</span>;
  return (
    <span className="inline-flex items-center gap-1.5 py-1" aria-label="Analyzing">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-roast"
          animate={{ opacity: [0.25, 1, 0.25], y: [0, -3, 0] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.16, ease: 'easeInOut' }}
        />
      ))}
    </span>
  );
}

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
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
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

  const reduceMotion = useReducedMotion();
  const bubbleIn = reduceMotion
    ? {}
    : { initial: { opacity: 0, y: 10, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } };

  return (
    <div className="flex h-[calc(100dvh-190px)] min-h-[440px] flex-col lg:h-[calc(100dvh-104px)]">
      <PageHeader
        title="Intelligence"
        subtitle="Ask about your sales — answers come from your live order data."
        className="shrink-0"
      />

      <div className="ob-scroll-x min-h-0 grow overflow-y-auto pr-1">
        {messages.length === 0 && !busy ? (
          <div className="ob-card relative mx-auto mt-2 flex max-w-2xl flex-col items-center gap-4 overflow-hidden px-6 py-10 text-center">
            <Meteors count={10} seed={5} />
            <span className="ob-mark grid size-11 place-items-center rounded-2xl">
              <Sparkles className="size-5" aria-hidden />
            </span>
            <div>
              <h2 className="font-display text-[1.2rem]">Ask anything about the shop</h2>
              <p className="mx-auto mt-1.5 max-w-md text-[0.84rem] leading-snug text-muted">
                Questions are answered from the orders on this machine. Pick a starter or type your own.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <motion.button
                  key={s}
                  type="button"
                  className="rounded-full border border-line bg-surface px-4 py-2.5 text-left text-[0.84rem] shadow-[var(--ob-shadow-sm)] transition-colors hover:border-roast hover:text-roast"
                  onClick={() => send(s)}
                  whileHover={reduceMotion ? undefined : { y: -2 }}
                >
                  {s}
                </motion.button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mx-auto flex max-w-3xl flex-col gap-3 py-2">
          <AnimatePresence initial={false}>
            {messages.map((m, i) => (
              <motion.div
                key={i}
                {...bubbleIn}
                className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'max-w-[85%] overflow-hidden rounded-[var(--ob-radius-lg)] px-4 py-3 text-[0.9rem] leading-[1.55] whitespace-pre-wrap',
                    m.role === 'user'
                      ? 'rounded-br-sm bg-[image:var(--ob-gradient-primary)] text-leaf-ink shadow-[var(--shadow-roast)]'
                      : 'ob-card rounded-bl-sm',
                  )}
                >
                  {m.content}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {busy ? (
            <div className="flex justify-start">
              <div className="ob-card max-w-[85%] rounded-bl-sm px-4 py-3">
                <Dots />
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--ob-radius-md)] border border-rouge/35 bg-[color-mix(in_srgb,var(--ob-danger)_9%,var(--ob-surface))] px-4 py-3 text-[0.84rem]">
              <span className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rouge" aria-hidden />
                {error}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => send(messages.at(-1)?.content ?? input)}
                disabled={busy}
              >
                <RotateCcw className="size-3.5" aria-hidden />
                Retry
              </Button>
            </div>
          ) : null}

          <div ref={bottomRef} />
        </div>
      </div>

      <form
        className="mt-3 flex shrink-0 gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about revenue, products, customers…"
          disabled={busy}
          aria-label="Question for the sales analyst"
          className="ob-input min-h-11 grow text-[0.92rem]"
        />
        <Button type="submit" disabled={busy || !input.trim()}>
          <Send className="size-4" aria-hidden />
          Send
        </Button>
      </form>
    </div>
  );
}
