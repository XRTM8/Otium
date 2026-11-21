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

#[derive(Clone, Copy)]
struct CharMapping {
    orig_start: usize,
    orig_end: usize,
}

fn normalize_arabic_text_with_map(input: &str) -> (String, Vec<CharMapping>) {
    let mut norm = String::with_capacity(input.len());
    let mut map = Vec::with_capacity(input.len());

    for (orig_start, ch) in input.char_indices() {
        let orig_end = orig_start + ch.len_utf8();
        if let Some(norm_ch) = normalize_arabic_char(ch) {
            let mut buf = [0u8; 4];
            let norm_bytes = norm_ch.encode_utf8(&mut buf).as_bytes();
            for _ in 0..norm_bytes.len() {
                map.push(CharMapping { orig_start, orig_end });
            }
            norm.push(norm_ch);
        }
    }

    (norm, map)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SearchMatch {
    pub start_offset: usize,
    pub end_offset: usize,
}

/// Fast search matching: normalizes both document and query,
/// accurately maps match offsets back to the raw original text with diacritics,
/// and accelerates search with 32-byte chunk skipping.
pub fn find_arabic_matches(haystack: &str, query: &str) -> Vec<SearchMatch> {
    if query.trim().is_empty() {
        return Vec::new();
    }

    let (norm_haystack, byte_map) = normalize_arabic_text_with_map(haystack);
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
            let orig_start = byte_map[i].orig_start;
            let mut orig_end = byte_map[i + q_len - 1].orig_end;

            // Include any immediately following stripped diacritics / formatting
            for ch in haystack[orig_end..].chars() {
                if normalize_arabic_char(ch).is_none() {
                    orig_end += ch.len_utf8();
                } else {
                    break;
                }
            }

            matches.push(SearchMatch {
                start_offset: orig_start,
                end_offset: orig_end,
            });
            i += q_len; // Skip past matched token
        } else {
            i += 1;
        }
    }

    matches
}

/// Lightweight Arabic morphological stemmer:
/// Normalizes common prefixes (الـ، والـ، بالـ، كالـ، فالـ، للـ) and suffixes
/// (ـها، ـان، ـين، ـون، ـات، ـهم، ـهن، ـكم، ـنا، ـه، ـي)
/// while enforcing a minimum stem length of 3 characters to protect short Arabic roots.
pub fn arabic_light_stem(word: &str) -> String {
    let norm = normalize_arabic_text(word);
    let mut chars: Vec<char> = norm.chars().collect();

    // 1. Strip common prefixes if stem remains >= 3 characters
    if chars.len() >= 6 && (chars.starts_with(&['و', 'ا', 'ل']) || chars.starts_with(&['ف', 'ا', 'ل'])) {
        chars.drain(0..3);
    } else if chars.len() >= 6 && (chars.starts_with(&['ب', 'ا', 'ل']) || chars.starts_with(&['ك', 'ا', 'ل'])) {
        chars.drain(0..3);
    } else if chars.len() >= 5 && (chars.starts_with(&['ا', 'ل']) || chars.starts_with(&['ل', 'ل'])) {
        chars.drain(0..2);
    } else if chars.len() >= 4 && (chars[0] == 'و' || chars[0] == 'ف') {
        chars.remove(0);
    }

    // 2. Strip common suffixes if stem remains >= 3 characters
    if chars.len() >= 5 && (chars.ends_with(&['ه', 'م', 'ا']) || chars.ends_with(&['ت', 'م', 'ا'])) {
        chars.truncate(chars.len() - 3);
    } else if chars.len() >= 5
        && (chars.ends_with(&['ه', 'م'])
            || chars.ends_with(&['ه', 'ن'])
            || chars.ends_with(&['ك', 'م'])
            || chars.ends_with(&['ك', 'ن'])
            || chars.ends_with(&['ن', 'ا'])
            || chars.ends_with(&['ه', 'ا'])
            || chars.ends_with(&['ا', 'ن'])
            || chars.ends_with(&['ي', 'ن'])
            || chars.ends_with(&['و', 'ن'])
            || chars.ends_with(&['ا', 'ت']))
    {
        chars.truncate(chars.len() - 2);
    } else if chars.len() >= 4 && (chars.ends_with(&['ه']) || chars.ends_with(&['ي']) || chars.ends_with(&['ك'])) {
        chars.truncate(chars.len() - 1);
    }

    chars.into_iter().collect()
}

