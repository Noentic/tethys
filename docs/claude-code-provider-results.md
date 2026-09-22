# Claude Code provider integration — results

| Field | Value |
|---|---|
| Plan | M1.18 Claude Code provider integration |
| Date | 23 September 2026 |
| Status | Code implementation complete; M1.18 acceptance remains open pending remaining R2/R3 scenarios, R6 logout, and R7 desktop smoke |
| Registry entry checked | `claude-acp` `0.80.0`, package `@agentclientprotocol/claude-agent-acp@0.80.0` |
| Runtime | Node.js `v25.2.1` in this workspace; adapter documentation requires Node.js 22 or later |
| Entry gate | M1.17 release gate passed; see `docs/m1.17-results.md` |

## 1. Requirements

| Requirement | Result | Evidence / limitation |
|---|---|---|
| R1 — Registry install, launch, and Node prerequisite | Pass | Live runner installed and initialized `claude-acp` `0.80.0` from `npx`; Node `v25.2.1` meets the adapter's Node 22+ requirement. Snapshot records ACP v1, healthy state, and auth ready. |
| R2 — M1.17 registry and stable ACP coverage | Partial | M1.17 deterministic release gate passes. Live Claude exercised initialize, session preparation, text prompt, message/idle, and delete; the inherited ledger below records remaining scenarios as not observed. The UI reducer now handles every `TurnEventBody` variant, including file writes, checkpoints, compaction, and out-of-order tool content. |
| R3 — Official adapter feature inventory | Partial | Provider mappings and UI surfaces are implemented. The live feature matrix records the prompt scenario and features not observed; streamed thoughts/messages, tool output, filesystem writes, checkpoints, compaction summaries, and unknown events all have renderer coverage. |
| R4 — Advertise only supported extensions | Pass | The Claude descriptor advertises `nativeSubagentSessions`, `recommendedValue`, and `sessionFailure`; each has a backend handler and a Tethys surface. Goal state is received as metadata and is not advertised as an outbound control capability. |
| R5 — Preserve relevant Claude metadata | Pass | Tool, config, permission, goal, and subagent metadata are normalized or retained. Focused Rust tests cover recommended values, parent attribution, goals, permissions, failures, and native subagent lifecycle. |
| R6 — Auth/logout and credential handling | Partial | The adapter reports `auth_state=ready` and two negotiated methods. Login and advertised logout were not exercised; the report contains no credential values. |
| R7 — Desktop install-to-reconnect smoke | Not met | Settings install/recheck/auth, prepared-thread configuration in the desktop, callback UI, reconnect, and close were not run in a Tethys desktop session. |
| R8 — Native-settings handoff | Pass | Writable files, schema source, version caveat, and private read-only state are recorded in §3. |

## 2. Official adapter feature ledger

“Live disposition” refers to a run against the real `claude-acp` adapter. The
deterministic suites prove the Tethys side of each shared path; they do not
stand in for a provider-account smoke test.

| Feature | Tethys implementation and evidence | Live disposition |
|---|---|---|
| Registry install and Node prerequisite | Live `npx` install and ACP v1 initialize; registry and adapter `0.80.0`; Node `v25.2.1`; health `healthy`; auth `ready`. | Exercised |
| Authentication and logout | Adapter reported `claude-ai-login` and `console-login`; no login/logout action was run. | Not observed |
| Context `@` mentions | Uses shared ACP prompt content-block mapping and capability gating. | Not observed |
| Images | Uses shared ACP image content mapping. | Not observed |
| Tool calls and permissions | Shared tool lifecycle; Claude permission title, description, default-to-no metadata, option order, and raw metadata are retained. | Not observed |
| Follow-along work | Shared ordered ACP updates; child agent text is routed into its subagent card. | Not observed |
| Edit review | Uses the shared diff viewer and normalized tool content. | Not observed |
| Plan updates | Uses the shared plan panel; `_meta.goal` snapshots render alongside plan steps. | Not observed |
| Nested subagent transcripts | Negotiates `nativeSubagentSessions`; preserves raw v1 variants, maps spawn/terminal state, routes child session updates to the owning thread, and renders child text/tools in the existing card. Rust mapping/routing tests and the subagent-card UI test pass. | Not observed |
| Interactive/background terminals | Uses the shared terminal host and ACP terminal surface. | Not observed |
| Custom slash commands | Uses shared `available_commands_update` and composer command menu. | Not observed |
| Client MCP servers | Uses shared session MCP mapping and origin handling, subject to negotiated transports. | Not observed |
| Modes and config | Uses shared mode/config controls; recommended option values are marked without changing selection. | Not observed |
| Session lifecycle | `session/new` via prepare, prompt completion, cancellation after one timeout, and delete cleanup ran. List/load/resume and desktop reconnect were not exercised. | Exercised |
| Goal extension | Displays goal metadata in the plan panel, including objective, status, iteration count, and reason. | Not observed; outbound goal actions deferred |
| Session-failure extension | Preserves structured failure payloads and renders a recoverable warning/error notice. | Not observed |
| Permission extension | Uses supplied title/description while protocol options remain authoritative; `defaultToNo` is advisory UI text only. | Not observed |
| Unknown extensions | Shared unknown updates remain inspectable; unclaimed extension requests keep the M1.17 method-not-found path. | Not observed |
| Native-settings handoff | Documented below for M2.5. No settings form is added in this phase. | Exercised |

