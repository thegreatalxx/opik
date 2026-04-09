import { useEffect } from "react";
import { StringParam } from "use-query-params";
import useQueryParamAndLocalStorageState from "@/hooks/useQueryParamAndLocalStorageState";
import {
  useMetricDateRangeCore,
  UseMetricDateRangeOptions,
} from "./useMetricDateRangeCore";
import { DEFAULT_DATE_PRESET, DEFAULT_DATE_URL_KEY } from "./constants";
import { DateRangePreset } from "@/shared/DateRangeSelect";

type UseMetricDateRangeWithQueryAndStorageOptions =
  UseMetricDateRangeOptions & {
    key?: string;
    localStorageKey?: string;
    excludePresets?: DateRangePreset[];
  };

export const useMetricDateRangeWithQueryAndStorage = (
  options: UseMetricDateRangeWithQueryAndStorageOptions = {},
) => {
  const {
    key = DEFAULT_DATE_URL_KEY,
    localStorageKey,
    excludePresets,
    ...rest
  } = options;

  const [value, setValue] = useQueryParamAndLocalStorageState<
    string | null | undefined
  >({
    localStorageKey: localStorageKey ?? `local-${key}`,
    queryKey: key,
    defaultValue: DEFAULT_DATE_PRESET,
    queryParamConfig: StringParam,
    syncQueryWithLocalStorageOnInit: true,
  });

  const rawValue = value ?? DEFAULT_DATE_PRESET;
  const isExcluded = excludePresets?.includes(rawValue as DateRangePreset);
  const dateRangeValue = isExcluded ? DEFAULT_DATE_PRESET : rawValue;

  useEffect(() => {
    if (isExcluded) {
      setValue(DEFAULT_DATE_PRESET);
    }
  }, [isExcluded, setValue]);

  return {
    ...useMetricDateRangeCore({
      value: dateRangeValue,
      setValue,
      ...rest,
    }),
    dateRangeValue,
  };
};
