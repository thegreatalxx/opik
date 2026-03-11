export enum ScheduleStatus {
  enabled = "enabled",
  disabled = "disabled",
  paused = "paused",
}

export interface Schedule {
  id: string;
  name: string;
  agent_name: string;
  runner_id?: string;
  cron: string;
  enabled: boolean;
  inputs?: Record<string, unknown>;
  prompt?: string;
  channels?: string[];
  last_run?: string;
  next_run?: string;
  created_at: string;
  last_updated_at: string;
}

export interface SchedulesListResponse {
  content: Schedule[];
  total: number;
  page: number;
  size: number;
}

export interface ScheduleRunHistory {
  id: string;
  schedule_id: string;
  status: string;
  started_at: string;
  completed_at?: string;
  trace_id?: string;
  error?: string;
}
