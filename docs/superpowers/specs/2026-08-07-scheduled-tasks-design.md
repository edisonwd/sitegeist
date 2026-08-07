# Scheduled Tasks Design

## Overview

A general-purpose task scheduler for sitegeist that lets users schedule any Agent web operation (navigate, fill forms, extract data, run JS, etc.) to execute at a specific time or on a recurring schedule. Tasks are persisted in IndexedDB and executed via Chrome's alarm API with an Offscreen Document runtime.

## Architecture

```
User Side Panel                    Background (Service Worker)              Offscreen Document
+---------------+                 +----------------------+               +------------------+
| Scheduled     |--create task-->| Scheduler            |               |                  |
| Tasks Tab     |<--manage list--| (alarm CRUD)         |--alarm fire-->| Agent Runtime    |
|               |                 |                      |               | (reuses sidepanel|
| Task Editor   |                 | Result Logger        |<--result------|  Agent logic)    |
|               |                 | (IndexedDB)          |               |                  |
|               |                 |                      |--chrome.tabs-->| Operates target  |
|               |                 | Notification         |               | tab (bg/visible) |
|               |                 | Manager              |               |                  |
+---------------+                 +----------------------+               +------------------+
```

**Core flow:**
1. User creates/edits a scheduled task in the Side Panel Scheduled Tasks Tab (natural language description + schedule rule)
2. On save, `chrome.alarms.create()` registers the alarm; task metadata stored in IndexedDB
3. Alarm fires -> Service Worker receives `chrome.alarms.onAlarm` callback
4. Service Worker creates an Offscreen Document, passing task config
5. Offscreen Document runs Agent (reusing sidepanel Agent construction logic), creates target tab to execute operations
6. Execution completes: results written to IndexedDB, Chrome Notification sent, tab and Offscreen Document closed

**Key design decisions:**
- Offscreen Document lifecycle managed by Service Worker; closed after task completes
- Only one scheduled task executes at a time (queued) to avoid resource contention
- Service Worker restores alarm registrations from IndexedDB on restart

## Data Model

### ScheduledTask (metadata, stored in IndexedDB)

```typescript
interface ScheduledTask {
  id: string;                    // UUID
  name: string;                  // User-defined task name
  description: string;           // Natural language task description (user-editable)
  promptTemplate: string;        // Full prompt passed to Agent (based on description + system context)

  // Schedule rule
  schedule: ScheduleConfig;

  // Execution config
  executionMode: "silent" | "visible";  // silent/visible
  targetUrl?: string;                   // Optional target URL (Agent starts from this URL)

  // State
  enabled: boolean;
  lastRunAt?: string;            // ISO timestamp
  lastRunStatus?: "success" | "failed" | "timeout";
  nextRunAt?: string;            // ISO timestamp
  createdAt: string;
  updatedAt: string;
}

type ScheduleConfig =
  | { type: "once"; at: string }           // ISO timestamp, one-time
  | { type: "interval"; minutes: number }  // Every N minutes (minimum 1)
  | { type: "cron"; expression: string };  // Simplified cron expression
```

### TaskExecutionLog (execution records, stored in IndexedDB)

```typescript
interface TaskExecutionLog {
  id: string;                    // UUID
  taskId: string;                // Associated ScheduledTask.id
  startedAt: string;             // ISO timestamp
  finishedAt?: string;           // ISO timestamp
  status: "running" | "success" | "failed" | "timeout";
  error?: string;                // Failure reason
  summary?: string;              // Brief summary from Agent execution
  agentMessages: AgentMessage[]; // Complete Agent conversation log (for debugging)
}
```

**Design notes:**
- `promptTemplate` separated from `description`: `description` is user-facing, `promptTemplate` is the actual instruction passed to Agent, supports user fine-tuning
- `ScheduleConfig` uses union type to support three scheduling modes
- `TaskExecutionLog` preserves complete Agent conversation for user debugging
- Cron expressions use simplified format (e.g., `0 9 * * 1` = every Monday at 9:00), no external library required

## Scheduling Mechanism

### Alarm Naming Convention

