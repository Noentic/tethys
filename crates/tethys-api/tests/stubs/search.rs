use tethys_api::SearchApi;

use super::MinimalApi;

#[tokio::test]
async fn search_files_is_implemented_by_the_minimal_fixture() {
    let api = MinimalApi;
    let hits = api
        .search_files("w1".into(), "query".into(), 10)
        .await
        .expect("minimal fixture implements search_files");
    assert!(hits.is_empty());
}
