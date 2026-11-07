import * as React from "react"
import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("skeleton-sweep rounded-md bg-foreground/8 bg-fixed", className)}
      {...props}
    />
  )
}

export { Skeleton }
