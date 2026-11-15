import { useId } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '../../lib/cn.js';

/** Pill group with a spring-driven indicator that slides between choices. */
export function SegmentedControl({ value, onChange, options, label, className }) {
  const reduceMotion = useReducedMotion();
  const group = useId();

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'ob-no-scrollbar inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-surface-2 p-1',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.id)}
            className={cn(
              'relative shrink-0 rounded-full px-3.5 py-2 min-h-9 text-xs font-semibold transition-colors pointer-coarse:min-h-11',
              selected ? 'text-leaf-ink' : 'text-muted hover:text-ink',
            )}
          >
            {selected && (
              <motion.span
                layoutId={`ob-segment-${group}`}
                transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 40 }}
                className="absolute inset-0 rounded-full bg-leaf shadow-[0_8px_20px_-8px_rgba(95,214,138,0.65)]"
                aria-hidden
              />
            )}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
