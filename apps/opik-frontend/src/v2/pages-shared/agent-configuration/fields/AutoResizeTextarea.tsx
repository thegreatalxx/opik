import React, { useCallback } from "react";

import { cn } from "@/lib/utils";

type AutoResizeTextareaProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  readOnly?: boolean;
};

const AutoResizeTextarea: React.FC<AutoResizeTextareaProps> = ({
  value,
  onChange,
  className,
  readOnly,
}) => {
  const ref = useCallback((el: HTMLTextAreaElement | null) => {
    if (el) {
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    }
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
      e.target.style.height = "auto";
      e.target.style.height = e.target.scrollHeight + "px";
    },
    [onChange],
  );

  return (
    <textarea
      ref={ref}
      className={cn(
        "comet-body-s w-full resize-none overflow-hidden bg-transparent text-foreground outline-none",
        className,
      )}
      value={value}
      onChange={handleChange}
      readOnly={readOnly}
    />
  );
};

export default AutoResizeTextarea;
