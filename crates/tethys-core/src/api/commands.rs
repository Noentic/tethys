//! `commands.*` implementations.

use std::path::PathBuf;

use tethys_api::{ApiError, CommandsApi};
use tethys_schema::composer::{CommandInfo, CommandScope, CommandSource, ExpandedCommand};
use tethys_schema::sync::WorkspaceId;

use crate::composer::{
    delete_command, expand_command, global_commands_dir, list_commands,
    list_commands_with_shadowed, read_command, workspace_commands_dir, write_command,
};
use crate::Core;

impl CommandsApi for Core {
    async fn commands_list(
        &self,
        workspace_id: Option<WorkspaceId>,
        include_shadowed: bool,
    ) -> Result<Vec<CommandInfo>, ApiError> {
        let home = self.sync_home();
        let global = global_commands_dir(&home);
        let root = match workspace_id {
            Some(ref id) => Some(self.workspace_roots.root(id).await?),
            None => None,
        };
        if include_shadowed {
            list_commands_with_shadowed(&global, root.as_deref())
        } else {
            list_commands(&global, root.as_deref())
        }
    }

    async fn commands_expand(
        &self,
        command: String,
        args_text: String,
        workspace_id: Option<WorkspaceId>,
    ) -> Result<ExpandedCommand, ApiError> {
        let home = self.sync_home();
        let global = global_commands_dir(&home);
        let root = match workspace_id {
            Some(ref id) => Some(self.workspace_roots.root(id).await?),
            None => None,
        };
        let skills = self.skill_candidates(root.as_deref()).await?;
        expand_command(&global, root.as_deref(), &skills, &command, &args_text)
    }

    async fn commands_read(
        &self,
        scope: CommandScope,
        name: String,
        workspace_id: Option<WorkspaceId>,
    ) -> Result<CommandSource, ApiError> {
        let dir = self.command_dir(scope, workspace_id).await?;
        read_command(&dir, &name, scope)
    }

    async fn commands_write(
        &self,
        scope: CommandScope,
        name: String,
        body: String,
        workspace_id: Option<WorkspaceId>,
    ) -> Result<CommandInfo, ApiError> {
        let dir = self.command_dir(scope, workspace_id).await?;
        write_command(&dir, &name, &body, scope)
    }

    async fn commands_delete(
        &self,
        scope: CommandScope,
        name: String,
        workspace_id: Option<WorkspaceId>,
    ) -> Result<(), ApiError> {
        let dir = self.command_dir(scope, workspace_id).await?;
        delete_command(&dir, &name, scope)
    }
}

impl Core {
    /// Directory backing one command scope (global or workspace).
    async fn command_dir(
        &self,
        scope: CommandScope,
        workspace_id: Option<WorkspaceId>,
    ) -> Result<PathBuf, ApiError> {
        match scope {
            CommandScope::Global => Ok(global_commands_dir(&self.sync_home())),
            CommandScope::Workspace => {
                let id = workspace_id.ok_or_else(|| {
                    ApiError::InvalidConfig("workspace scope requires a workspace".into())
                })?;
                let root = self.workspace_roots.root(&id).await?;
                Ok(workspace_commands_dir(&root))
            }
        }
    }
}
