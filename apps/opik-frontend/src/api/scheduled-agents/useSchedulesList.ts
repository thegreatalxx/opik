import { QueryFunctionContext, useQuery } from "@tanstack/react-query";
import { ollieAssistApi, SCHEDULES_KEY, QueryConfig } from "@/api/api";
import { SchedulesListResponse } from "@/types/scheduled-agents";

type UseSchedulesListParams = {
  page: number;
  size: number;
};

const getSchedulesList = async (
  { signal }: QueryFunctionContext,
  { size, page }: UseSchedulesListParams,
) => {
  const { data } = await ollieAssistApi.get<SchedulesListResponse>(
    "/schedules",
    {
      signal,
      params: { size, page },
    },
  );

  return data;
};

export default function useSchedulesList(
  params: UseSchedulesListParams,
  options?: QueryConfig<SchedulesListResponse>,
) {
  return useQuery({
    queryKey: [SCHEDULES_KEY, params],
    queryFn: (context) => getSchedulesList(context, params),
    ...options,
  });
}
