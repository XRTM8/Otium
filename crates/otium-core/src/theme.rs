use serde::{Deserialize, Serialize};

/// Otium's 4 refined functional themes designed for distraction-free reading.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum ThemeMode {
    /// Pure deep black (#000000) for OLED battery preservation and dark environments.
    #[default]
    #[serde(alias = "obsidian", alias = "midnight-azure", alias = "amoled")]
    OledBlack,
    /// Warm cozy sepia amber (#18130E) for night reading without blue light.
    #[serde(alias = "warm-amber", alias = "amber", alias = "pure-amethyst", alias = "ruby-crimson")]
    WarmSepia,
    /// Authentic natural tactile paper texture (#F7F4EE background / #1E1C19 ink) for daytime.
    #[serde(alias = "natural-paper", alias = "paper", alias = "pure")]
    DayPaper,
    /// High-contrast monochromatic paper (#ECECEC / #0F0F0F) mirroring E-Ink displays.
    #[serde(alias = "e-ink", alias = "eink", alias = "crystal-diamond")]
    EInkMono,
}

/// AOT Pre-Baked Static Theme Palette in `.rdata` (0.00ns initialization, 0 heap allocations)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StaticThemePalette {
    pub id: ThemeMode,
    pub name: &'static str,
    pub name_ar: &'static str,
    pub bg_canvas: &'static str,
    pub bg_surface: &'static str,
    pub bg_card: &'static str,
    pub text_primary: &'static str,
    pub text_secondary: &'static str,
    pub text_muted: &'static str,
    pub border: &'static str,
    pub accent: &'static str,
    pub spine_divider: &'static str,
    pub is_dark: bool,
}

pub const PALETTE_OLED_BLACK: StaticThemePalette = StaticThemePalette {
    id: ThemeMode::OledBlack,
    name: "Black",
    name_ar: "أسود",
    bg_canvas: "#000000",
    bg_surface: "#0A0A0C",
    bg_card: "#141418",
    text_primary: "#EDEDED",
    text_secondary: "#A1A1A1",
    text_muted: "#666666",
    border: "#202026",
    accent: "#10B981",
    spine_divider: "#121216",
    is_dark: true,
};

pub const PALETTE_WARM_SEPIA: StaticThemePalette = StaticThemePalette {
    id: ThemeMode::WarmSepia,
    name: "Amber",
    name_ar: "كهرماني",
    bg_canvas: "#18130E",
    bg_surface: "#221B14",
    bg_card: "#2E241B",
    text_primary: "#FDE68A",
    text_secondary: "#D97706",
    text_muted: "#92400E",
    border: "#3D3024",
    accent: "#F59E0B",
    spine_divider: "#261D15",
    is_dark: true,
};

pub const PALETTE_DAY_PAPER: StaticThemePalette = StaticThemePalette {
    id: ThemeMode::DayPaper,
    name: "Paper",
    name_ar: "ورقي",
    bg_canvas: "#F7F4EE",
    bg_surface: "#EFEAE0",
    bg_card: "#E5DFD3",
    text_primary: "#1E1C19",
    text_secondary: "#4D463E",
    text_muted: "#786E63",
    border: "#DAD2C3",
    accent: "#D97706",
    spine_divider: "#D2C9B8",
    is_dark: false,
};

pub const PALETTE_EINK_MONO: StaticThemePalette = StaticThemePalette {
    id: ThemeMode::EInkMono,
    name: "Gray",
    name_ar: "رمادي",
    bg_canvas: "#ECECEC",
    bg_surface: "#E0E0E0",
    bg_card: "#D4D4D4",
    text_primary: "#0F0F0F",
    text_secondary: "#383838",
    text_muted: "#616161",
    border: "#BFBFBF",
    accent: "#404040",
    spine_divider: "#B0B0B0",
    is_dark: false,
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ThemePalette {
    pub id: ThemeMode,
    pub name: String,
    pub name_ar: String,
    pub bg_canvas: String,
    pub bg_surface: String,
    pub bg_card: String,
    pub text_primary: String,
    pub text_secondary: String,
    pub text_muted: String,
    pub border: String,
    pub accent: String,
    pub spine_divider: String,
    pub is_dark: bool,
}

impl ThemeMode {
    /// Zero-allocation, compile-time baked palette in `.rdata`
    #[inline(always)]
    pub const fn static_palette(&self) -> &'static StaticThemePalette {
        match self {
            ThemeMode::OledBlack => &PALETTE_OLED_BLACK,
            ThemeMode::WarmSepia => &PALETTE_WARM_SEPIA,
            ThemeMode::DayPaper => &PALETTE_DAY_PAPER,
            ThemeMode::EInkMono => &PALETTE_EINK_MONO,
        }
    }

    /// Dynamic palette copy (for Serde / GUI compatibility)
    pub fn palette(&self) -> ThemePalette {
        let s = self.static_palette();
        ThemePalette {
            id: s.id,
            name: s.name.into(),
            name_ar: s.name_ar.into(),
            bg_canvas: s.bg_canvas.into(),
            bg_surface: s.bg_surface.into(),
            bg_card: s.bg_card.into(),
            text_primary: s.text_primary.into(),
            text_secondary: s.text_secondary.into(),
            text_muted: s.text_muted.into(),
            border: s.border.into(),
            accent: s.accent.into(),
            spine_divider: s.spine_divider.into(),
            is_dark: s.is_dark,
        }
    }
}
