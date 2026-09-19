//! Hunk computation, patch rendering, and the small hunk cache.
//!
//! Hunks come from `imara-diff`'s Histogram algorithm; rendering emits the
//! subset of git-patch syntax that `git apply -R` accepts, including
//! `\ No newline at end of file` markers.

use std::collections::{HashMap, VecDeque};

use imara_diff::{Algorithm, Diff, InternedInput};
use tethys_schema::{DiffFileStatus, DiffHunk, DiffLine, DiffLineKind};

const CONTEXT_LINES: u32 = 3;
const CACHE_CAPACITY: usize = 256;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum PlanLine {
    Context { old: u32, new: u32 },
    Remove { old: u32 },
    Add { new: u32 },
}

/// A grouped hunk: display shape plus the token plan needed to render a patch.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ComputedHunk {
    pub old_start: u32,
    pub old_count: u32,
    pub new_start: u32,
    pub new_count: u32,
    pub plan: Vec<PlanLine>,
}

/// Splits text into diff tokens (lines keep their terminating newline).
pub(crate) fn line_tokens(text: &str) -> Vec<&str> {
    if text.is_empty() {
        Vec::new()
    } else {
        text.split_inclusive('\n').collect()
    }
}

/// True when content should never be diffed as text.
pub(crate) fn looks_binary(bytes: &[u8]) -> bool {
    bytes.iter().take(8192).any(|byte| *byte == 0)
}

/// Computes grouped hunks between two texts.
pub(crate) fn compute(old: &str, new: &str) -> Vec<ComputedHunk> {
    let input = InternedInput::new(old, new);
    let mut diff = Diff::compute(Algorithm::Histogram, &input);
    diff.postprocess_lines(&input);
    let raw: Vec<imara_diff::Hunk> = diff.hunks().collect();
    group_hunks(&raw, input.before.len() as u32, input.after.len() as u32)
}

fn group_hunks(raw: &[imara_diff::Hunk], old_len: u32, new_len: u32) -> Vec<ComputedHunk> {
    let mut groups: Vec<Vec<imara_diff::Hunk>> = Vec::new();
    for hunk in raw {
        let merges = groups
            .last()
            .and_then(|group| group.last())
            .is_some_and(|previous| {
                hunk.before.start <= previous.before.end.saturating_add(2 * CONTEXT_LINES)
            });
        if merges {
            if let Some(group) = groups.last_mut() {
                group.push(hunk.clone());
            }
        } else {
            groups.push(vec![hunk.clone()]);
        }
    }

    groups
        .into_iter()
        .map(|group| {
            let first = group.first().cloned().unwrap_or_default();
            let last = group.last().cloned().unwrap_or_default();
            let old_lo = first.before.start.saturating_sub(CONTEXT_LINES);
            let old_hi = last.before.end.saturating_add(CONTEXT_LINES).min(old_len);
            let new_lo = first.after.start.saturating_sub(CONTEXT_LINES);
            let new_hi = last.after.end.saturating_add(CONTEXT_LINES).min(new_len);

            let mut plan = Vec::new();
            let (mut old_cursor, mut new_cursor) = (old_lo, new_lo);
            for hunk in &group {
                while old_cursor < hunk.before.start {
                    plan.push(PlanLine::Context {
                        old: old_cursor,
                        new: new_cursor,
                    });
                    old_cursor += 1;
                    new_cursor += 1;
                }
                for old in hunk.before.clone() {
                    plan.push(PlanLine::Remove { old });
                }
                for new in hunk.after.clone() {
                    plan.push(PlanLine::Add { new });
                }
                old_cursor = hunk.before.end;
                new_cursor = hunk.after.end;
            }
            while old_cursor < old_hi {
                plan.push(PlanLine::Context {
                    old: old_cursor,
                    new: new_cursor,
                });
                old_cursor += 1;
                new_cursor += 1;
            }

            ComputedHunk {
                old_start: old_lo + 1,
                old_count: old_hi - old_lo,
                new_start: new_lo + 1,
                new_count: new_hi - new_lo,
                plan,
            }
        })
        .collect()
}

/// Converts a computed hunk into the wire shape used by the UI.
pub(crate) fn to_display(hunk: &ComputedHunk, old: &[&str], new: &[&str]) -> DiffHunk {
    let lines = hunk
        .plan
        .iter()
        .map(|line| match *line {
            PlanLine::Context { old: old_index, .. } => DiffLine {
                kind: DiffLineKind::Context,
                text: strip_newline(old, old_index),
            },
            PlanLine::Remove { old: old_index } => DiffLine {
                kind: DiffLineKind::Deletion,
                text: strip_newline(old, old_index),
            },
            PlanLine::Add { new: new_index } => DiffLine {
                kind: DiffLineKind::Addition,
                text: strip_newline(new, new_index),
            },
        })
        .collect();
    DiffHunk {
        old_start: hunk.old_start,
        old_lines: hunk.old_count,
        new_start: hunk.new_start,
        new_lines: hunk.new_count,
        lines,
    }
}

