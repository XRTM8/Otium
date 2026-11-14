use qrcode::render::svg;
use qrcode::{EcLevel, QrCode};
use rand::Rng;

use otium_core::{OtiumError, Result};

pub struct BeamPairing;

impl BeamPairing {
    /// Generate a cryptographically secure 6-digit numeric pairing PIN (e.g. "482915")
    pub fn generate_pin() -> String {
        let mut rng = rand::thread_rng();
        let pin_num: u32 = rng.gen_range(100_000..=999_999);
        pin_num.to_string()
    }

    /// Generate an SVG QR Code string for pairing URL/room discovery
    pub fn generate_qr_svg(payload: &str) -> Result<String> {
        let code = QrCode::with_error_correction_level(payload.as_bytes(), EcLevel::M)
            .map_err(|e| OtiumError::Validation(format!("QR generation failed: {e}")))?;

        let svg_image = code
            .render()
            .min_dimensions(200, 200)
            .dark_color(svg::Color("#0f172a"))
            .light_color(svg::Color("#ffffff"))
            .build();

        Ok(svg_image)
    }
}
