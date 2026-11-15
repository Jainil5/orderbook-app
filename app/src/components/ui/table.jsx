import { cn } from '../../lib/cn.js';

/** Wraps a table in a scroll container; `maxHeight` turns it into a sticky
 *  header pane, which is the only way thead sticks (an overflow:hidden card
 *  would otherwise become the scroll port). */
export function TableScroll({ children, className, maxHeight }) {
  return (
    <div
      className={cn('ob-scroll-x', maxHeight && 'overflow-y-auto', className)}
      style={maxHeight ? { maxHeight } : undefined}
    >
      {children}
    </div>
  );
}

export function Table({ children, className, minWidth = 560 }) {
  return (
    <table
      className={cn('ob-table w-full border-collapse text-left text-[0.86rem]', className)}
      style={{ minWidth }}
    >
      {children}
    </table>
  );
}

export function THead({ children, className }) {
  return (
    <thead className={cn('[&>tr]:border-b [&>tr]:border-line', className)}>
      {children}
    </thead>
  );
}

export function TBody({ children, className }) {
  return (
    <tbody className={cn('[&>tr:not(:last-child)>*]:border-b [&>tr:not(:last-child)>*]:border-line', className)}>
      {children}
    </tbody>
  );
}

export function TR({ children, className, ...props }) {
  return (
    <tr className={cn(className)} {...props}>
      {children}
    </tr>
  );
}

export function TH({ children, num, className, ...props }) {
  return (
    <th
      className={cn(
        'px-3 py-2.5 text-[0.68rem] font-semibold uppercase tracking-[0.11em] text-muted first:pl-5 last:pr-5',
        num && 'text-right',
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function TD({ children, num, className, ...props }) {
  return (
    <td
      className={cn('px-3 py-3 first:pl-5 last:pr-5', num && 'text-right', className)}
      {...props}
    >
      {children}
    </td>
  );
}
