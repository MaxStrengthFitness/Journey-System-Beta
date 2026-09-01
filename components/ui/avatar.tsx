import * as React from "react"
import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar"

import { cn } from "@/lib/utils"

/**
 * shadcn/ui Avatar (base-nova style, Base UI primitives).
 *
 * Usage:
 *   <Avatar size="lg">
 *     <AvatarImage src={client.photoUrl} alt="" />
 *     <AvatarFallback>MW</AvatarFallback>
 *   </Avatar>
 *
 * The fallback renders while the image loads and whenever there is no image,
 * so a client without a photo still gets a clean initials badge.
 */
function Avatar({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root> & {
  size?: "sm" | "default" | "lg" | "xl"
}) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-size={size}
      className={cn(
        "relative flex size-8 shrink-0 overflow-hidden rounded-full select-none data-[size=sm]:size-6 data-[size=lg]:size-12 data-[size=xl]:size-16",
        className
      )}
      {...props}
    />
  )
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("aspect-square size-full object-cover", className)}
      {...props}
    />
  )
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center rounded-full bg-muted text-muted-foreground font-bold uppercase tracking-wider",
        className
      )}
      {...props}
    />
  )
}

export { Avatar, AvatarImage, AvatarFallback }
