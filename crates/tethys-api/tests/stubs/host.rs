use tethys_api::HostApi;

use super::{assert_unimplemented, MinimalApi};

#[tokio::test]
async fn host_pair_default_returns_unimplemented() {
    let api = MinimalApi;
    assert_unimplemented("host.pair", api.host_pair().await);
}
