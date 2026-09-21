use tethys_api::CommandsApi;
use tethys_schema::composer::CommandScope;

use super::{assert_unimplemented, MinimalApi};

#[tokio::test]
async fn commands_defaults_return_unimplemented() {
    let api = MinimalApi;
    assert_unimplemented("commands.list", api.commands_list(None, false).await);
    assert_unimplemented(
        "commands.expand",
        api.commands_expand("cmd".into(), String::new(), None).await,
    );
    assert_unimplemented(
        "commands.read",
        api.commands_read(CommandScope::Global, "cmd".into(), None)
            .await,
    );
    assert_unimplemented(
        "commands.write",
        api.commands_write(CommandScope::Global, "cmd".into(), "body".into(), None)
            .await,
    );
    assert_unimplemented(
        "commands.delete",
        api.commands_delete(CommandScope::Global, "cmd".into(), None)
            .await,
    );
}
