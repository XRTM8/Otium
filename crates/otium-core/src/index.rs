use std::collections::HashMap;
use crate::search::{normalize_arabic_text, SearchMatch};

/// Compact, lightning-fast trigram inverted index for sub-millisecond document search.
/// Eliminates repeated linear string scanning across multi-megabyte texts on every search keystroke.
pub struct ArabicTrigramIndex {
    /// Normalized full text
    normalized_text: String,
    /// Cached normalized characters (eliminates per-search `.chars().collect()` heap allocations)
    text_chars: Vec<char>,
    /// Precomputed byte offset for each char index (`len == char_count + 1`) for O(1) match slicing
    char_byte_offsets: Vec<usize>,
    /// Maps 3-char unicode trigram hashes to sorted list of char offsets
    postings: HashMap<u32, Vec<u32>>,
    /// Total character count in `normalized_text`
    char_count: usize,
}

impl ArabicTrigramIndex {
    /// Compute a fast 32-bit hash of 3 normalized characters
    #[inline(always)]
    fn trigram_hash(c1: char, c2: char, c3: char) -> u32 {
        let h1 = c1 as u32;
        let h2 = c2 as u32;
        let h3 = c3 as u32;
        h1.wrapping_mul(31).wrapping_add(h2).wrapping_mul(31).wrapping_add(h3)
    }

    /// Build an index from a raw Arabic or multilingual document string
    pub fn build(raw_text: &str) -> Self {
        let normalized_text = normalize_arabic_text(raw_text);
        let approx_chars = normalized_text.len();
        let mut text_chars = Vec::with_capacity(approx_chars);
        let mut char_byte_offsets = Vec::with_capacity(approx_chars + 1);
        for (byte_idx, ch) in normalized_text.char_indices() {
            text_chars.push(ch);
            char_byte_offsets.push(byte_idx);
        }
        char_byte_offsets.push(normalized_text.len());
        let char_count = text_chars.len();

        let mut postings: HashMap<u32, Vec<u32>> = HashMap::new();

        if char_count >= 3 {
            for i in 0..char_count - 2 {
                let hash = Self::trigram_hash(text_chars[i], text_chars[i + 1], text_chars[i + 2]);
                postings.entry(hash).or_default().push(i as u32);
            }
        }

        Self {
            normalized_text,
            text_chars,
            char_byte_offsets,
            postings,
            char_count,
        }
    }

    /// Searches the index with O(1) byte offset lookup and zero normalized-text re-allocation.
    pub fn search(&self, query: &str) -> Vec<SearchMatch> {
        let norm_query = normalize_arabic_text(query);
        let q_chars: Vec<char> = norm_query.chars().collect();

        if q_chars.is_empty() || q_chars.len() > self.char_count {
            return Vec::new();
        }

        // 1. Fallback for short 1-2 character queries: direct substring scan on normalized text
        if q_chars.len() < 3 {
            let mut matches = Vec::new();
            for (idx, _) in self.normalized_text.match_indices(&norm_query) {
                matches.push(SearchMatch {
                    start_offset: idx,
                    end_offset: idx + norm_query.len(),
                });
            }
            return matches;
        }

        // 2. Trigram intersection for queries >= 3 characters
        let first_hash = Self::trigram_hash(q_chars[0], q_chars[1], q_chars[2]);
        let Some(candidates) = self.postings.get(&first_hash) else {
            return Vec::new();
        };

        let mut results = Vec::new();
        let q_len = q_chars.len();

        for &start_idx in candidates {
            let start = start_idx as usize;
            let end = start + q_len;
            if end <= self.char_count && self.text_chars[start + 3..end] == q_chars[3..] {
                results.push(SearchMatch {
                    start_offset: self.char_byte_offsets[start],
                    end_offset: self.char_byte_offsets[end],
                });
            }
        }

        results
    }

    /// Total number of indexed characters
    pub fn len(&self) -> usize {
        self.char_count
    }

    /// Check if index is empty
    pub fn is_empty(&self) -> bool {
        self.char_count == 0
    }
}

/// Bounded LRU cache of per-page `ArabicTrigramIndex` tables for instant multi-page search.
#[derive(Default)]
pub struct PageSearchCache {
    entries: std::sync::Mutex<Vec<(String, Vec<ArabicTrigramIndex>)>>,
}

impl PageSearchCache {
    /// Looks up cached per-page indices for `doc_key` or builds them when `pages` is supplied.
    /// Returns 1-based page numbers matching `query`, or `Err("MISS")` if not cached yet.
    pub fn search_or_build(
        &self,
        doc_key: String,
        pages: Option<Vec<String>>,
        query: &str,
    ) -> std::result::Result<Vec<usize>, String> {
        let mut guard = self.entries.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(pos) = guard.iter().position(|(key, _)| key == &doc_key) {
            let entry = guard.remove(pos);
            let matches = entry
                .1
                .iter()
                .enumerate()
                .filter_map(|(idx, idxer)| (!idxer.search(query).is_empty()).then_some(idx + 1))
                .collect();
            guard.push(entry);
            return Ok(matches);
        }

        let Some(page_texts) = pages else {
            return Err("MISS".into());
        };

        let indices: Vec<ArabicTrigramIndex> = page_texts
            .iter()
            .map(|txt| ArabicTrigramIndex::build(txt))
            .collect();
        let matches = indices
            .iter()
            .enumerate()
            .filter_map(|(idx, idxer)| (!idxer.search(query).is_empty()).then_some(idx + 1))
            .collect();
        if guard.len() >= 3 {
            guard.remove(0);
        }
        guard.push((doc_key, indices));
        Ok(matches)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_arabic_trigram_search() {
        let text = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ. الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ.";
        let index = ArabicTrigramIndex::build(text);

        // Search with diacritics stripped
        let matches = index.search("الرحمن");
        assert_eq!(matches.len(), 1);

        // Search with different Alef form
        let matches2 = index.search("الحمد");
        assert_eq!(matches2.len(), 1);

        // Substring that doesn't exist
        let matches3 = index.search("فيكتوريا");
        assert_eq!(matches3.len(), 0);
    }

    #[test]
    fn test_short_query_fallback() {
        let text = "كتب الطالب الدرس في الكتاب";
        let index = ArabicTrigramIndex::build(text);

        // 2-character query
        let matches = index.search("في");
        assert_eq!(matches.len(), 1);
    }

    #[test]
    fn test_page_search_cache_handles_misses_and_arabic_normalization() {
        let cache = PageSearchCache::default();
        let miss = cache.search_or_build("doc-1".into(), None, "السلام");
        assert_eq!(miss.unwrap_err(), "MISS");

        let pages = vec![
            "المقدمة العامة".to_string(),
            "بِسْمِ اللَّهِ الرَّحْمَنِ".to_string(),
            "أحكام القراءة والكتابة".to_string(),
        ];
        let first = cache
            .search_or_build("doc-1".into(), Some(pages), "الرحمن")
            .expect("initial indexed search");
        assert_eq!(first, vec![2]);

        let cached_followup = cache
            .search_or_build("doc-1".into(), None, "احكام")
            .expect("cached trigram search");
        assert_eq!(cached_followup, vec![3]);
    }
}