/// Flexible Arabic morphological search:
/// Matches words in `haystack` that share the query's light stem (e.g. searching "كتاب"
/// matches "الكِتَابُ", "بالكتاب", "وكتابهم"), returning exact byte offsets into the raw document.
pub fn find_arabic_stemmed_matches(haystack: &str, query: &str) -> Vec<SearchMatch> {
    let query_stem = arabic_light_stem(query);
    if query_stem.is_empty() {
        return Vec::new();
    }

    let mut matches = Vec::new();
    let mut word_start = None;

    for (byte_idx, ch) in haystack.char_indices() {
        if ch.is_whitespace() || ch.is_ascii_punctuation() || "،؛؟«»()[]{}—–.-".contains(ch) {
            if let Some(start) = word_start {
                let word = &haystack[start..byte_idx];
                if arabic_light_stem(word) == query_stem {
                    matches.push(SearchMatch {
                        start_offset: start,
                        end_offset: byte_idx,
                    });
                }
                word_start = None;
            }
        } else if word_start.is_none() {
            word_start = Some(byte_idx);
        }
    }

    if let Some(start) = word_start {
        let word = &haystack[start..];
        if arabic_light_stem(word) == query_stem {
            matches.push(SearchMatch {
                start_offset: start,
                end_offset: haystack.len(),
            });
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
        let m = &matches[0];
        // Slicing text directly by offsets must not panic on char boundary and must contain the word
        assert_eq!(&text[m.start_offset..m.end_offset], "الرِّيَاضِيَّاتِ");
    }

    #[test]
    fn test_search_matching_diacritics_and_tatweel_offsets() {
        let text = "هذا كِـــتَـــابٌ مُـفِـيـدٌ جداً";
        let query = "كتاب";
        let matches = find_arabic_matches(text, query);

        assert_eq!(matches.len(), 1);
        let m = &matches[0];
        assert_eq!(&text[m.start_offset..m.end_offset], "كِـــتَـــابٌ");
    }

    #[test]
    fn test_arabic_light_stemming() {
        // Prefixes
        assert_eq!(arabic_light_stem("الكتاب"), "كتاب");
        assert_eq!(arabic_light_stem("والكتاب"), "كتاب");
        assert_eq!(arabic_light_stem("بالكتاب"), "كتاب");
        assert_eq!(arabic_light_stem("للكتاب"), "كتاب");

        // Suffixes
        assert_eq!(arabic_light_stem("كتابهم"), "كتاب");
        assert_eq!(arabic_light_stem("كتابها"), "كتاب");
        assert_eq!(arabic_light_stem("معلمون"), "معلم");
        assert_eq!(arabic_light_stem("مكتبات"), "مكتب");

        // Short roots preserved without over-stemming
        assert_eq!(arabic_light_stem("علي"), "علي");
        assert_eq!(arabic_light_stem("أب"), "اب");
        assert_eq!(arabic_light_stem("يد"), "يد");
    }

    #[test]
    fn test_find_arabic_stemmed_matches() {
        let text = "اشتريت الكِتَابَ الجديد وقرأت في كِتَابِهِم المفيد";
        let query = "كتاب";
        let matches = find_arabic_stemmed_matches(text, query);

        assert_eq!(matches.len(), 2);
        assert_eq!(&text[matches[0].start_offset..matches[0].end_offset], "الكِتَابَ");
        assert_eq!(&text[matches[1].start_offset..matches[1].end_offset], "كِتَابِهِم");
    }
}
