# AGENTS.md

## Coding Standards
- **Deep Modules**: Expose minimal interfaces over deep logic; test against the public interface, not internal details.
- **Pure Data Flow**: Pass dependencies explicitly; return pure results instead of producing uncontrolled side effects.
- **Rust Idioms**: Prefer `&str`/`&[T]` over owned types; never use `.unwrap()` or `.expect()` in production code.
- **Error Handling**: Use `thiserror` for library domain errors; reserve `anyhow` exclusively for top-level binaries/tasks.
- **Async Runtime**: Never block async threads with `std::thread::sleep`; never hold sync `MutexGuard` across `.await`.
- **Tauri IPC**: Keep commands as thin boundary adaptors; run `pnpm run codegen` on any Specta schema changes.
- **Deterministic Tests**: Keep standard tests strictly functional, isolated, and sub-second (< 1s execution).

## Anti-Patterns
- 🚫 **Heavy Benchmarks in Tests**: Never generate thousands of files/links in `cargo test` (causes `EMLINK`, disk wear, and slow CI); keep benchmarks in dedicated `benches/`.
- 🚫 **Platform-Blind Assertions**: Never assume LF endings on Windows checkouts (normalize with `.trim_end()`); never assume instant process reaping on Unix/macOS (poll with timeout).
- 🚫 **Implicit Concurrency Dependencies**: Never rely on execution order in Turborepo without explicit `dependsOn` (e.g. `lint` depending on `codegen`).
- 🚫 **Missing Platform Assets**: Never omit required multi-platform icons in `tauri.conf.json` (causes startup panic).
