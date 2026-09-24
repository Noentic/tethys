# Codex provider integration results

**Snapshot:** 2026-09-24  
**Status:** Source implementation and deterministic checks complete; live acceptance pending

This ledger separates Tethys implementation evidence from behavior observed from
the installed `codex-acp` adapter. An upstream feature is not marked live
`exercised` unless the adapter handshake and desktop path were observed.

## Runtime and handshake

| Item | Observation |
|---|---|
| Vendor CLI | `codex-cli 0.155.0` is available in the current environment. |
| ACP adapter | `codex-acp` is not available on the current process `PATH`. |
| Adapter package/version | Not installed or resolved in this run. |
| Launch source | System Codex CLI only; no ACP adapter launch was attempted. The ignored runner accepts `TETHYS_CONFORMANCE_ACP_PATH`, otherwise checks for `codex-acp` on its process `PATH`, and never installs from the registry without `TETHYS_CONFORMANCE_ALLOW_REGISTRY_INSTALL=1`. |
| Node.js | `v25.2.1`; the repository declares `>=22 <23`. Package commands emit an engine warning. |
| `initialize` / ACP protocol | Not observed; no adapter process was available. |
| Advertised auth methods and capabilities | Not observed; no adapter handshake was available. |
| Codex account/auth path | Setup required: adapter and an available auth path are needed. |
| Desktop smoke | Not observed. A real prepared session, first-prompt event subscription, permission path, reconnect, fork, and process cleanup still need an adapter-backed desktop run. |
| `CODEX_PATH` compatibility | Not tested against this CLI and an adapter version. Using it may select the existing CLI at runtime but does not remove the adapter package's `@openai/codex` dependency. |

No credentials, launch environment, route URLs, ACP params, or provider stderr
are recorded here. The live runner prints a sanitized handshake snapshot for
an explicit-path, system-path, or explicitly opted-in registry launch. No live
launch source was available in this run.

## Coverage ledger

The live disposition column applies the plan's four-state vocabulary. Fixture
evidence is listed separately and does not upgrade a live Codex row to
`exercised`.

| Coverage group | Tethys surface and deterministic evidence | Live disposition | Blocker / limit |
|---|---|---|---|
| Launch, auth, and provider choice | The Codex catalog distinguishes `codex` from `codex-acp`; the system action reuses a `codex-acp` executable and stable integration identity. Registry install remains the fallback. Login input is ephemeral and validated against the advertised method; gateway headers reject injection. | **setup required** | The ACP executable is absent, so no adapter handshake, login method, account status notification, logout, or gateway auth was observed. The package can include its own Codex runtime dependency even when a user has a separate `codex` CLI. |
| Sessions | Shared session lifecycle and typed Provider-session fork are implemented. Core/ACP deterministic suites pass; the live runner now probes a negotiated fork and deletes the child thread. | **setup required** | No provider-backed new/list/load/resume/fork/close/delete/reconnect cycle was run. Cursoring, additional directories, and adapter-specific cleanup remain part of live acceptance. |
| Prompt and configuration | Shared prompt content and config-option flow remain provider-neutral. Codex recommendations only apply to selectable options and preserve recommended/current values; deterministic adapter tests cover recommendation mapping. | **setup required** | No live model, reasoning, fast, approval, sandbox, grouped config, rich-media, or next-turn behavior was observed. Audio support and any unsupported prompt shapes require a handshake-backed disposition. |
| Transcript and tools | Shared event mapping preserves text/tool/terminal/file changes, structured diff statistics, usage/quota metadata, failure details, and unknown metadata. Codex fixture tests cover file-report request correlation, valid/stale report handling, async task lifecycle, and native child identity. | **setup required** | No live shell, file edit, web search, image generation/view, MCP transport, source attribution, review finding, or usage/quota event was streamed. File-change reports are advisory and incomplete for shell/generated changes. |
| Permissions and elicitations | Shared permission choices retain order and IDs; request and option descriptions are normalized and displayed. ACP fixture tests cover v1/v2 callbacks and elicitation paths. | **setup required** | No Codex permission prompt or URL/form elicitation was observed. No durable grant is inferred by Tethys. |
| Commands and skills | Existing shared command/skill surfaces consume ACP command declarations; Codex-only `/status`, `/mcp`, `/skills`, `/goal`, `/review`, `/review-branch`, `/review-commit`, `/compact`, and `/logout` remain ordinary advertised command records. | **setup required** | No live Codex command list or command execution was observed; each command's adapter availability still needs a runtime disposition. |
| Extensions | Codex registration maps negotiated goal snapshots/actions, steering, async task stop, native subagent sessions, correlated file reports, auth status, recommended values, permission presentation, and typed session failure. Deterministic tests cover these Codex event mappings and bilateral capability gating. | **setup required** | No live `_meta`, connection-level auth notification, goal/steering control, async stop, native child event, or failure notification was observed. Unsupported optional extensions must stay hidden after handshake. |
| Native settings handoff | M1.19 intentionally adds no native config editor. The M2.5 reference is `~/.codex/config.toml` (TOML); the MCP surface uses `[mcp_servers.<name>]` with local `command`, `args`, `env` and remote `url`, `bearer_token_env_var`, `http_headers`, or `env_http_headers` fields. See `pages-views-spec.md` §5.4. | **declared-unsupported** for M1.19 | No full-file editor is in this milestone. The exact official writable schema and supported Codex version must be reverified and recorded before M2.5 writes settings. |

## Deterministic checks

The following source-level checks passed in this checkout:

- `cargo fmt --all -- --check`
- `cargo check --workspace --all-targets --all-features`
- `cargo clippy --workspace --all-targets --all-features`
- `cargo test -p tethys-acp -p tethys-agent-servers -p tethys-core --all-features --no-fail-fast`
- `pnpm --filter @tethys/features exec vitest run src/agents/login.test.tsx src/agents/login-recheck.test.tsx src/agents/providers-view.test.tsx src/composer/provider-controls.test.tsx src/thread-new/model-selector.test.tsx`
- `pnpm --filter @tethys/features exec vitest run src/thread-new/prompt-card.test.tsx`
- `pnpm --filter @tethys/features lint`
- `pnpm --filter @tethys/state exec vitest run src/reducer-coverage.test.ts`
- `pnpm --filter @tethys/features typecheck`

These checks exercise fixtures and shared code, not the Codex ACP process. The
ignored live runner has not been run because the adapter is missing.

Workspace Clippy exits successfully with one existing warning: the
`terminal_host.rs` constructor has eight arguments. That file is outside this
close-out. Strict `-D warnings` therefore remains nonzero.

## Acceptance still required

Install or point Tethys at a compatible `codex-acp`, record its package and
Codex versions plus sanitized `initialize` capabilities, exercise one real
auth path, and run the full desktop smoke route. Then fill every setup-required
row above with the observed capability and scenario or with a precise
`declared-unsupported` / `not-observed` reason. Keep the M2.5 native settings
handoff separate from M1.19 feature claims.
