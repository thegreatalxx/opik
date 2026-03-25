import {
  ForwardRefExoticComponent,
  RefAttributes,
  useCallback,
  useRef,
  useState,
} from "react";
import { HeaderContext } from "@tanstack/react-table";
import { COLUMN_TYPE, HeaderIconType } from "@/types/shared";
import {
  Text,
  Hash,
  List,
  Clock,
  Braces,
  PenLine,
  Coins,
  Construction,
  LucideProps,
  AlertTriangle,
  Tag,
  GitCommitVertical,
  CheckCheck,
  Repeat2,
  CircleCheck,
} from "lucide-react";
import { Checkbox } from "@/ui/checkbox";
import HeaderWrapper from "@/shared/DataTableHeaders/HeaderWrapper";
import useSortableHeader from "@/shared/DataTableHeaders/useSortableHeader";
import ExplainerIcon from "@/shared/ExplainerIcon/ExplainerIcon";
import TooltipWrapper from "@/shared/TooltipWrapper/TooltipWrapper";

const COLUMN_TYPE_MAP: Record<
  HeaderIconType,
  ForwardRefExoticComponent<
    Omit<LucideProps, "ref"> & RefAttributes<SVGSVGElement>
  >
> = {
  guardrails: Construction,
  tags: Tag,
  version: GitCommitVertical,
  assertions: CheckCheck,
  execution_policy: Repeat2,
  pass_rate: CircleCheck,
  result: CircleCheck,
  [COLUMN_TYPE.string]: Text,
  [COLUMN_TYPE.number]: Hash,
  [COLUMN_TYPE.list]: List,
  [COLUMN_TYPE.time]: Clock,
  [COLUMN_TYPE.duration]: Clock,
  [COLUMN_TYPE.dictionary]: Braces,
  [COLUMN_TYPE.numberDictionary]: PenLine,
  [COLUMN_TYPE.cost]: Coins,
  [COLUMN_TYPE.category]: Text,
  [COLUMN_TYPE.errors]: AlertTriangle,
};

const TypeHeader = <TData,>(context: HeaderContext<TData, unknown>) => {
  const { column } = context;
  const hideHeaderIcons = context.table.options.meta?.hideHeaderIcons;
  const {
    header,
    headerCheckbox,
    type: columnType,
    iconType,
    explainer,
  } = column.columnDef.meta ?? {};

  const type = iconType ?? columnType;
  const Icon = !hideHeaderIcons && type ? COLUMN_TYPE_MAP[type] : null;

  const { className, onClickHandler, renderSort } = useSortableHeader({
    column,
    withSeparator: Boolean(explainer),
  });

  const textRef = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  const checkTruncation = useCallback(() => {
    const el = textRef.current;
    if (el) {
      setIsTruncated(el.scrollWidth > el.clientWidth);
    }
  }, []);

  return (
    <HeaderWrapper
      metadata={context.column.columnDef.meta}
      tableMetadata={context.table.options.meta}
      className={className}
      onClick={onClickHandler}
    >
      {headerCheckbox && (
        <Checkbox
          className="mr-3.5"
          onClick={(event) => event.stopPropagation()}
          checked={
            context.table.getIsAllPageRowsSelected() ||
            (context.table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) =>
            context.table.toggleAllPageRowsSelected(!!value)
          }
          aria-label="Select all"
        />
      )}
      {Icon && <Icon className="size-3.5 shrink-0 text-light-slate" />}
      <TooltipWrapper content={isTruncated ? header : null}>
        <span ref={textRef} className="truncate" onMouseEnter={checkTruncation}>
          {header}
        </span>
      </TooltipWrapper>
      {explainer && <ExplainerIcon {...explainer} />}
      {renderSort()}
    </HeaderWrapper>
  );
};

export default TypeHeader;
