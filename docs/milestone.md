# Tethys — Milestone Roadmap

| Field | Value |
|---|---|
| Status | Draft v0.2 |
| Date | 16 September 2026 |
| Companion docs | [PRD.md](./prd.md) · [ARCHITECTURE.md](./architecture.md) |

Sequencing principle: **prove the risky plumbing first** (IPC, protocol handshakes, process control, git snapshots), then build product surface on top. Progression is milestone-based rather than calendar-based, driven by objective exit criteria and decision gates. Requirement IDs refer to the PRD; PD‑n / AD‑n are the open decisions in each doc.

---

## Overview

| Phase | Goal | Gate |
|---|---|---|
| 0 — Validation | Retire architectural risks | **COMPLETED** (All spike exit criteria met; AD-1, AD-4, AD-5, AD-8, AD-10, AD-13, PD-1 closed) |
| 1 — MVP | Daily‑drivable local app | Team dogfooding validation; all P0 met |
| 2 — V1 | Complete, polished local product | All P1 met; signed builds on all platforms |
| 3 — Beyond | Remote and cross‑agent workflows | Per‑feature |

---

## Phase 0 — Technical Validation (COMPLETED)

Each spike completed with measured exit criteria and written documentation in [`docs/spikes/`](./spikes/).

| Spike | Scope | Exit criteria | Closes | Status / Result Doc |
|---|---|---|---|---|
| S0.0 Repo scaffold | Turborepo + pnpm + Cargo workspace per ARCHITECTURE §3; `codegen` task (specta → `@tethys/bindings`); CI on macOS, Windows, Linux | `turbo run dev` opens the Tauri window; generated types compile; CI green on all three OSes | — | **Done** |
| S0.1 IPC & rendering | Synthetic 8‑stream generator; channels vs events vs binary; TanStack Store reducers with rAF batching; 20 k‑line virtualized diff over git patches | ≥ 5 k small msgs/s at 60 fps and ≤ 50 ms p95 byte‑to‑paint on macOS and Windows; Linux result recorded | AD‑10 | **Done** · [s0.1-ipc-rendering-results.md](./spikes/s0.1-ipc-rendering-results.md) |
| S0.2 ACP v1 + v2 | `agent-client-protocol` 1.x client; v1 adapter and flagged v2 adapter into one event model; three agents (at least one ACP‑native, two adapters); initialize, login, new, prompt, streaming, approval, cancel, resume with replay, close, crash; confirm SDK threading model | All flows pass on v1; v2 flows pass against at least one v2 agent or the SDK's example agent; fixtures recorded for both versions | AD‑4, AD‑8 | **Done** · [s0.2-acp-results.md](./spikes/s0.2-acp-results.md) |
| S0.2b Connection store | Lease‑based ConnectionStore with two‑phase reaping, respawn on transport close, single‑flight session lifecycle (Zed learnings) | No resident idle agents after grace period; dead connection recovers on next use | — | **Done** · [s0.2b-connection-store-results.md](./spikes/s0.2b-connection-store-results.md) |
| S0.3 Supervisor | Process groups / Job Objects, cancel ladder, stderr capture, orphan detection | Zero orphans after 100 forced kills per OS | — | **Done** · [s0.3-supervisor-results.md](./spikes/s0.3-supervisor-results.md) |
| S0.4 Worktrees & restore points | Create/remove, temp‑index snapshots, turn diff, restore; large‑repo benchmark (≥ 100 k files) | Snapshot ≤ 1 s p95 for typical changes | AD‑5 | **Done** · [s0.4-git-engine-results.md](./spikes/s0.4-git-engine-results.md) |
| S0.5 Search | Embed `fff-search`; per‑worktree index | ≤ 30 ms warm query on 200 k files | — | **Done** · [s0.5-search-results.md](./spikes/s0.5-search-results.md) |
| S0.6 Projection | Read/plan/apply/rollback for Claude Code, Codex, OpenCode with golden tests | Round‑trip with no formatting loss | — | **Done** · [s0.6-projection-results.md](./spikes/s0.6-projection-results.md) |
| S0.7 Compliance | Build the vendor compliance matrix with sources | Matrix published internally; plan for PD‑2 agreed | PD‑1 | **Done** · [s0.7-compliance-matrix.md](./spikes/s0.7-compliance-matrix.md) |
| S0.8 Footprint & storage | Measure core/webview memory, startup, installer size; event‑log write/read benchmark | Recorded against targets; targets adjusted if needed | AD‑1, AD‑13 | **Done** · [s0.8-footprint-storage-results.md](./spikes/s0.8-footprint-storage-results.md) |

