import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'button-interactive group/button relative inline-flex items-center justify-center overflow-hidden whitespace-nowrap rounded-xl text-sm font-semibold transition-[transform,box-shadow,background-color,border-color,color,filter] duration-200 will-change-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 motion-safe:active:scale-[0.985] disabled:pointer-events-none disabled:opacity-50 motion-safe:[&>svg]:transition-transform motion-safe:[&>svg]:duration-200 motion-safe:[&>svg]:ease-out',
  {
    variants: {
      variant: {
        default:
          'border border-cyan-400/30 bg-[linear-gradient(135deg,hsl(var(--primary)),rgb(37,99,235))] text-primary-foreground shadow-[0_10px_24px_rgba(8,145,178,0.24)] hover:brightness-[1.03] hover:shadow-[0_14px_28px_rgba(8,145,178,0.28)]',
        secondary:
          'border border-border/85 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(241,249,255,0.84))] text-slate-900 shadow-[0_8px_18px_rgba(15,23,42,0.05)] hover:border-cyan-300 hover:bg-white hover:text-slate-950 dark:bg-slate-950/55 dark:text-slate-100',
        ghost: 'bg-transparent text-foreground hover:bg-cyan-50/80 hover:text-cyan-900 dark:hover:bg-white/6 dark:hover:text-white',
        destructive:
          'bg-[linear-gradient(135deg,rgb(239,68,68),rgb(244,114,182))] text-white shadow-[0_10px_24px_rgba(239,68,68,0.20)] hover:shadow-[0_14px_28px_rgba(239,68,68,0.26)]'
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 rounded-lg px-3 text-xs',
        lg: 'h-11 rounded-xl px-6'
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
