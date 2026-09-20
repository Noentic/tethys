use std::fs;
use std::io::Read;
use tethys_store::{BlobStore, StoreError};

#[test]
fn put_blob_and_retrieve_with_hash_verification() -> Result<(), Box<dyn std::error::Error>> {
    let dir = tempfile::tempdir()?;
    let store = BlobStore::new(dir.path())?;

    let data = b"The quick brown fox jumps over the lazy dog";
    let hash = store.put(data)?;

    assert!(store.has(&hash));

    let retrieved = store.get(&hash)?.expect("blob must exist");
    assert_eq!(retrieved, data);

    // Fast serve path: open returns file handle directly
    let mut file = store.open(&hash)?.expect("file exists");
    let mut read_bytes = Vec::new();
    file.read_to_end(&mut read_bytes)?;
    assert_eq!(read_bytes, data);

    Ok(())
}

#[test]
fn deduplication_avoids_redundant_writes() -> Result<(), Box<dyn std::error::Error>> {
    let dir = tempfile::tempdir()?;
    let store = BlobStore::new(dir.path())?;

    let data = b"identical content for deduplication test";
    let hash1 = store.put(data)?;
    let path = store.path(&hash1).expect("path must exist");

    let mtime1 = fs::metadata(&path)?.modified()?;

    // Second put of identical bytes
    let hash2 = store.put(data)?;
    assert_eq!(hash1, hash2);

    let mtime2 = fs::metadata(&path)?.modified()?;
    assert_eq!(mtime1, mtime2, "File metadata should not change on dedupe");

    Ok(())
}

#[test]
fn corrupted_blob_detected_on_get() -> Result<(), Box<dyn std::error::Error>> {
    let dir = tempfile::tempdir()?;
    let store = BlobStore::new(dir.path())?;

    let data = b"important uncorrupted data";
    let hash = store.put(data)?;
    let path = store.path(&hash).expect("path exists");

    // Corrupt one byte on disk
    let mut corrupted = data.to_vec();
    corrupted[0] ^= 0xFF;
    fs::write(&path, &corrupted)?;

    let result = store.get(&hash);
    match result {
        Err(StoreError::BlobHashMismatch { expected, found }) => {
            assert_eq!(expected, hash.as_str());
            assert_ne!(found, hash.as_str());
        }
        other => panic!("Expected BlobHashMismatch error, got {other:?}"),
    }

    Ok(())
}

#[test]
fn temp_files_cleaned_up() -> Result<(), Box<dyn std::error::Error>> {
    let dir = tempfile::tempdir()?;
    let store = BlobStore::new(dir.path())?;

    let data = b"some data payload";
    let hash = store.put(data)?;

    let shard = &hash.as_str()[..2];
    let shard_dir = dir.path().join("blobs").join(shard);

    let mut temp_files_count = 0;
    for entry in fs::read_dir(&shard_dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with(".tmp") || name.contains("temp") {
            temp_files_count += 1;
        }
    }

    assert_eq!(
        temp_files_count, 0,
        "No temp files should remain in shard dir"
    );

    Ok(())
}

#[tokio::test]
async fn concurrent_puts_of_same_bytes_both_succeed() -> Result<(), Box<dyn std::error::Error>> {
    let dir = tempfile::tempdir()?;
    let store = BlobStore::new(dir.path())?;

    let data = b"concurrent write race condition test";

    let store1 = store.clone();
    let store2 = store.clone();

    let task1 = tokio::spawn(async move { store1.put(data) });
    let task2 = tokio::spawn(async move { store2.put(data) });

    let (res1, res2) = tokio::join!(task1, task2);
    let hash1 = res1??;
    let hash2 = res2??;

    assert_eq!(hash1, hash2);
    assert!(store.has(&hash1));

    Ok(())
}
