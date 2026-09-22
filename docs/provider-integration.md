# Provider integration surface

M1.17 gives ACP-compatible agents one data-driven connection path:

`registry entry → resolved launch spec → ConnectionStore → initialize → auth state → session/new → typed events → UI state`

Registry profiles carry the stable registry id as `integration_id`. A new ACP
agent that uses the standard protocol only needs registry data; it does not add
a provider branch to the launcher, ACP mapper, thread coordinator, or UI.

Provider-specific behavior is optional. The backend registers one
`ProviderIntegrationDescriptor` for initialize `_meta` and claimed namespaced
methods. The UI registers one provider surface module with
`registerProviderSurface`. Requests are scoped to a thread and correlation id;
unknown methods remain inspectable and unclaimed requests receive
`method-not-found`.

The shared session contract exposes negotiated lifecycle, prompt content,
configuration, MCP, callback, authentication, and extension capabilities. The
desktop enables controls from that snapshot. Stable prompt blocks are preserved
as text, resource links, images, audio, and embedded resources; unsupported
outbound blocks are rejected before a wire call.

The first supported product order is Claude Code, Codex, and OpenCode. Their
registry ids and live capability/auth results remain the source of truth; the
catalog supplies display order and setup copy only.

## Adding a standards-only agent

Publish or add the registry row, install it through `agent.registry_install`,
and use the normal provider/session APIs. No Rust or TypeScript provider module
is required.

## Adding an extension

Add one backend descriptor to the provider integration registry and one UI
registration module. Keep extension payloads opaque at the shared boundary and
return responses through `thread.respond_extension`.
