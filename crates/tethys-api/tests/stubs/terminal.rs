use tethys_api::TerminalApi;

use super::{assert_unimplemented, MinimalApi};

#[tokio::test]
async fn terminal_defaults_return_unimplemented() {
    let api = MinimalApi;
    assert_unimplemented("terminal.list", api.terminal_list().await);
    assert_unimplemented("terminal.attach", api.terminal_attach().await);
    assert_unimplemented("terminal.write", api.terminal_write().await);
    assert_unimplemented("terminal.resize", api.terminal_resize().await);
}
