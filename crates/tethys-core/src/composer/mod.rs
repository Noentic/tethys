//! Composer resolution: `/` commands, `$` skills, `@` paths (M1.5).
//!
//! Every resolved prompt is plaintext. `ExpandedCommand.references` carries
//! UI-only metadata (chips, icons, method badges) that is never injected.

pub mod commands;
pub mod paths;
pub mod skills;

pub use commands::{
    delete_command, expand_command, global_commands_dir, is_valid_command_name, list_commands,
    list_commands_with_shadowed, project_commands_dir, read_command, workspace_commands_dir,
    write_command,
};
pub use paths::path_reference;
pub use skills::{skill_reference, SkillCandidate};