## 2.1 Inherited stable ACP v1 ledger

The common M1.17 deterministic release gate passes (see
[`m1.17-results.md`](m1.17-results.md)). The live Claude run
does not replace that suite; these rows record what the real adapter run
observed.

| Area | Claude disposition | Evidence / remaining scenario |
|---|---|---|
| Transport, initialize, protocol negotiation | Exercised | ACP v1 initialize completed; adapter version and capabilities were captured. |
| Authentication methods and current auth state | Exercised | Auth state was `ready`; login/logout and auth-required retry remain not observed. |
| Session lifecycle | Exercised | Prepared a new session and deleted it after the turn. List/load/resume remain not observed. |
| Prompt content | Exercised | Text prompt completed. Resource links and images were negotiated but not sent; embedded resources not observed; audio is declared unsupported. |
| Message updates and turn completion | Exercised | A message and Idle transition were received on the successful retry. |
| Tool calls, diffs, terminal references | Not observed | The prompt did not request a tool; no edit review or terminal interaction was run. |
| Plans, commands, modes, config, usage, session info | Not observed | No live UI/config scenario was run. |
| MCP transports | Not observed | Handshake advertises stdio, HTTP, and SSE; no client MCP server/tool was exercised. |
| Permissions, elicitation, filesystem callbacks | Not observed | No callback request occurred in the live prompt. |
| Cancellation and cleanup | Exercised | First attempt timed out; cancellation and thread deletion completed without a cleanup error. |
| Reconnect and recovery | Not observed | The successful retry used a fresh prepared session; desktop reconnect was not exercised. |
| Extension updates and requests | Not observed | No goal, session-failure, permission extension, or unknown extension was emitted live. |
| Desktop UI alignment | Not observed | Settings, composer, callback, and Inspector flow was not run in the desktop. |

### ACP event rendering coverage

The deterministic UI path has a materialized entry or state surface for every
normalized ACP event. Message chunks render streamed agent/thought content;
tool chunks append to an existing call or create one when the declaration is
late; terminals, plans, permissions, elicitations, provider extensions, and
unknown events use their existing surfaces. File writes and checkpoints render
as timeline entries, while compaction renders as an expandable divider. Usage,
commands, config, session info, cancellation, and extension resolutions update
their owning surfaces without being dropped.

## 2.2 Live conformance snapshot

The first prompt attempt produced no events within 90 seconds. The runner
cancelled and deleted that session. The retry completed the text turn and
cleanup:

```json
{"disposition":"exercised","provider":"claude-acp","stage":"vertical","node_runtime":"v25.2.1","reason":"install→prepare→prompt→idle→delete","snapshot":{"registry_version":"0.80.0","distribution":"npx","node_runtime_missing":false,"adapter_version":"0.80.0","protocol":"V1","health":"healthy","auth_state":"ready","auth_methods":[{"id":"claude-ai-login","name":"Claude Subscription","shape":{"shape":"cli-passthrough"}},{"id":"console-login","name":"Anthropic Console","shape":{"shape":"cli-passthrough"}}],"capabilities":{"load_session":true,"resume":true,"close_session":true,"list_sessions":true,"delete_session":true,"logout":true,"mcp":{"stdio":true,"http":true,"sse":true},"prompt_text":true,"prompt_resource_link":true,"prompt_image":true,"prompt_audio":false,"prompt_embedded_context":true,"elicitation":true}}}
```

## 3. Native-settings handoff for M2.5

