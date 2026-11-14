use serde::{Deserialize, Serialize};
use uuid::Uuid;

use otium_ink::Stroke;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum BeamMessage {
    /// Initial pairing handshake from phone/tablet to host board
    Handshake {
        client_name: String,
        client_id: Uuid,
        pin: String,
    },
    /// Host board response confirming or rejecting pairing
    PairingResponse {
        accepted: bool,
        room_id: String,
        message: Option<String>,
    },
    /// Sync active document metadata and current page
    DocumentSync {
        doc_id: Uuid,
        doc_title: String,
        page_number: usize,
        total_pages: usize,
    },
    /// Page flip command
    PageTurn {
        target_page: usize,
    },
    /// Live ink stroke drawn on phone transmitted to board
    InkStroke {
        page_number: usize,
        stroke: Stroke,
    },
    /// Clear board command
    ClearBoard {
        page_number: usize,
    },
    /// Spotlight laser pointer position
    Spotlight {
        x_ratio: f32,
        y_ratio: f32,
        is_active: bool,
    },
    /// Delivery receipt acknowledging packet receipt
    Receipt {
        ack_message_id: Uuid,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BeamPacket {
    pub message_id: Uuid,
    pub session_id: String,
    pub timestamp_ms: u64,
    pub message: BeamMessage,
}

impl BeamPacket {
    pub fn new(session_id: String, message: BeamMessage) -> Self {
        Self {
            message_id: Uuid::new_v4(),
            session_id,
            timestamp_ms: chrono::Utc::now().timestamp_millis() as u64,
            message,
        }
    }

    /// Serialize to JSON string for WebRTC / WebSocket interop
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }

    /// Parse from JSON string
    pub fn from_json(json_str: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json_str)
    }

    /// Fast binary frame encoding for high-speed local UDP / QUIC transport
    /// Tag 0x01: Spotlight (10 bytes total: tag + active(1) + x(4) + y(4))
    /// Tag 0x02: PageTurn (5 bytes total: tag + page(4))
    pub fn encode_fast_command(&self) -> Option<Vec<u8>> {
        match &self.message {
            BeamMessage::Spotlight { x_ratio, y_ratio, is_active } => {
                let mut buf = Vec::with_capacity(10);
                buf.push(0x01);
                buf.push(if *is_active { 1 } else { 0 });
                buf.extend_from_slice(&x_ratio.to_le_bytes());
                buf.extend_from_slice(&y_ratio.to_le_bytes());
                Some(buf)
            }
            BeamMessage::PageTurn { target_page } => {
                let mut buf = Vec::with_capacity(5);
                buf.push(0x02);
                buf.extend_from_slice(&(*target_page as u32).to_le_bytes());
                Some(buf)
            }
            _ => None,
        }
    }
}
