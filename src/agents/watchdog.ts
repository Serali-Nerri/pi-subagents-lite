/**
 * watchdog.ts — Time-based stuck-agent detection.
 *
 * Tracks per-agent current tool + last-activity timestamps. Manager-owned
 * interval drives check(); manager performs the abort.
 * Pure and clock-injectable for tests.
 */
import type { ToolActivity, WatchdogStopDetail } from "../types.js";

interface WatchdogAgentState {
  currentTool?: { toolName: string; startedAt: number };
  lastActivityAt: number;
}

export class Watchdog {
  private agents = new Map<string, WatchdogAgentState>();

  constructor(private now: () => number = Date.now) {}

  /** Begin watching an agent. Idle clock starts here. */
  start(agentId: string): void {
    this.agents.set(agentId, { lastActivityAt: this.now() });
  }

  /** Stop watching (completed/aborted/removed). */
  stop(agentId: string): void {
    this.agents.delete(agentId);
  }

  /** Feed a tool activity event. Any event resets the idle clock. */
  recordActivity(agentId: string, activity: ToolActivity): void {
    const state = this.agents.get(agentId);
    if (!state) return;
    state.lastActivityAt = this.now();
    if (activity.type === "start") {
      state.currentTool = { toolName: activity.toolName, startedAt: state.lastActivityAt };
    } else {
      if (!state.currentTool || state.currentTool.toolName === activity.toolName) {
        state.currentTool = undefined;
      }
    }
  }

  /** Reset idle clock on streamed text. */
  recordText(agentId: string): void {
    const state = this.agents.get(agentId);
    if (state) state.lastActivityAt = this.now();
  }

  /**
   * Check every watched agent (thresholds in ms; 0 disables).
   * Tool timeout wins over idle. Non-running agents are dropped.
   */
  check(
    toolTimeoutMs: number,
    idleTimeoutMs: number,
    isRunning: (agentId: string) => boolean,
  ): Map<string, WatchdogStopDetail> {
    const now = this.now();
    const decisions = new Map<string, WatchdogStopDetail>();
    for (const [agentId, state] of this.agents) {
      if (!isRunning(agentId)) {
        this.agents.delete(agentId);
        continue;
      }
      if (toolTimeoutMs > 0 && state.currentTool) {
        const elapsedMs = now - state.currentTool.startedAt;
        if (elapsedMs >= toolTimeoutMs) {
          decisions.set(agentId, { kind: "tool", toolName: state.currentTool.toolName, elapsedMs });
          continue;
        }
      }
      if (idleTimeoutMs > 0) {
        const elapsedMs = now - state.lastActivityAt;
        if (elapsedMs >= idleTimeoutMs) {
          decisions.set(agentId, { kind: "idle", elapsedMs });
        }
      }
    }
    return decisions;
  }
}

/** Human-readable watchdog stop reason for tool results/notifications. */
export function watchdogReason(detail: WatchdogStopDetail): string {
  const mins = Math.round(detail.elapsedMs / 60000);
  if (detail.kind === "tool") {
    return `stopped: tool '${detail.toolName}' ran longer than timeout (${mins}m)`;
  }
  return `stopped: no activity for ${mins}m (idle timeout)`;
}
