// ===== Enums =====

export type Platform = "web" | "android" | "api";
export type TeamRole = "owner" | "editor" | "viewer";
export type TestStatus = "active" | "archived";
export type RunTrigger = "manual" | "schedule" | "api" | "ci";
export type RunStatus = "queued" | "running" | "passed" | "failed" | "cancelled";
export type ResultStatus = "passed" | "failed" | "skipped";
export type StorageType = "local" | "s3";
export type HealingStatus = "pending" | "accepted" | "rejected";
export type VisualDiffStatus = "pending" | "approved" | "rejected";

// ===== Step Actions =====

export type WebAction =
  | "navigate"
  | "go_back"
  | "go_forward"
  | "reload"
  | "click"
  | "double_click"
  | "right_click"
  | "input"
  | "clear"
  | "select"
  | "check"
  | "uncheck"
  | "upload_file"
  | "scroll"
  | "scroll_to_element"
  | "assert_text"
  | "assert_visible"
  | "assert_hidden"
  | "assert_url"
  | "assert_attribute"
  | "assert_count"
  | "wait"
  | "wait_for_element"
  | "wait_for_network"
  | "screenshot"
  | "set_variable"
  | "extract_text"
  | "extract_attribute"
  | "if"
  | "else"
  | "end_if"
  | "loop"
  | "end_loop"
  | "shared_step"
  | "api_request";

export type AndroidAction =
  | "tap"
  | "long_press"
  | "swipe"
  | "pinch_in"
  | "pinch_out"
  | "drag_and_drop"
  | "press_key"
  | "launch_app"
  | "kill_app"
  | "reset_app"
  | "assert_image";

export type ApiAction =
  | "http_request"
  | "assert_status"
  | "assert_json"
  | "assert_header"
  | "extract_json"
  | "set_auth";

export type StepAction = WebAction | AndroidAction | ApiAction;

// ===== Step Param Types =====

export interface NavigateParams { url: string }
export interface ClickParams { selector: string; wait_for?: "navigation" | "network" | "none" }
export interface InputParams { selector: string; value: string; secret?: boolean }
export interface SelectParams { selector: string; value: string }
export interface AssertTextParams { selector: string; expected: string; mode?: "exact" | "contains" | "regex" }
export interface AssertVisibleParams { selector: string }
export interface AssertHiddenParams { selector: string }
export interface AssertUrlParams { expected: string; mode?: "exact" | "contains" | "regex" }
export interface AssertAttributeParams { selector: string; attribute: string; expected: string }
export interface AssertCountParams { selector: string; expected: number }
export interface WaitParams { ms: number }
export interface WaitForElementParams { selector: string; state?: "visible" | "hidden" | "attached" }
export interface ScrollParams { x?: number; y?: number }
export interface ScrollToElementParams { selector: string }
export interface ScreenshotParams { name?: string; visual_regression?: boolean }
export interface SetVariableParams { name: string; value: string }
export interface ExtractTextParams { selector: string; variable: string }
export interface ExtractAttributeParams { selector: string; attribute: string; variable: string }
export interface IfParams { condition: string }
export interface LoopParams { times?: number; variable?: string; items?: string }
export interface SharedStepParams { id: string }
export interface ApiRequestParams {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  variable?: string;
}
export interface TapParams { selector?: string; x?: number; y?: number }
export interface SwipeParams { direction: "up" | "down" | "left" | "right"; selector?: string }
export interface PressKeyParams { key: string }
export interface LaunchAppParams { package?: string; activity?: string }
export interface HttpRequestParams {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  variable?: string;
}
export interface AssertStatusParams { expected: number }
export interface AssertJsonParams { path: string; expected: unknown }
export interface ExtractJsonParams { path: string; variable: string }
export interface SetAuthParams {
  type: "bearer" | "basic" | "api_key";
  token?: string;
  username?: string;
  password?: string;
  header?: string;
}

// ===== Step Definition =====

export interface TestStep {
  id: string;
  testId: string;
  order: number;
  action: StepAction;
  params: Record<string, unknown>;
  sharedStepId?: string;
  createdAt: string;
}

// ===== Domain Models =====

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface Team {
  id: string;
  name: string;
  createdAt: string;
}

export interface TeamMember {
  teamId: string;
  userId: string;
  role: TeamRole;
  user?: User;
}

export interface Project {
  id: string;
  teamId: string;
  name: string;
  platform: Platform;
  baseUrl?: string;
  appPackage?: string;
  createdAt: string;
}

export interface Environment {
  id: string;
  projectId: string;
  name: string;
  variables: Record<string, string>;
}

export interface Test {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  tags: string[];
  folderId?: string;
  status: TestStatus;
  createdAt: string;
  updatedAt: string;
  steps?: TestStep[];
}

export interface SharedStep {
  id: string;
  projectId: string;
  name: string;
  steps: Omit<TestStep, "id" | "testId" | "sharedStepId" | "createdAt">[];
}

export interface TestDataSet {
  id: string;
  testId: string;
  name: string;
  csvContent: string;
}

export interface TestRun {
  id: string;
  projectId: string;
  trigger: RunTrigger;
  status: RunStatus;
  environment?: string;
  triggeredById?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  results?: TestRunResult[];
}

export interface TestRunResult {
  id: string;
  runId: string;
  testId: string;
  test?: Pick<Test, "id" | "name">;
  status: ResultStatus;
  durationMs?: number;
  errorMessage?: string;
  startedAt?: string;
  finishedAt?: string;
  stepResults?: StepResult[];
}

export interface StepResult {
  id: string;
  runResultId: string;
  stepId: string;
  order: number;
  status: ResultStatus;
  screenshotUrl?: string;
  logText?: string;
  durationMs?: number;
  executedAt?: string;
}

export interface VisualDiff {
  id: string;
  stepResultId: string;
  baselineId: string;
  diffImageUrl?: string;
  diffPercentage: number;
  status: VisualDiffStatus;
}

export interface HealingSuggestion {
  id: string;
  stepResultId: string;
  originalSelector: string;
  suggestedSelector: string;
  confidence: number;
  reason: string;
  status: HealingStatus;
}

// ===== API Response Types =====

export interface ApiResponse<T> {
  data: T;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ===== Auth Types =====

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignupRequest {
  email: string;
  password: string;
  name: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
  user: User;
}

// ===== WebSocket Event Types =====

export type WsEventType =
  | "run:started"
  | "run:finished"
  | "result:started"
  | "result:finished"
  | "step:started"
  | "step:finished"
  | "log";

export interface WsEvent {
  type: WsEventType;
  runId: string;
  payload: unknown;
}

export interface StepLogEvent {
  type: "log";
  runId: string;
  payload: {
    resultId: string;
    stepOrder: number;
    message: string;
    level: "info" | "error" | "warn";
    timestamp: string;
  };
}

export interface StepFinishedEvent {
  type: "step:finished";
  runId: string;
  payload: StepResult;
}

export interface RunStatusEvent {
  type: "run:started" | "run:finished";
  runId: string;
  payload: { status: RunStatus; finishedAt?: string };
}

// ===== Job Types (BullMQ) =====

export interface RunJobData {
  runId: string;
  projectId: string;
  testIds: string[];
  environment?: string;
  envVariables?: Record<string, string>;
}
