import { cn } from '../../lib/cn.js';

function Label({ className, children, ...props }) {
  return (
    <label
      className={cn(
        'text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-muted',
        className,
      )}
      {...props}
    >
      {children}
    </label>
  );
}

export function Input({ className, ...props }) {
  return <input className={cn('ob-input min-h-11 text-[0.92rem]', className)} {...props} />;
}

export function Select({ className, children, ...props }) {
  return (
    <select className={cn('ob-input min-h-11 text-[0.92rem]', className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }) {
  return <textarea className={cn('ob-input text-[0.92rem]', className)} {...props} />;
}

export function Checkbox({ className, label, ...props }) {
  return (
    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 pr-2 text-[0.85rem] text-ink">
      <input
        type="checkbox"
        className={cn(
          'size-5 shrink-0 cursor-pointer appearance-none rounded-md border border-line-2 bg-bg-deep',
          'bg-[length:100%] bg-center bg-no-repeat transition',
          'checked:border-leaf checked:bg-leaf',
          'checked:bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 16 16%27 fill=%27none%27 stroke=%27%2304210f%27 stroke-width=%272.5%27 stroke-linecap=%27round%27%3E%3Cpath d=%27M3.5 8.5 6.5 11.5 12.5 4.5%27/%3E%3C/svg%3E")]',
          className,
        )}
        {...props}
      />
      {label}
    </label>
  );
}

/** label + control + hint, so a field never loses its caption. */
export function Field({ label, hint, htmlFor, className, children }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <Label htmlFor={htmlFor}>{label}</Label>
      )}
      {children}
      {hint && <p className="text-[0.72rem] leading-snug text-muted">{hint}</p>}
    </div>
  );
}
