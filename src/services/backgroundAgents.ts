/**
 * Background Agent Framework - perpetual and on-demand agents.
 * Examples: Birthday Reminders, Weather Reporting, Task completion.
 * Background agents report through Switchboard to Primary Avatars.
 */


export interface BackgroundAgentTask {
  agentId: string;
  type: "perpetual" | "on-demand" | "scheduled";
  schedule?: string; // cron-like or interval
  lastRun?: number;
  data?: unknown;
}

export type AgentRunner = (task: BackgroundAgentTask) => Promise<string | null>;

const runners = new Map<string, AgentRunner>();

/**
 * Register a background agent runner.
 */
export function registerAgentRunner(agentId: string, runner: AgentRunner): void {
  runners.set(agentId, runner);
}

/**
 * Run a background agent and return its output (or null if nothing to report).
 */
export async function runBackgroundAgent(
  task: BackgroundAgentTask
): Promise<string | null> {
  const runner = runners.get(task.agentId);
  if (!runner) return null;
  return runner(task);
}

/**
 * Built-in example runners (mock implementations).
 */
export function registerDefaultRunners(): void {
  registerAgentRunner("birthday", async () => {
    // Mock: would check contacts for upcoming birthdays
    return null;
  });

  registerAgentRunner("weather", async () => {
    // Mock: would fetch weather
    return null;
  });

  registerAgentRunner("task-reminder", async (task) => {
    if (task.data && typeof task.data === "object" && "reminder" in task.data) {
      return String((task.data as { reminder: string }).reminder);
    }
    return null;
  });
}