**Phase 0 must not start product UI work** beyond what the spikes need.

---

## Phase 1 — MVP

**Scope (all P0 in the PRD):**

| Area | Requirements |
|---|---|
| Agents & threads | AGT‑01, 02, 04, 05, 06, 07 |
| Permissions | PRM‑01 to 04 |
| Worktrees & review | WT‑01 to 06 |
| MCP & skills | SYN‑01, 02, 03, 04, 06, 07 |
| Composer | CMP‑01 to 05 |
| Layout | UI‑01 to 04 |
| Monitoring | MON‑01 |

Also in scope: SQLite persistence and resume, opt‑in crash reporting, macOS and Windows installers.

**Suggested internal order:**
1. Core event log, thread state machine, and API skeleton (desktop transport only, but transport‑agnostic).
2. Agent profiles, registry install, sessions, streaming Inspector.
3. Permissions and approval inbox.
4. Worktrees, restore points, diff views, commit.
5. Composer (`@` first, then `/`, then `$`).
6. MCP registry, session injection, and three projectors.
7. Skill library and trust flow.
8. Hardening, performance budgets, dogfooding.

**Decisions to close during MVP:** PD‑3, PD‑5, PD‑6, PD‑7, PD‑8, AD‑9, AD‑12.

**Exit criteria:**
- Sustained team dogfooding with ≥ 4 concurrent threads without regressions.
- All P0 requirements met.
- No open data‑loss bugs.
- PRD quality targets met on macOS and Windows.

---

## Phase 2 — V1

| Area | Requirements |
|---|---|
| Agents | AGT‑03 (terminal hosting, confirmed vendors only), AGT‑08 |
| Permissions | PRM‑05, PRM‑06 |
| Worktrees & review | WT‑07 to 11 (incl. plain‑directory `isolation: plain`, PD‑9) |
| MCP & skills | SYN‑05, 08, 09, 10, 11 (native-settings forms for OpenCode, Antigravity CLI, Kiro CLI; community schemas, AD‑14) |
| Composer & layout | CMP‑06, UI‑05 |
| Monitoring | MON‑02 to 04 |

Also in scope:
- Linux promoted to fully supported if it meets the quality targets.
- Signed builds and auto‑update on all platforms.
- Closing PD‑2, PD‑4, PD‑9, AD‑2, AD‑6, AD‑11, and AD‑14.
- Tethys‑hosted MCP server (`tethys-mcp`) and ACP v2 enabled by default if the spec has stabilized.

**Exit criteria:**
- All P1 requirements met.
- Compliance matrix re‑verified within the last 30 days.
- Public beta readiness review passed, including legal review of vendor handling.

---

## Phase 3 — Beyond V1 (exploratory)

- **Remote hosts:** `tethysd` with pairing, SSH‑tunnel UX, and a multi‑host explorer (REM‑01).
- **Remote approvals:** an inbox‑first web or mobile companion (REM‑02, AD‑7).
- **Remote agents:** supported once ACP's network transport stabilizes.
- **Cross‑agent workflows:** hand a thread to another agent; "best‑of‑N" attempts in sibling worktrees with a comparison view.
- **Event hooks:** MON‑05.
- **Team‑shared policies.**
- **Optional reference agent:** bring‑your‑own‑API‑key.

---

## Decision Gates

| When | Decisions |
|---|---|
| Already decided | AD‑3 (React + TanStack) |
| Phase 0 (All Closed) | **AD‑1** (documented trigger), **AD‑4** (pooled with leases), **AD‑5** (gix reads + CLI mutations), **AD‑8** (v1+v2 side-by-side, v2-shaped internal model), **AD‑10** (custom virtualized git diffs), **AD‑13** (rusqlite+tokio-rusqlite), **PD‑1** (API key default) |
| During MVP | PD‑3, PD‑5, PD‑6, PD‑7, PD‑8, AD‑9, AD‑12 |
| Before MVP beta | PD‑2 plan confirmed with sources |
| During V1 | PD‑2 (final), PD‑4, PD‑9, AD‑2, AD‑6, AD‑11, AD‑14 |
| Phase 3 | AD‑7 |