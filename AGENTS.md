# AGENTS.md

## Design System
- Reference DESIGN.md for design system & tokens.

## Context & Documentation
- Invoke the find-docs skill for up-to-date documentation on any library or module.

## Coding Standards
- Use **behavioral naming** for files, functions, classes, variables, and tests — name things after what they *do* or *represent*, not the milestone, phase, sprint, or ticket they came from. If a name references a temporary project stage, rename it before committing.
  - ❌ `phase2_handler.ts`, `milestone3_test.py`, `v2_utils.js`
  - Y `payment_handler.ts`, `checkout_validation_test.ts`, `date_utils.js`
- **Deep Modules**: Expose minimal interfaces over deep logic; test against the public interface, not internal details. 
  - Choose the simplest implementation that fully meets the requirements. Avoid over-engineering or speculative abstractions.
  - Use functional patterns where possible
  - Keep components modular & concerns clearly separated
- **Deep, Cohesive Modules**: Give each module a small interface that hides cohesive behavior (depth), and test through that interface. Put seams where behavior actually varies; one adapter is a hypothetical seam, while two adapters show a real one. Keep dependencies explicit and one-way. Before growing a production module past 500 lines, review whether it owns independent behavior; treat 800 lines as an upper review limit. Split independent behavior or document a genuine cohesion/language constraint. Never split only to satisfy line counts; an extracted module must own behavior, not just pass calls through.
- **Ponytail / Readable Control Flow**: Before adding code, look for an existing module, standard-library or platform feature, or installed dependency that already solves the problem. Choose the smallest correct implementation; prefer deleting unnecessary layers to adding them. Avoid speculative abstractions, duplicate state or policy, factories with one product, God modules, cyclic dependencies, cross-layer reach-through, and deeply nested workflows. Keep each policy and state transition at one owner; orchestration should compose cohesive operations instead of spreading one workflow across callers.
- **Pure Data Flow**: Pass dependencies explicitly; return pure results instead of producing uncontrolled side effects.
- **Rust Idioms**: Prefer `&str`/`&[T]` over owned types; never use `.unwrap()` or `.expect()` in production code.
- **Error Handling**: Use `thiserror` for library domain errors; reserve `anyhow` exclusively for top-level binaries/tasks.
- **Async Runtime**: Never block async threads with `std::thread::sleep`; never hold sync `MutexGuard` across `.await`.
- **Tauri IPC**: Keep commands as thin boundary adaptors; run `pnpm run codegen` on any Specta schema changes.
- **Deterministic Tests**: Keep standard tests strictly functional, isolated, and sub-second (< 1s execution).

## Anti-Patterns
-  **Heavy Benchmarks in Tests**: Never generate thousands of files/links in `cargo test` (causes `EMLINK`, disk wear, and slow CI); keep benchmarks in dedicated `benches/`.
-  **Re-running Recorded Benchmarks**: A milestone benchmark is run once on the author's machine and recorded in its results doc; do not re-run it for review, CI, or future chunks. Dependencies (FFF, gix, rusqlite, …) are already benchmarked and tested by their own maintainers — benchmark only our integration, never the upstream crate.
- **Libraries if possible**: Never hand-roll primitives when standard libraries are installed
-  **Platform-Blind Assertions**: Never assume LF endings on Windows checkouts (normalize with `.trim_end()`); never assume instant process reaping on Unix/macOS (poll with timeout).
-  **Implicit Concurrency Dependencies**: Never rely on execution order in Turborepo without explicit `dependsOn` (e.g. `lint` depending on `codegen`).
-  **Missing Platform Assets**: Never omit required multi-platform icons in `tauri.conf.json` (causes startup panic).