Each scheduled task maps to a `chrome.alarms.Alarm` with naming pattern: `scheduled-task:${taskId}`. When Service Worker receives `onAlarm`, it parses the alarm name to locate the task.

### Scheduling Lifecycle

```
Create Task
  |-- schedule.type === "once"
  |     chrome.alarms.create(`scheduled-task:${id}`, { when: new Date(schedule.at).getTime() })
  |
  |-- schedule.type === "interval"
  |     chrome.alarms.create(`scheduled-task:${id}`, { periodInMinutes: schedule.minutes })
  |
  +-- schedule.type === "cron"
        Parse cron expression, calculate next trigger time
        chrome.alarms.create(`scheduled-task:${id}`, { when: nextTriggerTime, periodInMinutes: 1440 })
        (After alarm fires, recalculate next cron time and update alarm)

Alarm fires (chrome.alarms.onAlarm)
  |-- Parse alarm.name, extract taskId
  |-- Read ScheduledTask from IndexedDB
  |-- Check task.enabled; skip if disabled
  |-- Check if task is already running (prevent concurrency); skip if running
  |-- Create TaskExecutionLog record (status: "running")
  |-- Call TaskExecutor to run task
  |     |-- Success: update log.status = "success", notify user
  |     |-- Failure: update log.status = "failed", record error, notify user
  |     +-- Timeout: update log.status = "timeout" (default 10 minutes)
  |-- Update task.lastRunAt / task.lastRunStatus
  |-- If "once" type: set task.enabled = false
  +-- If "cron" type: recalculate next trigger time, update alarm

Service Worker startup
  +-- Scan all enabled tasks in IndexedDB
        +-- Check if corresponding alarm exists (chrome.alarms.get)
              +-- If missing (Service Worker was restarted): re-register alarm
```

### Execution Queue

Only one task executes at a time. If a task is running when a new alarm fires, the new task enters a pending queue. When the current task completes, queued tasks execute in order. Queue state lives in Service Worker memory (task execution is within Service Worker lifecycle).

### Service Worker Keep-Awake

During task execution, `chrome.power.requestKeepAwake("system")` prevents system sleep from terminating the Service Worker. After task completes, `chrome.power.releaseKeepAwake()` is called.

### Error Recovery

- Service Worker restart automatically restores alarm registrations for all enabled tasks
- If alarm fires when Service Worker cannot start (edge case), Chrome re-delivers on next Service Worker availability
- Execution interrupted by Service Worker crash: on next startup, detect log records with `status: "running"` beyond threshold, auto-mark as `"failed"`

## Task Execution Layer

### Offscreen Document Creation and Communication

```
Service Worker                    Offscreen Document
+---------------+                +------------------+
| alarm fires   |                |                  |
|               |--create------->| initialize       |
|               |--message------>| receive config   |
|               |   taskConfig   | build Agent      |
|               |                | run Agent        |
|               |<-progress------| Agent calls tools|
|               |                | (navigate/repl)  |
|               |<-result--------| execution done   |
|               |--close-------->| self.close()     |
+---------------+                +------------------+
```

**Offscreen Document lifecycle:**
1. Service Worker calls `chrome.offscreen.createDocument()` with reason `"WORKERS"`
2. Only one Offscreen Document can exist at a time; check before creating
3. Task config passed via `chrome.runtime.sendMessage`
4. After execution, Offscreen Document sends completion message then calls `self.close()`

### Agent Execution Flow

```typescript
// Runs inside Offscreen Document
async function executeTask(task: ScheduledTask): Promise<TaskExecutionResult> {
  // 1. Create target tab (silent mode uses active: false)
  const tab = await chrome.tabs.create({
    url: task.targetUrl || "about:blank",
    active: task.executionMode === "visible"
  });

  // 2. Build Agent (reuses sidepanel Agent construction logic)
  const agent = new Agent({
    tools: [
      new NavigateTool(tab.id),
      createReplTool(tab.id),
      new DebuggerTool(tab.id),
      new ExtractImageTool(tab.id),
    ],
    model: getStoredDefaultModel(),  // Uses user's default model config
    systemPrompt: buildSchedulerSystemPrompt(task),
  });

  // 3. Execute prompt
  agent.start(task.promptTemplate);

  // 4. Wait for completion, collect messages
  const messages: AgentMessage[] = [];
  agent.subscribe((event) => {
    if (event.type === "message") messages.push(event.message);
    // Report progress to Service Worker via chrome.runtime.sendMessage
  });

  await agent.waitForCompletion({ timeout: 10 * 60 * 1000 }); // 10 min timeout

  // 5. Close tab (silent mode auto-closes)
  if (task.executionMode === "silent") {
    await chrome.tabs.remove(tab.id);
  }

  return { messages, status: agent.getFinalStatus() };
}
```

