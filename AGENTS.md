# AGENTS.md

Guidance and standards for AI coding agents and contributors working in the Tethys codebase.

---

## 1. Project Overview

Tethys is a local multi-agent desktop application built with **Tauri v2**, **React 19**, and a modular **Rust** backend.

### Architecture & Workspace Layout
- **Monorepo Tools:** `pnpm` workspaces (v10+), `turborepo` (v2+), Cargo workspaces (Rust 2021 / 1.77+).
- **`apps/desktop`**: Tauri v2 desktop frontend (React 19, Vite, TanStack Router).
- **`crates/tethys-core`**: Core engine: process supervisor, git engine, fuzzy search, SQLite event store, ACP client.
- **`crates/tethys-schema`**: Wire types and IPC models exported via `specta`.
- **`crates/tethys-api`**: Tauri IPC command router and event handlers.
- **`crates/xtask`**: Development tasks (e.g., TypeScript bindings generation).
- **`packages/bindings`**: Auto-generated TypeScript types & IPC bridge contracts.
- **`packages/client`**: Typed IPC wrappers for the frontend.
- **`packages/config-ts`**: Shared TypeScript compiler configurations.

---

## 2. Essential Commands

Always execute commands from the repository root unless noted:

```bash
# Setup & dependencies
pnpm install

# Code generation (Rust Specta -> TypeScript bindings)
# MUST run after modifying any IPC types in crates/tethys-schema
pnpm run codegen

# Full build verification across monorepo
pnpm run build

# Typecheck & Lint
pnpm run typecheck
pnpm run lint

# Rust checks
cargo check --workspace
cargo clippy --workspace --all-targets -- -D warnings

# Testing
pnpm run test                                           # Run all package tests via turbo
cargo test --workspace --exclude tethys-desktop        # Run Rust tests
cargo test -p tethys-core --test <test_name>           # Run single test file
```

---

## 3. Engineering & Design Principles

### Deep Modules (`codebase-design`)
- **Small Interface, Deep Implementation:** Expose minimal methods and simple parameters while encapsulating domain complexity, state management, and error recovery internally.
- **Accept Dependencies, Return Results:** Pass dependencies (e.g., config, stores) into modules instead of instantiating global singletons. Return pure data/results; minimize uncontrolled side effects.
- **Test at the Seam:** The public interface is the test surface. Test behavior through the module interface rather than poking at internal private details.

### Rust Best Practices & Idioms (`rust-best-practices`)
- **Borrowing:** Prefer `&str` over `String` and `&[T]` over `Vec<T>` in function signatures. Avoid superfluous `.clone()`.
- **Error Handling:**
  - Libraries (`crates/tethys-*`): Use `thiserror` for typed domain errors.
  - Binaries / Tasks (`xtask`): Use `anyhow` for top-level error propagation.
  - **Zero Unwraps:** Never use `.unwrap()` or `.expect()` in production code. Use `?` for propagation.
- **Async Runtime Rules (`rust-async-patterns`):**
  - Tokio runtime is the standard. **Never** block async threads with `std::thread::sleep` or long synchronous computation inside an async function; use `tokio::time::sleep` or `tokio::task::spawn_blocking`.
  - Do **not** hold `std::sync::MutexGuard` across `.await` points (use `tokio::sync::Mutex` or restructure to release before awaiting).

### Tauri & Desktop IPC (`tauri-v2`)
- **Thin Commands:** Tauri commands in `crates/tethys-api` should be thin boundary adaptors that validate parameters, delegate to `tethys-core`, and return `Result<T, AppError>`.
- **Type Parity:** Any change to Rust IPC command signatures or models must be reflected in `crates/tethys-schema`, followed immediately by `pnpm run codegen`.
- **Required Assets:** Tauri v2 panics on launch if multi-platform icons are missing from `apps/desktop/src-tauri/tauri.conf.json`.

---

## 4. Anti-Patterns to Avoid

### 🚫 Heavy Synthetic Benchmarks in Standard Test Paths
- **The Problem:** Tests creating thousands of files or hardlinks on disk exhaust OS inode limits (`EMLINK: Too many links` on ext4's 65,000 link limit; NTFS limits at 1,024), thrash physical disks, cause high memory compilation spikes, and fail CI.
- **The Rule:** Standard `cargo test` is strictly for **deterministic functional and behavioral validation** (< 1s per suite).
- **Correct Approach:** Use small, synthetic fixtures (< 50 items/files) in `tests/`. Reserve large-scale benchmarks (> 1,000 items) for dedicated `benches/` or manual spike harnesses.

### 🚫 Platform-Blind File & Process Assertions
- **CRLF vs LF:** On Windows, `git checkout` writes CRLF endings by default. Never assert raw string equality against git-restored files without calling `.trim_end()` or normalizing newlines. Always maintain `eol=lf` in `.gitattributes`.
- **Process Reaping Latency:** On Unix (especially macOS / Darwin), terminating a process group (`SIGKILL` / `libc::kill(-pgid, ...)`) is asynchronous; the OS kernel / `launchd` reaps zombies over several milliseconds. Never assert immediate process disappearance—always poll with a small timeout (e.g., 250ms with 10ms intervals).

### 🚫 Monorepo Concurrency Hazards
- In Turborepo with `--concurrency 100%`, tasks that consume generated files must declare explicit dependency boundaries in `turbo.json` (e.g., `"lint": { "dependsOn": ["codegen"] }`). Never assume sequential task ordering in CI.

---

## 5. CI & PR Checklist

Before submitting or pushing a PR:

1. [ ] `pnpm run codegen` executed if schema/IPC was altered.
2. [ ] `pnpm run lint` and `pnpm run typecheck` pass cleanly.
3. [ ] `cargo check --workspace` and `cargo clippy --workspace -- -D warnings` pass.
4. [ ] `cargo test --workspace --exclude tethys-desktop` passes locally in sub-second time without disk thrashing.
5. [ ] Commit messages follow conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).
