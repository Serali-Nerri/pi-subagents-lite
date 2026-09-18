import { describe, it, expect } from "vitest";
import { mergeProjectLayer } from "../../src/config/config-io.js";
import { parseAgentFile, mergeAgents } from "../../src/agents/agent-discovery.js";

describe("project config layer", () => {
  it("project model keys win over global", () => {
    const merged = mergeProjectLayer(
      { agent: { default: "global/model", Explore: "global/exp", forceBackground: false } as any, concurrency: { default: 4 } },
      { agent: { default: "proj/model", oracle: "proj/oracle" } as any, concurrency: { default: 8 } },
    );
    expect((merged.agent as any).default).toBe("proj/model");
    expect((merged.agent as any).oracle).toBe("proj/oracle");
    expect((merged.agent as any).Explore).toBe("global/exp");
    expect(merged.concurrency?.default).toBe(8);
  });

  it("project non-model keys are ignored", () => {
    const merged = mergeProjectLayer(
      { agent: { forceBackground: false } as any },
      { agent: { forceBackground: true, widgetCompact: true } as any },
    );
    expect((merged.agent as any).forceBackground).toBe(false);
    expect((merged.agent as any).widgetCompact).toBeUndefined();
  });

  it("project concurrency providers/models merge per entry", () => {
    const merged = mergeProjectLayer(
      { concurrency: { default: 4, providers: { a: 1 } } },
      { concurrency: { providers: { b: 2 } } },
    );
    expect(merged.concurrency?.providers).toEqual({ a: 1, b: 2 });
  });
});

describe("shared agents + color", () => {
  it("parses color frontmatter", () => {
    const md = `---\nname: oracle\ndisplay_name: Oracle\ncolor: cyan\n---\nbody`;
    const r = parseAgentFile(md, "user");
    expect(r.color).toBe("cyan");
  });

  it("precedence project > shared > user > defaults", () => {
    const mk = (name: string, description: string, source: any) => ({
      name, description, systemPrompt: "", source,
    });
    const defaults = new Map([["x", { name: "x", description: "default", systemPrompt: "" } as any]]);
    const merged = mergeAgents(
      defaults,
      [mk("x", "user", "user") as any],
      [mk("x", "shared", "shared") as any],
      [mk("x", "project", "project") as any],
    );
    expect(merged.get("x")?.description).toBe("project");
  });

  it("legacy 3-arg mergeAgents still works (user, project)", () => {
    const mk = (name: string, description: string, source: any) => ({
      name, description, systemPrompt: "", source,
    });
    const merged = mergeAgents(new Map(), [mk("a", "user", "user") as any], [mk("b", "proj", "project") as any]);
    // 3-arg form: 2nd=user, 3rd=project
    expect(merged.get("a")?.description).toBe("user");
    expect(merged.get("b")?.description).toBe("proj");
  });
});
