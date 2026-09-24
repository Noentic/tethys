# OpenCode provider integration results

**Snapshot:** 2026-09-24  
**Status:** Live handshake, system detection, and deterministic conformance verified

This ledger separates Tethys implementation evidence from behavior observed from
the installed `opencode` binary via its native `opencode acp` server.

## Runtime and handshake

| Item | Observation |
|---|---|
| Vendor binary | `opencode 1.18.32` is available in the current environment (`PATH`). |
| ACP adapter | Native: `opencode` implements ACP directly via `opencode acp` without a separate adapter package or wrapper crate. |
| Launch source | `system-path`: `which::which("opencode")` detects the existing executable, launching `opencode acp`. Fallback to registry binary occurs only when no system binary is found. |
| Node.js | `v25.2.1` |
| `initialize` / ACP protocol | `V1` negotiated cleanly with Tethys ACP client. |
| Health & auth state | Reported `healthy`, auth state `ready`. |
| Advertised auth methods | `[{"id": "opencode-login", "name": "Login with opencode", "shape": {"shape": "agent-auth"}}]`. Terminal auth flow (`opencode auth login` / `opencode providers`) manages vendor keys out-of-band. |
| Advertised capabilities | `load_session`: true, `resume`: true, `close_session`: true, `list_sessions`: true, `delete_session`: false, `logout`: false, `session_fork`: true, `elicitation`: true, `mcp`: `{"stdio": true, "http": true, "sse": true}`, `prompt_text`: true, `prompt_resource_link`: true, `prompt_image`: true, `prompt_audio`: false, `prompt_embedded_context`: true. |
| Desktop & Providers Settings | Exercised: Providers view (`/settings/providers`) detects the system agent and displays OpenCode detected status with "Use existing" connection button. |

## Coverage ledger

| Coverage group | Tethys surface and deterministic evidence | Live disposition | Notes / limits |
|---|---|---|---|
| Launch, auth, and system detection | System detection prioritizes local `opencode` on `$PATH` (`args: ["acp"]`), eliminating duplicate installs. Settings > Providers displays "OpenCode detected" setup guide with one-click "Use existing" connection. Registry fallback available when no local binary exists. Auth is managed via Terminal sheet (`opencode auth login` / `opencode providers`). | **exercised** | System binary detected at `/home/woshi/.local/share/mise/installs/node/25.2.1/bin/opencode`. No registry install triggered when system binary exists. |
| Sessions | Standard session lifecycle (`session/new`, `list`, `load`, `resume`, `close`) and typed session fork are supported. | **exercised** | `session/delete` and `logout` are advertised as `false` (`declared-unsupported` over ACP; session cleanup managed via client thread delete and CLI commands). |
| Prompt and configuration | Prompt content handles text, images, resource links, and embedded context. Config options map model selection and reasoning effort variants (`#variant`). | **exercised** | Audio prompts are advertised as `false` (`declared-unsupported`). |
| Transcript, tools, and callbacks | ACP streaming updates (`agent_message`, `agent_thought`, `plan`), tool calls, and sandboxed client callbacks (`fs/*`, `terminal/*`) conform to ACP v1. | **exercised** | Tool execution operates within workspace roots; out-of-root access rejected. |
| Permissions and elicitations | Permissions preserve option IDs, descriptions, and user decisions. Elicitation requests handled via UI modal. | **exercised** | Standard ACP v1 permission request/response protocol. |
| Commands and skills | ACP command list exposes available commands. `/compact` and custom commands supported. | **exercised** | `/undo` and `/redo` commands are declared-unsupported over ACP (managed internally by OpenCode TUI, not via ACP RPC). |
| Model Context Protocol (MCP) | MCP servers attached via stdio, HTTP, and SSE transports. | **exercised** | OpenCode advertises full MCP capability: `{"stdio": true, "http": true, "sse": true}`. |
| Native settings handoff | Configuration projection for M2.5: `opencode.json` / `opencode.jsonc` in workspace root or `~/.config/opencode/opencode.json`. | **declared-unsupported** for M1.20 | Native config editor deferred to M2.5 milestone. Settings handoff format documented. |

## Deterministic checks

The following checks passed in this checkout:

- `cargo check --workspace --all-targets`
- `cargo test --workspace --no-fail-fast`
- `cargo test -p tethys-core --test provider_conformance -- --ignored --nocapture` (Live runner output: healthy handshake, protocol V1, adapter version 1.18.32)
- `pnpm run typecheck` (all 11 packages and apps)
- `pnpm run lint` (all 11 packages and apps)
- `pnpm run test` (all 11 packages and apps: 345 feature tests, desktop tests, ui tests, state tests)
- Biome check and format verification
