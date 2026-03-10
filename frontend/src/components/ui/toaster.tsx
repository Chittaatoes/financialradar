import { CheckCircle2, AlertCircle, AlertTriangle, Radio } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import type { ToastType } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

function ToastIcon({ toastType }: { toastType?: ToastType }) {
  if (toastType === "error") {
    return (
      <div className="shrink-0">
        <AlertCircle className="h-4 w-4 text-red-500 dark:text-red-400" />
      </div>
    )
  }
  if (toastType === "warning") {
    return (
      <div className="shrink-0">
        <AlertTriangle className="h-4 w-4 text-amber-500 dark:text-amber-400" />
      </div>
    )
  }
  if (toastType === "radar") {
    return (
      <div className="shrink-0">
        <Radio className="h-4 w-4 text-primary" />
      </div>
    )
  }
  return (
    <div className="shrink-0">
      <CheckCircle2 className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
    </div>
  )
}

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider swipeDirection="right">
      {toasts.map(({ id, title, description, action, toastType, duration, ...props }) => (
        <Toast key={id} duration={duration} {...props}>
          <ToastIcon toastType={toastType} />
          <div className="flex-1 min-w-0">
            {title && <ToastTitle>{title}</ToastTitle>}
            {description && <ToastDescription>{description}</ToastDescription>}
          </div>
          {action}
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport className="top-6 left-1/2 -translate-x-1/2 items-center" />
    </ToastProvider>
  )
}
