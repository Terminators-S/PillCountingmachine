import * as React from 'react';
import { cn } from '../../lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          'h-10 w-full rounded-xl border border-input/90 bg-white/84 px-3.5 py-2 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.66)] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-slate-950/45',
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';
