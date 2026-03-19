import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-2xl text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-[linear-gradient(135deg,hsl(var(--primary)),rgb(29,78,216))] text-primary-foreground shadow-[0_12px_30px_rgba(8,145,178,0.28)] hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(8,145,178,0.34)]',
        secondary:
          'border border-border/80 bg-white/76 text-slate-900 shadow-[0_10px_24px_rgba(15,23,42,0.08)] hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white dark:bg-slate-950/55 dark:text-slate-100',
        ghost: 'bg-transparent text-foreground hover:bg-muted/75',
        destructive:
          'bg-[linear-gradient(135deg,rgb(239,68,68),rgb(244,114,182))] text-white shadow-[0_12px_28px_rgba(239,68,68,0.22)] hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(239,68,68,0.30)]'
      },
      size: {
        default: 'h-11 px-5 py-2.5',
        sm: 'h-9 rounded-xl px-3.5 text-xs',
        lg: 'h-12 rounded-2xl px-8'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
));
Button.displayName = 'Button';

export { Button, buttonVariants };
