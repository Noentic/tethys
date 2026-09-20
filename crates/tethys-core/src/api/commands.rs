//! `commands.*` implementations.

use tethys_api::{ApiError, CommandsApi};
use tethys_schema::composer::{CommandInfo, ExpandedCommand};
use tethys_schema::sync::WorkspaceId;

use crate::composer::{expand_command, global_commands_dir, list_commands};
use crate::Core;

impl CommandsApi for Core {
    async fn commands_list(
        &self,
        workspace_id: Option<WorkspaceId>,
    ) -> Result<Vec<CommandInfo>, ApiError> {
        let home = self.sync_home();
        let global = global_commands_dir(&home);
        let root = match workspace_id {
            Some(ref id) => Some(self.workspace_roots.root(id).await?),
            None => None,
        };
        list_commands(&global, root.as_deref())
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
}
