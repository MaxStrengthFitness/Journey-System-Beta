import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/*
 * The shared Button (type and depth, phase 4, Oct 4 2026; AJ's answer 2A).
 *
 * - It never animates a shadow: the transition names color, background,
 *   border, opacity and transform, never `all`, so the lift and the press
 *   change at once and a press is the transform (rule 5 of the plan).
 * - outline is RAISED: a fill a hair lighter than the card (--raised, never
 *   white), the lift and a top light, and a press, ON its 3:1 --input edge.
 *   AJ said yes to the firm outline on Oct 4; under glare it is the edge
 *   that keeps a button a button. Today's bg-background was the PAGE colour,
 *   darker than the card the button sits on, and its light edge was the
 *   decorative --border, under 3:1.
 * - default (solid blue) gets its tinted drop and top light. A caller that
 *   repaints it another colour says its own shadow too (shadow-(--go-lift)
 *   for orange, shadow-(--elev-1) for any other), or the blue drop would
 *   sit under a red or orange button.
 * - The words are the button voice, 14/700 (the kit draws it at 700; it was
 *   500). A caller's own weight still wins.
 * - Every size is at least 40px tall (44 for lg), the icon sizes included:
 *   nothing tappable under 40px. xs and sm keep their small padding and
 *   type; only the tap area grew. button-sizes.test.ts holds all of this.
 * - The shadows are shadow-(--token), never shadow-[var(…),…], which
 *   tailwind-merge files as a shadow colour (index.css, --raised-lift).
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-bold whitespace-nowrap transition-[color,background-color,border-color,opacity,transform] outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-(--solid-lift) active:not-aria-[haspopup]:shadow-(--press) [a]:hover:bg-primary/80",
        outline:
          "border-input bg-(--raised) shadow-(--raised-lift) hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground active:not-aria-[haspopup]:shadow-(--press) dark:hover:bg-input/30",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-10 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-10 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-10 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-10",
        "icon-xs":
          "size-10 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-10 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
