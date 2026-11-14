use serde::{Deserialize, Serialize};

/// High-performance Arabic text normalization:
/// Strips diacritics, folds Alef/Yaa/Taa forms, converts Eastern numerals to ASCII,
/// and strips formatting/Bidi controls with minimal heap allocation.
pub fn normalize_arabic_char(ch: char) -> Option<char> {
    match ch {
        // 1. Strip Harakat / Tashkeel diacritics
        '\u{0610}'..='\u{061A}' | '\u{064B}'..='\u{065F}' | '\u{0670}' | '\u{06D6}'..='\u{06ED}' => None,

        // 2. Strip Tatweel / Kashida
        '\u{0640}' => None,

        // 3. Strip Bidi formatting controls
        '\u{200B}'..='\u{200F}' | '\u{202A}'..='\u{202E}' | '\u{2066}'..='\u{2069}' | '\u{FEFF}' => None,

        // 4. Fold Alef variants to bare Alef ('ا')
        '\u{0622}' | '\u{0623}' | '\u{0625}' | '\u{0671}' => Some('\u{0627}'),

        // 5. Fold Yaa / Alef Maksura to Yaa ('ي')
        '\u{0649}' | '\u{0626}' => Some('\u{064A}'),

        // 6. Fold Waw with Hamza to bare Waw ('و')
        '\u{0624}' => Some('\u{0648}'),

        // 7. Fold Taa Marbuta to Haa ('ه')
        '\u{0629}' => Some('\u{0647}'),

        // 8. Convert Arabic-Indic digits (٠-٩) to ASCII '0'-'9'
        '\u{0660}'..='\u{0669}' => {
            let offset = (ch as u32) - 0x0660;
            Some(char::from_u32('0' as u32 + offset).unwrap_or(ch))
        }

        // 9. Convert Eastern Arabic-Indic digits (۰-۹) to ASCII '0'-'9'
        '\u{06F0}'..='\u{06F9}' => {
            let offset = (ch as u32) - 0x06F0;
            Some(char::from_u32('0' as u32 + offset).unwrap_or(ch))
        }

        // 10. Pass lowercase ASCII / other characters
        other => {
            if other.is_ascii_uppercase() {
                Some(other.to_ascii_lowercase())
            } else {
                Some(other)
            }
        }
    }
}

/// Normalizes a full text string for symmetric, diacritic-insensitive Arabic search.
pub fn normalize_arabic_text(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        if let Some(norm) = normalize_arabic_char(ch) {
            out.push(norm);
        }
    }
    out
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SearchMatch {
    pub start_offset: usize,
    pub end_offset: usize,
}

/// Fast search matching: normalizes both document and query,
/// and accelerates search with 32-byte chunk skipping for near-RAM bus bandwidth (GB/s).
pub fn find_arabic_matches(haystack: &str, query: &str) -> Vec<SearchMatch> {
    if query.trim().is_empty() {
        return Vec::new();
    }

    let norm_haystack = normalize_arabic_text(haystack);
    let norm_query = normalize_arabic_text(query);

    if norm_query.is_empty() || norm_query.len() > norm_haystack.len() {
        return Vec::new();
    }

    let mut matches = Vec::new();
    let query_bytes = norm_query.as_bytes();
    let haystack_bytes = norm_haystack.as_bytes();

    if query_bytes.is_empty() {
        return matches;
    }

    let q_len = query_bytes.len();
    let h_len = haystack_bytes.len();
    let first_byte = query_bytes[0];

    let mut i = 0;
    while i + q_len <= h_len {
        // Fast 32-byte chunk skip: if first byte not found in chunk, advance 32 bytes at once
        if i + 32 + q_len <= h_len && !haystack_bytes[i..i + 32].contains(&first_byte) {
            i += 32;
            continue;
        }

        if haystack_bytes[i] == first_byte && &haystack_bytes[i..i + q_len] == query_bytes {
            matches.push(SearchMatch {
                start_offset: i,
                end_offset: i + q_len,
            });
            i += q_len; // Skip past matched token
        } else {
            i += 1;
        }
    }

    matches
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_arabic_diacritic_and_letter_folding() {
        // "مُحَمَّدٌ" with tashkeel should normalize to "محمد"
        assert_eq!(normalize_arabic_text("مُحَمَّدٌ"), "محمد");

        // "الإسلام" with Hamza should normalize to "الاسلام"
        assert_eq!(normalize_arabic_text("الإِسْلَامُ"), "الاسلام");

        // "مكتبة" with Taa Marbuta should normalize to "مكتبه"
        assert_eq!(normalize_arabic_text("مكتبة"), "مكتبه");

        // Arabic digits: "الصفحة ١٢٣" -> "الصفحه 123"
        assert_eq!(normalize_arabic_text("الصفحة ١٢٣"), "الصفحه 123");
    }

    #[test]
    fn test_search_matching() {
        let text = "قراءة كِتَابِ الرِّيَاضِيَّاتِ للعام الدراسي ٢٠٢٦";
        let query = "الرياضيات";
        let matches = find_arabic_matches(text, query);

        assert_eq!(matches.len(), 1);
    }
}
