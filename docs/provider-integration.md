# Provider integration

**Snapshot:** 2026-09-24. The live ACP handshake and registry entry decide actual capabilities, versions, and distributions.

Tethys is an ACP client. A vendor CLI, an ACP server or adapter, and a Tethys Provider profile are distinct. One Provider row represents one agent across installed and registry launch sources. See [architecture.md](./architecture.md#provider-launch-and-feature-seams) for the shared seams.

M1.17 established the registry path; M1.19 adds discovery of installed ACP
commands. Both use the same connection path:

`existing ACP command or registry entry → resolved launch spec → ConnectionStore → initialize → auth state → session/new → typed events → UI state`

A known Provider profile carries a stable `integration_id` regardless of launch
source; `registry_ref` is reserved for a pinned registry installation. A new ACP agent
that uses the standard protocol only needs registry data or a manual launch
profile; it does not add a provider branch to the launcher, ACP mapper, thread
coordinator, or UI.

Provider-specific behavior is optional. The backend registers one
`AcpProviderIntegration` value for initialize `_meta`, negotiated capabilities,
and claimed namespaced methods. The provider registry stores that value
directly; provider id, extension methods, and handlers are not mirrored in a
second descriptor. The UI registers one provider surface module with
`registerProviderSurface`. Requests are scoped to a thread and correlation id;
unknown methods remain inspectable and unclaimed requests receive
`method-not-found`. Connection-level notifications reach profile state without
a thread id. Negotiated outbound session controls and per-turn prompt metadata
use the same shared ACP boundary; a provider module supplies only its extension
payload. Capability negotiation uses declared metadata and handler presence; it
does not invoke handlers with synthetic sessions, requests, or prompts.

The shared session contract exposes negotiated lifecycle, prompt content,
configuration, MCP, callback, authentication, and extension capabilities. The
desktop enables controls from that snapshot. Stable prompt blocks are preserved
as text, resource links, images, audio, and embedded resources; unsupported
outbound blocks are rejected before a wire call.

The first supported product order is Claude Code, Codex, and OpenCode. Their
registry ids and live capability/auth results remain the source of truth; the
catalog supplies display order, setup copy, and the Settings action gate. As
of this snapshot, all three current `ready` entries get first-class setup and
update actions. Their provider-specific acceptance ledgers remain authoritative
for unfinished scenarios; an open scenario does not remove the explicitly
approved standard ACP setup actions.

## Provider setup actions and promotion

The curated catalog's `support: "ready"` value is the Settings action gate.
Each ready Provider has one setup/update area beside its Provider row:

- Prefer a verified installed ACP command and offer **Use existing** when one
  is available. A vendor CLI is not evidence that its separate ACP adapter is
  installed.
- Otherwise offer **Install** only for that ready Provider's compatible,
  permitted registry distribution. Show its package or binary, version, and
  runtime requirement with the action.
- Offer **Update** only when the active profile has a matching `registry_ref`
  and the registry reports a newer version. A manual or system launch does not
  own a registry update.
- Do not duplicate these actions in the registry browser. `soon` Providers and
  registry-only entries remain visible as browse-only cards. A registry entry
  is not a Tethys support claim. A compliance or distribution block suppresses
  the action and keeps its reason visible.
- Keep one Provider profile across launch-source changes and preserve its
  user-owned name, environment, working directory, enabled state, protocol
  preference, and projection target. Update only registry-owned launch data
  during a registry update.

For future additions, promote a Provider to `ready` only when Tethys has a
usable ACP launch source, a successful `initialize` handshake, and a verified
basic session path through `session/new` and a prompt, including its auth path
when authentication is required. Resolve applicable compliance gates before
showing a setup action. Record provider-specific
feature and live acceptance results in its results ledger; incomplete optional
capabilities or live scenarios remain explicit there and are not implied by
registry metadata. Keep `soon` entries inert until the basic supported path is
ready.

## Adding a standards-only agent

Publish or add the registry row and point a manual profile at a verified ACP
command. Settings keeps this registry entry browse-only until the Provider
passes the promotion rule above. The generic registry install API remains
available to internal integration and conformance tests; it is not a user
facing install path for an unsupported entry. Use the normal provider/session
APIs. No Rust or TypeScript provider module is required for standards-only
protocol support.

## Adding an extension

Add one `AcpProviderIntegration` to the backend provider integration registry
and one UI registration module. Keep extension payloads opaque at the shared
boundary and return responses through `thread.respond_extension`.

## First five Providers

| Provider | ACP command Tethys should launch | If the vendor CLI is already installed | Tethys status |
|---|---|---|---|
| **Claude Code** | Separate `claude-agent-acp` adapter ([source](https://github.com/agentclientprotocol/claude-agent-acp)); registry id `claude-acp` | `claude` alone is not an ACP server. Reuse an installed `claude-agent-acp`; otherwise offer its registry distribution. The adapter uses the Claude Agent SDK, so do not require a second global `claude` install just to use ACP. | Catalog says ready; code implementation is complete, with live desktop acceptance still open ([results](./claude-code-provider-results.md)). |
| **Codex** | Separate `codex-acp` adapter ([source](https://github.com/agentclientprotocol/codex-acp)); registry id `codex-acp` | `codex` alone is not an ACP server. Reuse an installed `codex-acp`; otherwise offer the registry package. The package includes a compatible `@openai/codex` dependency. `CODEX_PATH` can select the user's existing binary at run time after a compatibility check, but does **not** prevent that package dependency from being downloaded. | Source integration and the existing-adapter action are implemented. Live adapter/auth/desktop acceptance remains open in the [results ledger](./codex-provider-results.md). |
| **OpenCode** | Built-in `opencode acp` ([official ACP docs](https://opencode.ai/docs/acp/)); registry id `opencode` | The ready catalog row offers the registry distribution. Use an existing executable through a verified profile; provider-specific local discovery is offered only where implemented. No separate adapter install. | Settings offers standard ACP registry setup; M1.20 native-command verification and provider-specific acceptance remain not started. |
| **Antigravity CLI (`agy`)** | Separate registry server `antigravity-acp` ([Google's Zed guidance](https://antigravity.google/docs/ide/extensions/zed)); registry id `antigravity-acp` | [`agy` CLI docs](https://antigravity.google/docs/cli-install) do not document an ACP launch mode or establish that `agy` replaces `antigravity-acp`. Detecting `agy` is informational, not ACP readiness. | Catalog says soon. Tethys holds installation/connection behind its existing compliance review; do not offer an automatic install yet. |
| **Kiro CLI** | Built-in `kiro-cli acp` ([official ACP docs](https://kiro.dev/docs/cli/acp/)) | Reuse the installed `kiro-cli` directly after an ACP handshake. No second client or adapter install. | Catalog says soon. No `kiro` entry was present in the live ACP registry at this snapshot, so there is no registry fallback to offer. |

## Install and detection cases

1. **Existing Tethys profile:** recheck that profile first. Do not create a second profile or overwrite a user's launch path, environment, or authentication choice.
2. **Installed ACP executable:** find the provider's actual ACP command in the app's `PATH`, or use a path the user selected. Launch and `initialize` it before marking the Provider ready. A vendor CLI's presence alone is insufficient where an adapter is required.
3. **No usable ACP executable:** for a ready catalog Provider, if a permitted registry distribution exists, offer one install action with its selected distribution and version shown. Codex and Claude installs add adapters; OpenCode's registry binary is its standard ACP launch source; Kiro currently has no registry fallback. Antigravity stays gated.
4. **After install or path change:** retain one Provider row, record its launch source and actual version, recheck auth separately from executable health, and keep user credentials in the agent's auth flow or Tethys's secret handling. Tethys's app process may have a different `PATH` than an interactive shell; offer a path override when discovery misses a known install.

`registry_ref` means a **pinned registry installation**. An existing-system profile has no `registry_ref`; it still carries the known integration id. Registry update/removal actions apply only to registry-owned installs. Switching source requires an explicit profile action and must preserve user data.

For a known adapter, explicitly choosing **Use existing** repairs the same
profile's executable and arguments from the detected ACP command while
preserving its id, name, environment, working directory, protocol preference,
projection target, and enabled state. A registry-owned profile becomes a
system/manual launch and loses its `registry_ref`; the installed registry
artifact is not deleted by that profile change. Tethys rechecks the ACP
handshake afterward, and a failed handshake remains unhealthy.

## Feature contract

| Provider | Upstream ACP surface relevant to Tethys | Tethys work/status |
|---|---|---|
| Claude Code | The [official adapter](https://github.com/agentclientprotocol/claude-agent-acp) exposes prompts with context/images, tools and permissions, edit review, TODO/plan, subagents, terminals, slash commands, MCP, and opt-in goal/failure/config/permission extensions. | Shared ACP UI plus Claude-owned extension mapping exists; finish the [live acceptance matrix](./claude-code-provider-results.md). |
| Codex | The [maintained adapter](https://github.com/agentclientprotocol/codex-acp) exposes auth, session/config/lifecycle, prompt content, tools/diffs/permissions/terminal, MCP, usage, review, commands, and opt-in goals, steering, async tasks, subagents, file-change reports, recommended values, and failure/notice/compaction metadata. | Shared controls and Codex metadata mapping are implemented, with deterministic fixture coverage. Live adapter/auth/desktop acceptance and the exact advertised feature snapshot remain setup-required; see the [Codex results ledger](./codex-provider-results.md). |
| OpenCode | [`opencode acp`](https://opencode.ai/docs/acp/) exposes its tools, custom commands, MCP config, rules, agents, and permissions. The upstream docs currently call out `/undo` and `/redo` as unsupported over ACP. | Settings can install its ready registry distribution. M1.20 still needs to verify the native command and record actual handshake/feature dispositions. |
| Antigravity CLI | Google's [ACP registry instructions](https://antigravity.google/docs/ide/extensions/zed) identify `antigravity-acp`; the [CLI installation docs](https://antigravity.google/docs/cli-install) describe `agy`. The available docs do not establish feature parity between them. | Keep the catalog entry inert until the compliance gate and separate ACP conformance review close. |
| Kiro CLI | [`kiro-cli acp`](https://kiro.dev/docs/cli/acp/) documents new/load/prompt/cancel, mode/model changes, image prompts, streaming, and `_kiro.dev/` command, MCP OAuth/server status, compaction, and clear events. | Future direct-launch integration; map those events to commands, MCP health/auth, and session status only after handshake and UI support. |

For all five, the [ACP protocol](https://agentclientprotocol.com/) is the common contract. A feature advertised by an upstream README is **not** automatically supported by Tethys: the integration must preserve its wire fields, render or control it, and record an exercised, unsupported, or unobserved disposition in [provider conformance](./provider-conformance.md). This distinction also applies to optional ACP draft and vendor extensions.
