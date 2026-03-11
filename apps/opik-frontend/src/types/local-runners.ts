export interface LocalRunnerAgentParam {
  name: string;
  type: string;
}

export interface LocalRunnerAgent {
  name: string;
  project: string;
  description: string;
  language: string;
  executable: string;
  source_file: string;
  params: LocalRunnerAgentParam[];
  timeout: number;
}

export enum LocalRunnerStatus {
  PAIRING = "pairing",
  CONNECTED = "connected",
  DISCONNECTED = "disconnected",
}

export interface LocalRunner {
  id: string;
  name: string;
  status: LocalRunnerStatus;
  connected_at: string;
  agents: LocalRunnerAgent[];
}

export interface LocalRunnersListResponse {
  page: number;
  size: number;
  total: number;
  content: LocalRunner[];
}

export enum LocalRunnerJobStatus {
  PENDING = "pending",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

export interface LocalRunnerJob {
  id: string;
  runner_id: string;
  agent_name: string;
  status: LocalRunnerJobStatus;
  inputs: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  error: string | null;
  project: string;
  trace_id: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface LocalRunnerJobsResponse {
  page: number;
  size: number;
  total: number;
  content: LocalRunnerJob[];
}

export interface LocalRunnerPairResponse {
  pairing_code: string;
  runner_id: string;
  expires_in_seconds: number;
}

export interface LocalRunnerLogEntry {
  stream: string;
  text: string;
}