fn strip_newline(tokens: &[&str], index: u32) -> String {
    tokens
        .get(index as usize)
        .copied()
        .unwrap_or("")
        .strip_suffix('\n')
        .map(|line| line.strip_suffix('\r').unwrap_or(line))
        .unwrap_or_default()
        .to_string()
}

/// Renders a git patch containing only `selected` hunks.
pub(crate) fn render_patch(
    path: &str,
    status: DiffFileStatus,
    old_mode: &str,
    new_mode: &str,
    old: &[&str],
    new: &[&str],
    hunks: &[&ComputedHunk],
) -> String {
    let mut patch = String::new();
    let quoted = path_for_header("a", path);
    let quoted_b = path_for_header("b", path);
    patch.push_str(&format!("diff --git {quoted} {quoted_b}\n"));
    match status {
        DiffFileStatus::Added => patch.push_str(&format!("new file mode {new_mode}\n")),
        DiffFileStatus::Deleted => patch.push_str(&format!("deleted file mode {old_mode}\n")),
        _ => {}
    }
    match status {
        DiffFileStatus::Added => patch.push_str("--- /dev/null\n"),
        _ => patch.push_str(&format!("--- {quoted}\n")),
    }
    match status {
        DiffFileStatus::Deleted => patch.push_str("+++ /dev/null\n"),
        _ => patch.push_str(&format!("+++ {quoted_b}\n")),
    }
    for hunk in hunks {
        patch.push_str(&format!(
            "@@ -{},{} +{},{} @@\n",
            hunk.old_start, hunk.old_count, hunk.new_start, hunk.new_count
        ));
        for line in &hunk.plan {
            match *line {
                PlanLine::Context { old: old_index, .. } => {
                    push_patch_line(&mut patch, ' ', token(old, old_index))
                }
                PlanLine::Remove { old: old_index } => {
                    push_patch_line(&mut patch, '-', token(old, old_index))
                }
                PlanLine::Add { new: new_index } => {
                    push_patch_line(&mut patch, '+', token(new, new_index))
                }
            }
        }
    }
    patch
}

fn token<'a>(tokens: &[&'a str], index: u32) -> &'a str {
    tokens.get(index as usize).copied().unwrap_or("")
}

fn push_patch_line(patch: &mut String, prefix: char, token: &str) {
    patch.push(prefix);
    patch.push_str(token);
    if !token.ends_with('\n') {
        patch.push('\n');
        patch.push_str("\\ No newline at end of file\n");
    }
}

fn path_for_header(prefix: &str, path: &str) -> String {
    let full = format!("{prefix}/{path}");
    if full.bytes().all(|byte| (0x21..=0x7e).contains(&byte)) {
        return full;
    }
    let mut quoted = String::from("\"");
    for byte in full.bytes() {
        match byte {
            b'"' => quoted.push_str("\\\""),
            b'\\' => quoted.push_str("\\\\"),
            0x20..=0x7e => quoted.push(byte as char),
            _ => quoted.push_str(&format!("\\{byte:03o}")),
        }
    }
    quoted.push('"');
    quoted
}

/// Bounded in-memory cache of computed hunks keyed by blob pair.
#[derive(Debug)]
pub(crate) struct DiffCache {
    entries: HashMap<String, Vec<ComputedHunk>>,
    order: VecDeque<String>,
    capacity: usize,
}

impl Default for DiffCache {
    fn default() -> Self {
        Self {
            entries: HashMap::new(),
            order: VecDeque::new(),
            capacity: CACHE_CAPACITY,
        }
    }
}

impl DiffCache {
    pub(crate) fn key(old_oid: &str, new_oid: &str) -> String {
        blake3::hash(format!("{old_oid}:{new_oid}").as_bytes())
            .to_hex()
            .to_string()
    }

    pub(crate) fn get(&self, key: &str) -> Option<Vec<ComputedHunk>> {
        self.entries.get(key).cloned()
    }

    pub(crate) fn insert(&mut self, key: String, hunks: Vec<ComputedHunk>) {
        if self.entries.contains_key(&key) {
            return;
        }
        if self.entries.len() >= self.capacity {
            if let Some(oldest) = self.order.pop_front() {
                self.entries.remove(&oldest);
            }
        }
        self.order.push_back(key.clone());
        self.entries.insert(key, hunks);
    }
}
