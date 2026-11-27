//! Release notes from GitHub (Orbit and Orbit Wine updates) are untrusted:
//! shown as plain text, without control characters, and bounded.

const MAX_CHARS: usize = 6_000;

/// Notes safe to show as text: no control characters but line breaks and
/// tabs, Unix line endings, trimmed, at most `MAX_CHARS` characters. O(n).
pub fn plain_text(body: Option<&str>) -> String {
    let clean: String = body
        .unwrap_or_default()
        .replace("\r\n", "\n")
        .chars()
        .filter(|c| !c.is_control() || *c == '\n' || *c == '\t')
        .collect();
    let clean = clean.trim();
    match clean.char_indices().nth(MAX_CHARS) {
        Some((cut, _)) => format!("{}…", clean[..cut].trim_end()),
        None => clean.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn release_notes_are_plain_bounded_text() {
        assert_eq!(plain_text(None), "");
        assert_eq!(plain_text(Some("  a\u{0}b\u{1b}[31m\tc \r\nd\n")), "ab[31m\tc \nd");
        let long = "é".repeat(MAX_CHARS + 10);
        let cut = plain_text(Some(&long));
        assert_eq!(cut.chars().count(), MAX_CHARS + 1);
        assert!(cut.ends_with('…'));
    }
}
