//! Search keys: what a typed query and a title are compared on, so "brutal"
//! finds "Brütal Legend" and "call of duty modern warfare" finds
//! "Call of Duty®: Modern Warfare®".

/// One character with its accent removed (Latin-1 and common ligatures).
pub fn fold(ch: char) -> Vec<char> {
    let base = match ch {
        'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' | 'À' | 'Á' | 'Â' | 'Ã' | 'Ä' | 'Å' => 'a',
        'ç' | 'Ç' => 'c',
        'è' | 'é' | 'ê' | 'ë' | 'È' | 'É' | 'Ê' | 'Ë' => 'e',
        'ì' | 'í' | 'î' | 'ï' | 'Ì' | 'Í' | 'Î' | 'Ï' => 'i',
        'ñ' | 'Ñ' => 'n',
        'ò' | 'ó' | 'ô' | 'õ' | 'ö' | 'ø' | 'Ò' | 'Ó' | 'Ô' | 'Õ' | 'Ö' | 'Ø' => 'o',
        'ù' | 'ú' | 'û' | 'ü' | 'Ù' | 'Ú' | 'Û' | 'Ü' => 'u',
        'ý' | 'ÿ' | 'Ý' => 'y',
        'ß' => return vec!['s', 's'],
        'æ' | 'Æ' => return vec!['a', 'e'],
        '&' => return vec![' ', 'a', 'n', 'd', ' '],
        other => other,
    };
    vec![base]
}

/// Lowercase, accents folded, symbols and punctuation as spaces, single
/// spaces. O(n).
pub fn search_key(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut space = true;
    for ch in text.chars().flat_map(fold) {
        if ch.is_alphanumeric() {
            out.extend(ch.to_lowercase());
            space = false;
        } else if !space {
            out.push(' ');
            space = true;
        }
    }
    if out.ends_with(' ') {
        out.pop();
    }
    out
}

/// Whether `title` matches a typed search. An empty query matches all.
pub fn matches(title: &str, query: &str) -> bool {
    let query = search_key(query);
    query.is_empty() || search_key(title).contains(&query)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_letters_find_accented_titles() {
        // Regression: "Brutal Legend" found nothing; the title is "Brütal Legend".
        assert!(matches("Brütal Legend", "Brutal Legend"));
        assert!(matches("Brütal Legend", "brutal"));
        assert!(matches("Pokémon Café Mix", "pokemon cafe"));
    }

    #[test]
    fn symbols_and_punctuation_do_not_block_a_match() {
        assert!(matches(
            "Call of Duty®: Modern Warfare® III",
            "call of duty modern warfare"
        ));
        assert!(matches(
            "Halo: The Master Chief Collection",
            "halo the master"
        ));
        assert!(matches("Ratchet & Clank", "ratchet and clank"));
        assert!(!matches("Halo Infinite", "forza"));
        assert!(matches("Anything", "   "));
    }
}
