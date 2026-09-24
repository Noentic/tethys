# Provider conformance

The deterministic ACP mock suite is the release gate for shared behavior. It
covers registry selection, connection setup, negotiated capabilities, auth
states, prepared sessions, ordered events, callbacks, extension responders,
cancellation, reconnect, and cleanup without network or vendor accounts.

The standards-only vertical slice lives in
`crates/tethys-core/tests/registry_install_run.rs`: it installs an unknown
registry id from a local registry fixture, proves no Provider descriptor is
needed, and drives prepare → subscribe → prompt → permission, form
elicitation, terminal, and jailed filesystem callbacks → completion → delete
through the ordinary Core API.

The real-provider runner is opt in and uses the same public APIs as the desktop.
It prints one machine-readable JSON record per run and reports one of these
dispositions for each selected registry id:

- `exercised`
- `declared-unsupported`
- `not-observed`
- `setup-required` (missing binary, account, or auth)

For a healthy install, the record includes the registry/package version,
distribution, Node runtime, negotiated protocol, adapter version, declared auth
method ids/shapes, health/auth state, and normalized capabilities. Setup
failures still report the Node runtime separately from Provider health. The
runner omits launcher arguments, environment values, raw ACP params, and
provider stderr.

On a healthy idle session, the runner also calls negotiated `providers/list`
without changing any route, and exercises a negotiated session fork followed
by thread cleanup. Route IDs, URLs, and header values are omitted. These live
observations produce separate feature records; capability absence is recorded
as `declared-unsupported`, and a failed or unavailable call is `not-observed`.

Per-row dispositions for the stable ACP and registry contract live in
`docs/m1.17-results.md` (§2 Coverage ledger). Claude's adapter mapping, live
smoke status, and native-settings handoff are recorded in
`docs/claude-code-provider-results.md`.
Codex's adapter inventory, deterministic source evidence, live setup blocker,
and M2.5 native-settings handoff are recorded in
`docs/codex-provider-results.md`.

Set `TETHYS_CONFORMANCE_PROVIDER_ID` and `TETHYS_CONFORMANCE_WORKSPACE`, then
run:

```text
cargo test -p tethys-core --test provider_conformance -- --ignored --nocapture
```

For Codex, the runner first reuses `codex-acp` from the app process `PATH`. To
select a specific installed executable, set `TETHYS_CONFORMANCE_ACP_PATH` to a
file named `codex-acp` (or `codex-acp.exe`). If neither source exists, the
runner reports `setup-required` and does not install anything unless
`TETHYS_CONFORMANCE_ALLOW_REGISTRY_INSTALL=1` is explicitly set. An invalid
explicit path is always a setup error; it never falls through to installation.
Registry installs use a unique run directory below
`TETHYS_CONFORMANCE_HOME` (or the system temporary directory). The `codex`
vendor CLI by itself is not an ACP adapter and never satisfies this check.

The runner never prints credentials, launch env values, raw ACP params, or
provider stderr: each line carries the disposition, the provider id, a stage,
and a sanitized reason (query strings stripped, truncated).

The first live matrix is Claude Code, Codex, and OpenCode. A new standards-only
registry agent can use the same runner without a code change.