### Key Design Decisions

**Model and API key reuse:**
- Offscreen Document runs in extension context, can access `chrome.storage` to read user-configured API keys and default model
- Reuses sidepanel model resolution and API call logic

**Agent toolset:**
- Full reuse of sidepanel tools: `NavigateTool`, `replTool`, `DebuggerTool`, `ExtractImageTool`
- Tools operate on target tab via `tab.id`, identical to sidepanel usage

**Silent vs Visible mode:**
- Silent: `chrome.tabs.create({ active: false })`, tab auto-closed after execution, user unaware
- Visible: `chrome.tabs.create({ active: true })`, tab stays open, user sees execution and results

**Timeout protection:**
- Default 10-minute timeout per task
- On timeout, Agent is aborted, tab closed, log recorded as `status: "timeout"`

**promptTemplate construction:**
- User's `description` (e.g., "open example.com and publish the article") wrapped into structured prompt
- System prompt injects scheduler context: "You are executing a scheduled task. The target tab is open. Follow these instructions..."
- User can fine-tune `promptTemplate` during task creation

## User Interface

### Side Panel Entry Point

Add a "Scheduled Tasks" icon button (clock icon) in the top navigation bar alongside existing history, new session, and settings buttons. Clicking opens `ScheduledTasksDialog`.

### ScheduledTasksDialog (main view)

```
+--------------------------------------+
|  Scheduled Tasks             [+ New] |
+--------------------------------------+
|                                      |
|  [enabled] Daily Article Publish     |
|     Every day 09:00 / Last: success  |
|     [Edit] [Pause] [Delete]          |
|                                      |
|  [pending] Extract Competitor Data   |
|     (one-time) 2026-08-10 14:00      |
|     [Edit] [Delete]                  |
|                                      |
|  [failed] Weekly Report Summary      |
|     Every Monday 09:00 / Last: fail  |
|     [View Log] [Edit] [Delete]       |
|                                      |
+--------------------------------------+
|  [Execution History]                  |
+--------------------------------------+
```

### TaskEditorDialog (create/edit task)

Step form:

```
+--------------------------------------+
|  New Scheduled Task                   |
+--------------------------------------+
|                                      |
|  Task Name:                          |
|  [________________________]          |
|                                      |
|  Task Description (natural language):|
|  [________________________]          |
|  [________________________]          |
|  [________________________]          |
|                                      |
|  Target URL (optional):              |
|  [________________________]          |
|                                      |
|  Schedule Rule:                      |
|  o One-time  o Interval  o Cron      |
|                                      |
|  [One-time shows:]                   |
|  Execution Time: [2026-08-10 14:00]  |
|                                      |
|  [Interval shows:]                   |
|  Every [__] minutes (min 1)          |
|                                      |
|  [Cron shows:]                       |
|  Cron Expression: [0 9 * * 1]        |
|  Help: min hour day month weekday    |
|                                      |
|  Execution Mode:                     |
|  o Silent (background, invisible)    |
|  o Visible (open tab)                |
|                                      |
|           [Cancel]        [Save]     |
+--------------------------------------+
```

**Interaction flow:**
- User enters natural language in "Task Description" (e.g., "open example.com, fill the article editor and publish")
- On save, system uses `description` as `promptTemplate` base; user can fine-tune in advanced options
- Cron expression provides preset dropdown: "Every day 9:00", "Every Monday", "1st of each month"; selection auto-fills the expression field

