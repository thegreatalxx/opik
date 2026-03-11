import React, { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import CopyButton from "@/components/shared/CopyButton/CopyButton";
import useGeneratePairingCode from "@/api/local-runners/useGeneratePairingCode";

type ConnectRunnerDialogProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const ConnectRunnerDialog: React.FunctionComponent<
  ConnectRunnerDialogProps
> = ({ open, setOpen }) => {
  const generatePairingCode = useGeneratePairingCode();
  const [secondsLeft, setSecondsLeft] = useState(0);

  const pairingCode = generatePairingCode.data?.pairing_code ?? "";
  const command = `opik connect --pair ${pairingCode}`;

  const generate = useCallback(() => {
    generatePairingCode.mutate(undefined, {
      onSuccess: (data) => {
        setSecondsLeft(data.expires_in_seconds);
      },
    });
  }, [generatePairingCode]);

  useEffect(() => {
    if (open) {
      generate();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (secondsLeft <= 0) return;

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [secondsLeft]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const timeDisplay = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  const isExpired = secondsLeft === 0 && pairingCode !== "";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Connect your machine</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-1 py-2">
          <span className="comet-body-s text-muted-foreground">
            Pairing Code
          </span>
          <span className="text-3xl font-bold tracking-widest">
            {pairingCode}
          </span>
          {!isExpired && pairingCode && (
            <span className="comet-body-xs text-muted-foreground">
              Expires in {timeDisplay}
            </span>
          )}
          {isExpired && (
            <button
              className="comet-body-xs text-primary underline"
              onClick={generate}
            >
              Code expired. Generate a new one.
            </button>
          )}
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="comet-body-s text-muted-foreground">
            Run this in your project directory:
          </span>
          <div className="flex w-full items-center justify-between rounded-md border bg-muted/50 px-4 py-2">
            <code className="comet-body-s font-mono">{command}</code>
            <CopyButton
              text={command}
              message="Command copied"
              size="icon-xs"
            />
          </div>
          <span className="comet-body-xs text-muted-foreground pt-2">
            Waiting for connection...
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ConnectRunnerDialog;
