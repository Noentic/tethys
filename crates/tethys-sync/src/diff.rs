//! Unified diff rendering for previews and skill updates.

use imara_diff::{Algorithm, BasicLineDiffPrinter, Diff, InternedInput, UnifiedDiffConfig};

/// Renders a unified diff between two texts (empty when identical).
pub fn unified_diff(before: &str, after: &str) -> String {
    if before == after {
        return String::new();
    }
    let input = InternedInput::new(before, after);
    let mut diff = Diff::compute(Algorithm::Histogram, &input);
    diff.postprocess_lines(&input);
    diff.unified_diff(
        &BasicLineDiffPrinter(&input.interner),
        UnifiedDiffConfig::default(),
        &input,
    )
    .to_string()
}
