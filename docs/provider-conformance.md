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
It prints exactly one machine-readable line per run and reports one of these
dispositions for each selected registry id:

- `exercised`
- `declared-unsupported`
- `not-observed`
- `setup-required` (missing binary, account, or auth)

Per-row dispositions for the stable ACP and registry contract live in
`docs/m1.17-results.md` (§2 Coverage ledger).

Set `TETHYS_CONFORMANCE_PROVIDER_ID` and `TETHYS_CONFORMANCE_WORKSPACE`, then
run:

```text
cargo test -p tethys-core --test provider_conformance -- --ignored --nocapture
```

Optional `TETHYS_CONFORMANCE_HOME` keeps the profile database and install cache
outside the default home. The runner never prints credentials, launch env
values, raw ACP params, or provider stderr: each line carries the disposition,
the provider id, a stage, and a sanitized reason (query strings stripped,
truncated).

The first live matrix is Claude Code, Codex, and OpenCode. A new standards-only
registry agent can use the same runner without a code change.
