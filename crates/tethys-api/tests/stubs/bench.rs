use tethys_api::BenchApi;

use super::MinimalApi;

#[tokio::test]
async fn synthetic_diff_is_implemented_by_the_minimal_fixture() {
    let api = MinimalApi;
    let hunks = api
        .generate_synthetic_diff(0)
        .await
        .expect("minimal fixture implements generate_synthetic_diff");
    assert!(hunks.is_empty());
}
