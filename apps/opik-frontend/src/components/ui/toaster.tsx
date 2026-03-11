import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";
import { useToast } from "@/components/ui/use-toast";
import useOllieAssistStore from "@/components/layout/OllieAssist/OllieAssistStore";
import { PANEL_WIDTH } from "@/components/layout/OllieAssist/OllieAssistSidebar";

export function Toaster() {
  const { toasts } = useToast();
  const ollieOpen = useOllieAssistStore((s) => s.open);

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, actions, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
              {actions && (
                <div className="flex flex-col items-start gap-0 pt-1.5">
                  {actions.map((a) => a)}
                </div>
              )}
            </div>
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport style={{ right: ollieOpen ? PANEL_WIDTH : undefined }} />
    </ToastProvider>
  );
}
