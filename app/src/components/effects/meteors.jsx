import { useMemo } from 'react';
import { useReducedMotion } from 'motion/react';

/** Deterministic LCG so every render lays the same streaks down. */
function spread(seed, count) {
  const values = [];
  let state = seed;
  for (let index = 0; index < count; index += 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    values.push(state / 2147483648);
  }
  return values;
}

/** Ambient gold streaks for hero surfaces only. Decorative, pointer
 *  transparent, and completely absent under reduced motion. */
export function Meteors({ count = 12, seed = 7 }) {
  const reduceMotion = useReducedMotion();

  const meteors = useMemo(() => {
    const capped = Math.min(count, 18);
    const rnd = spread(seed, capped * 5);
    return Array.from({ length: capped }, (_, index) => ({
      left: rnd[index] * 100,
      top: rnd[capped + index] * 40,
      delay: rnd[capped * 2 + index] * 6,
      duration: 4.5 + rnd[capped * 3 + index] * 3.5,
      length: 70 + rnd[capped * 4 + index] * 90,
    }));
  }, [count, seed]);

  if (reduceMotion) return null;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {meteors.map((meteor, index) => (
        <span
          key={index}
          className="ob-meteor"
          style={{
            left: `${meteor.left}%`,
            top: `${meteor.top}%`,
            animationDelay: `${meteor.delay}s`,
            animationDuration: `${meteor.duration}s`,
            '--ob-meteor-length': `${meteor.length}px`,
          }}
        />
      ))}
    </div>
  );
}
