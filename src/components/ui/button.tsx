import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[0.5rem] text-sm font-semibold leading-5 transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground enabled:hover:bg-primary/90 enabled:active:bg-primary/80",
        outline:
          "border border-border bg-transparent text-foreground enabled:hover:bg-muted enabled:active:bg-foreground/10",
        secondary:
          "border border-border bg-muted text-foreground enabled:hover:bg-foreground/10 enabled:active:bg-foreground/20",
        ghost:
          "bg-transparent text-foreground enabled:hover:bg-muted enabled:active:bg-foreground/10",
        destructive:
          "bg-destructive text-destructive-foreground enabled:hover:opacity-90 enabled:active:opacity-80",
      },
      size: {
        default: "min-h-12 px-4 py-2",
        sm: "min-h-11 px-3 py-2",
        icon: "h-11 w-11 shrink-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
