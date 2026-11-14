pub mod pairing;
pub mod protocol;
pub mod ring_buffer;
pub mod state;

pub use pairing::*;
pub use protocol::*;
pub use ring_buffer::*;
pub use state::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pairing_pin_length_and_range() {
        let pin = BeamPairing::generate_pin();
        assert_eq!(pin.len(), 6);
        let num: u32 = pin.parse().expect("PIN must be numeric");
        assert!((100_000..=999_999).contains(&num));
    }

    #[test]
    fn test_qr_code_svg_generation() {
        let svg = BeamPairing::generate_qr_svg("otium://beam?pin=123456").unwrap();
        assert!(svg.contains("<svg"));
        assert!(svg.contains("xmlns=\"http://www.w3.org/2000/svg\""));
        assert!(svg.contains("</svg>"));
    }

    #[test]
    fn test_beam_packet_json_roundtrip() {
        let msg = BeamMessage::PageTurn { target_page: 42 };
        let packet = BeamPacket::new("session-123".into(), msg);

        let json = serde_json::to_string(&packet).unwrap();
        let decoded: BeamPacket = serde_json::from_str(&json).unwrap();

        assert_eq!(decoded.session_id, "session-123");
        match decoded.message {
            BeamMessage::PageTurn { target_page } => assert_eq!(target_page, 42),
            _ => panic!("Unexpected message variant"),
        }
    }
}
