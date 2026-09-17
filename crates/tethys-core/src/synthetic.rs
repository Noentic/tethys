use tethys_schema::{DiffHunk, DiffLine, DiffLineKind, StreamChunk};
use std::time::{SystemTime, UNIX_EPOCH};

/// Generates a synthetic git-patch diff with the given line count (e.g. 20,000 lines).
pub fn generate_synthetic_diff(total_lines: usize) -> Vec<DiffHunk> {
    let lines_per_hunk = 100;
    let mut hunks = Vec::new();
    let mut current_line = 1;

    while current_line <= total_lines {
        let hunk_size = (total_lines - current_line + 1).min(lines_per_hunk);
        let mut lines = Vec::with_capacity(hunk_size);

        for i in 0..hunk_size {
            let line_num = current_line + i;
            let kind = match line_num % 5 {
                0 => DiffLineKind::Addition,
                1 => DiffLineKind::Deletion,
                _ => DiffLineKind::Context,
            };
            let prefix = match kind {
                DiffLineKind::Addition => "+ ",
                DiffLineKind::Deletion => "- ",
                DiffLineKind::Context => "  ",
            };
            lines.push(DiffLine {
                kind,
                text: format!("{prefix}const line_{line_num} = calculate_value({line_num}, \"synthetic-patch-data\");"),
            });
        }

        hunks.push(DiffHunk {
            old_start: current_line as u32,
            old_lines: hunk_size as u32,
            new_start: current_line as u32,
            new_lines: hunk_size as u32,
            lines,
        });

        current_line += hunk_size;
    }

    hunks
}

/// Generates a sequence of stream chunks simulating 8 concurrent agent streams.
pub fn generate_stream_chunks(
    stream_id: u32,
    count: u32,
    payload_size: usize,
) -> Vec<StreamChunk> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs_f64() * 1000.0;

    let sample_payload = "A".repeat(payload_size.max(1));

    (0..count)
        .map(|seq| StreamChunk {
            stream_id,
            seq,
            timestamp_ms: now,
            payload: sample_payload.clone(),
        })
        .collect()
}
