import { useEffect, useRef, useState } from 'react';

const easeOutExpo = (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p));

/** Rolls to each new value like the Aceternity stats ticker. State starts at
 *  the final number and the roll only begins on the first animation frame, so a
 *  background tab (where rAF is paused) still shows the correct figure instead
 *  of a stalled zero. Reduced motion renders the final value directly. */
export function NumberTicker({
  value,
  format = (v) => Math.round(v).toLocaleString('en-IN'),
  duration = 0.9,
  className,
}) {
  const number = Number(value) || 0;
  const [shown, setShown] = useState(number);
  const shownRef = useRef(number);
  const firstRef = useRef(true);
  const reduce = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  shownRef.current = shown;

  useEffect(() => {
    if (reduce || duration <= 0) {
      setShown(number);
      return undefined;
    }
    const from = firstRef.current ? 0 : shownRef.current;
    firstRef.current = false;
    let raf = 0;
    let start = 0;
    const step = (now) => {
      if (!start) start = now;
      const progress = (now - start) / (duration * 1000);
      setShown(from + (number - from) * easeOutExpo(progress));
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [number, reduce, duration]);

  return <span className={className}>{format(shown)}</span>;
}
