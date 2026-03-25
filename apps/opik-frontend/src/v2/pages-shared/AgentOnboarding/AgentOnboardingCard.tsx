import React from "react";
import { Separator } from "@/ui/separator";

interface AgentOnboardingCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  showFooterSeparator?: boolean;
}

const AgentOnboardingCard: React.FC<AgentOnboardingCardProps> = ({
  title,
  description,
  children,
  footer,
  showFooterSeparator = false,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex justify-center pt-40">
      <div className="flex h-fit w-full max-w-[648px] flex-col gap-5 rounded-md border bg-background p-5 shadow-lg">
        <div className="flex flex-col gap-1.5">
          <h2 className="comet-title-s">{title}</h2>
          {description && (
            <p className="comet-body-s text-muted-slate">{description}</p>
          )}
        </div>
        <div className="max-h-[calc(100vh-320px)] overflow-y-auto">
          {children}
        </div>
        {showFooterSeparator && <Separator />}
        <div className="flex items-center justify-end gap-2">{footer}</div>
      </div>
    </div>
  );
};

export default AgentOnboardingCard;
