use tethys_api::CommandsApi;

use super::{assert_unimplemented, MinimalApi};

#[tokio::test]
async fn commands_defaults_return_unimplemented() {
    let api = MinimalApi;
    assert_unimplemented("commands.list", api.commands_list(None).await);
    assert_unimplemented(
        "commands.expand",
        api.commands_expand("cmd".into(), String::new(), None).await,
    );
}
