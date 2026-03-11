import { QueryFunctionContext, useQuery } from "@tanstack/react-query";
import { ollieAssistApi, SCHEDULES_KEY, QueryConfig } from "@/api/api";
import { Schedule } from "@/types/scheduled-agents";

type UseScheduleByIdParams = {
  scheduleId: string;
};

const getScheduleById = async (
  { signal }: QueryFunctionContext,
  { scheduleId }: UseScheduleByIdParams,
) => {
  const { data } = await ollieAssistApi.get<Schedule>(
    `/schedules/${scheduleId}`,
    { signal },
  );

  return data;
};

export default function useScheduleById(
  params: UseScheduleByIdParams,
  options?: QueryConfig<Schedule>,
) {
  return useQuery({
    queryKey: [SCHEDULES_KEY, params],
    queryFn: (context) => getScheduleById(context, params),
    ...options,
  });
}
