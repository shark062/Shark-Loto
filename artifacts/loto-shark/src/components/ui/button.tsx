import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[rgba(0,255,204,0.12)] text-[#00ffcc] border border-[rgba(0,255,204,0.35)] hover:bg-[rgba(0,255,204,0.22)] hover:border-[rgba(0,255,204,0.6)] hover:shadow-[0_0_14px_rgba(0,255,204,0.25)] active:scale-[0.97]",
        destructive:
          "bg-[rgba(255,60,60,0.15)] text-red-400 border border-[rgba(255,60,60,0.4)] hover:bg-[rgba(255,60,60,0.25)] hover:shadow-[0_0_14px_rgba(255,60,60,0.25)] active:scale-[0.97]",
        outline:
          "bg-[rgba(18,18,42,0.80)] text-[#00ffcc] border border-[rgba(0,255,204,0.35)] hover:bg-[rgba(0,255,204,0.12)] hover:border-[rgba(0,255,204,0.6)] hover:shadow-[0_0_12px_rgba(0,255,204,0.2)] active:scale-[0.97]",
        secondary:
          "bg-[rgba(139,92,246,0.15)] text-purple-300 border border-[rgba(139,92,246,0.35)] hover:bg-[rgba(139,92,246,0.25)] hover:shadow-[0_0_14px_rgba(139,92,246,0.25)] active:scale-[0.97]",
        ghost:
          "text-[#00ffcc]/70 hover:bg-[rgba(0,255,204,0.08)] hover:text-[#00ffcc] active:scale-[0.97]",
        link:
          "text-[#00ffcc] underline-offset-4 hover:underline hover:text-[#00ffcc]/80",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-lg px-3 text-xs",
        lg: "h-11 px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