The official [Claude Code settings reference](https://code.claude.com/docs/en/settings)
currently documents these writable scopes:

- `~/.claude/settings.json` — user settings.
- `.claude/settings.json` — shared project settings.
- `.claude/settings.local.json` — project-local settings.
- `managed-settings.json` and other managed sources — organization-controlled settings.

The documented JSON schema is
[`https://json.schemastore.org/claude-code-settings.json`](https://json.schemastore.org/claude-code-settings.json).
It is a rolling schema source, not a version-pinned schema range, and the
settings documentation warns that it may lag the current CLI. M2.5 should
record the schema URL and the Claude Code version used when validating a file.

Keep `~/.claude.json` read-only. Claude Code manages it; it contains sign-in
session state, MCP configuration, project trust, and global configuration.
This integration does not read or write that file.

## 4. Closeout items still open

| Item | Owner | Reason |
|---|---|---|
| R6 negotiated login/logout behavior | Conformance | The live adapter was already auth-ready; the advertised logout path was not invoked. |
| R7 desktop install-to-reconnect flow | Conformance | Requires an interactive Tethys desktop session. Protocol-runner evidence does not satisfy this requirement. |
| Remaining real adapter scenarios | Conformance | Rows remain explicitly `not observed`; run the desktop feature matrix before closing M1.18. |
| `_session/goal` set/pause/resume/clear actions | Follow-up only | Outbound controls are outside this plan's acceptance criteria; goal snapshots are read-only and no unsupported action is advertised. |

### Manual closeout matrix

Run these against the installed `claude-acp` profile, then replace the
remaining `Not observed` rows above with the observed disposition:

1. Settings: install/recheck Claude, exercise each advertised auth method,
   logout, and confirm health returns without exposing credentials.
2. New Thread: choose a trusted workspace and Claude, wait for the prepared
   session, set Model and Effort in the provider popover, set Mode in its
   separate button, send a streamed prompt, and verify the error/working state
   redraws without resizing.
3. Exercise one prompt for links/images, tool permission, edit review, plan,
   terminal, slash command, MCP, and (when offered) nested subagent output.
4. Reconnect or resume the thread, then close/delete it and confirm no Claude
   process remains.

## 5. Verification

| Check | Result |
|---|---|
| `cargo test -p tethys-acp --features mock,acp-v2` | Pass: 15 unit tests, 4 fixtures, 12 mock-flow tests |
| `cargo test -p tethys-agent-servers` | Pass: 16 unit tests, 14 registry tests, mock vendor test |
| `cargo test -p tethys-core --test provider_conformance` | Compiles; opt-in live run installed/initialized `claude-acp` `0.80.0` and exercised a text turn on retry |
| `pnpm --filter @tethys/features test` | Pass: 49 files, 318 tests |
| `pnpm --filter @tethys/state test` | Pass: 8 files, 90 tests |
| `pnpm --filter @tethys/desktop test` | Pass: 11 files, 69 tests |
| `pnpm --filter @tethys/features lint` and `typecheck` | Pass |
| `pnpm --filter @tethys/desktop lint` | Pass |
| `pnpm --filter @tethys/desktop build` | Pass: TypeScript check and Vite production build |
| `cargo test -p tethys-core --lib` | Pass: 23 unit tests, including stale dependent-option removal after a model schema refresh |
| `cargo test -p tethys-core --test thread_flows` | Pass |
| `pnpm --filter @tethys/features typecheck` | Pass |
| `pnpm run codegen` | Pass after schema changes |
| `cargo fmt --all -- --check` | Pass after runner cleanup changes |

The workspace engine warning is separate from Claude adapter compatibility:
this checkout requests Node `>=22 <23`, while the adapter requires Node 22 or
later. The observed runtime `v25.2.1` meets the adapter prerequisite.

## Sources

- [Current ACP Registry entry](https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json) — checked 2026-09-22.
- [Claude Agent ACP README](https://github.com/agentclientprotocol/claude-agent-acp/blob/main/README.md) — runtime prerequisite.
- [Claude subagent update types](https://github.com/agentclientprotocol/claude-agent-acp/blob/main/src/acp-subagents.ts) and [subagent routing](https://github.com/agentclientprotocol/claude-agent-acp/blob/main/src/native-subagents.ts).
- [Goal extension](https://github.com/agentclientprotocol/claude-agent-acp/blob/main/docs/goal-extension.md) and [session-failure extension](https://github.com/agentclientprotocol/claude-agent-acp/blob/main/docs/session-failure-extension.md).
- [Claude Code settings reference](https://code.claude.com/docs/en/settings).
