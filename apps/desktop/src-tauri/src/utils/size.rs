use std::fs;
use std::path::Path;

/// Best-effort install size in bytes for a file or directory.
pub fn path_size_bytes(path: &Path) -> Option<i64> {
    if !path.exists() {
        return None;
    }

    if path.is_file() {
        return fs::metadata(path).ok().map(|meta| meta.len() as i64);
    }

    let mut total: u64 = 0;
    let mut stack = vec![path.to_path_buf()];
    let mut visited = 0usize;

    while let Some(current) = stack.pop() {
        visited += 1;
        // Cap walk for huge trees so import stays responsive.
        if visited > 50_000 {
            break;
        }
        let entries = match fs::read_dir(&current) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let entry_path = entry.path();
            let Ok(meta) = entry.metadata() else {
                continue;
            };
            if meta.is_dir() {
                stack.push(entry_path);
            } else {
                total = total.saturating_add(meta.len());
            }
        }
    }

    Some(total as i64)
}
