import { CellContext } from "@tanstack/react-table";
import ConfigurationVersionTag from "@/shared/ConfigurationVersionTag/ConfigurationVersionTag";

export type ConfigurationVersionCellData = {
  version: string;
  maskId?: string;
};

const ConfigurationVersionCell = <TData,>(
  context: CellContext<TData, unknown>,
) => {
  const value = context.getValue() as ConfigurationVersionCellData | undefined;

  if (!value) return null;

  return (
    <div className="px-2">
      <ConfigurationVersionTag version={value.version} maskId={value.maskId} />
    </div>
  );
};

export default ConfigurationVersionCell;
