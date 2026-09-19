//! Composer resolution: `/` commands, `$` skills, `@` paths (M1.5).
//!
//! Every resolved prompt is plaintext. `ExpandedCommand.references` carries
//! UI-only metadata (chips, icons, method badges) that is never injected.

pub mod commands;
pub mod paths;
pub mod skills;

pub use commands::{expand_command, global_commands_dir, list_commands, project_commands_dir};
pub use paths::path_reference;
pub use skills::{skill_reference, SkillCandidate};