### ExecutionHistoryDialog (execution history)

```
+--------------------------------------+
|  History - Daily Article Publish      |
+--------------------------------------+
|                                      |
|  2026-08-07 09:00  Success  03:24    |
|  [View Details]                       |
|                                      |
|  2026-08-06 09:00  Success  02:58    |
|  [View Details]                       |
|                                      |
|  2026-08-05 09:00  Failed   00:45    |
|  [View Details]                       |
|                                      |
+--------------------------------------+
```

Click "View Details" to expand full record showing `summary` (Agent summary) and `agentMessages` (complete conversation log, collapsible per step).

### Notifications

Uses Chrome Notification API:
- Task success: brief notification + "View Details" button navigates to execution history
- Task failure/timeout: warning notification + failure reason summary
- Clicking notification opens side panel to the relevant task execution history page

### Empty State

When no scheduled tasks exist, display guidance: "No scheduled tasks yet. Create a task to let the Agent complete web operations on schedule."

## Manifest Changes

Add the following permissions to `static/manifest.chrome.json`:

```json
"permissions": [
  // ... existing permissions ...
  "alarms",
  "offscreen",
  "notifications",
  "power"
]
```

## File Structure

```
src/
  scheduler/
    types.ts                  # ScheduledTask, TaskExecutionLog, ScheduleConfig types
    schedule-store.ts         # IndexedDB store for scheduled tasks
    execution-log-store.ts    # IndexedDB store for execution logs
    scheduler.ts              # Alarm CRUD, alarm listener, execution queue
    task-executor.ts          # Offscreen Document creation, Agent execution
    cron-parser.ts            # Simplified cron expression parser
    notifications.ts          # Chrome Notification helpers
  offscreen/
    offscreen.html            # Offscreen Document HTML entry
    offscreen.ts              # Offscreen Document JS: receives config, runs Agent
  dialogs/
    ScheduledTasksDialog.ts   # Main task list UI
    TaskEditorDialog.ts       # Create/edit task form
    ExecutionHistoryDialog.ts # Execution history UI
```

## Testing Strategy

- Unit tests for cron expression parsing (edge cases, timezone handling)
- Integration test: create task -> verify alarm registered -> simulate alarm fire -> verify execution log created
- Manual E2E: create a simple scheduled task, verify it executes at the scheduled time

## Open Questions Resolved

### Cron Expression Scope
The simplified cron supports 5-field standard syntax: `minute hour day-of-month month day-of-week`. Range, list, and step values are supported (e.g., `0 9,17 * * 1-5`, `*/30 * * * *`). No seconds field, no special characters (`@yearly`, `@weekly` etc.). Implementation via a minimal custom parser (~100 lines), no external dependency.

### Agent API in Offscreen Document
The current `Agent` class from `@earendil-works/pi-agent-core` uses a subscribe/event model. The "waitForCompletion" abstraction in the spec represents a wrapper that resolves when the Agent emits a terminal state event (complete/aborted/error). This wrapper is implemented as a utility function in `task-executor.ts`.

### Model Configuration Access
Offscreen Document accesses model configuration via `chrome.storage.local`, which stores the user's selected provider, model, and API key/OAuth credentials. The same resolution logic used in `sidepanel.ts` (via `resolveApiKey` and `getModel`) is extracted into a shared utility and imported by the Offscreen Document.

### promptTemplate Advanced Editing
The Task Editor includes an expandable "Advanced" section where users can directly edit the `promptTemplate` field. By default, `promptTemplate` equals `description`, but users can override it with more specific instructions. A "Reset to description" button restores the default.

### Internationalization
All user-facing strings in the UI (dialog titles, button labels, status text, empty states) use the existing i18n system (`@mariozechner/mini-lit/dist/i18n.js`). Chinese strings shown in mockups are reference text; actual implementation adds translation keys to `src/web-ui/utils/i18n.ts` for both English and Chinese.

### Chrome Notification Permissions
The `"notifications"` permission is added to the manifest. Chrome extensions do not require user permission prompts for notifications, but a toggle in Settings > Scheduled Tasks allows users to disable notifications for task results.
