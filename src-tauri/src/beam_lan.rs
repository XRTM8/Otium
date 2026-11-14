use std::{
    net::{Ipv4Addr, SocketAddrV4},
    sync::Mutex,
    time::Duration,
};

use chacha20poly1305::{
    KeyInit, XChaCha20Poly1305,
    aead::{Aead, Payload},
};
use futures_util::future::{Either, select};
use rand::{RngCore, rngs::OsRng};
use serde::Serialize;
use tauri::{State, ipc::Channel};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    sync::{mpsc, watch},
    time::timeout,
};

mod addresses;

const MAX_FRAME: usize = 512 * 1024;
const AUTH_TIMEOUT: Duration = Duration::from_secs(3);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(7);
const AUTH_CONTEXT: &[u8] = b"Otium Beam LAN v1";
type Result<T> = std::result::Result<T, String>;

#[derive(Clone, Serialize)]
#[serde(tag = "type", content = "message", rename_all = "camelCase")]
pub(crate) enum LanEvent {
    Connected,
    Disconnected,
    Frame(String),
}

#[derive(Serialize)]
pub(crate) struct LanInvitation {
    addresses: Vec<Ipv4Addr>,
    port: u16,
    key: String,
}

struct Session {
    _cancel: watch::Sender<bool>,
    outgoing: mpsc::Sender<Outgoing>,
}

type Outgoing = (String, tokio::sync::oneshot::Sender<()>);

#[derive(Default)]
pub(crate) struct LanBeam(Mutex<(u64, Option<Session>)>);

impl LanBeam {
    fn begin(&self, id: u64) -> Result<(watch::Receiver<bool>, mpsc::Receiver<Outgoing>)> {
        let mut slot = self.0.lock().map_err(|e| e.to_string())?;
        if id <= slot.0 {
            return Err("The LAN session was replaced.".into());
        }
        let (cancel, cancel_rx) = watch::channel(false);
        let (outgoing, outgoing_rx) = mpsc::channel(32);
        // Dropping the old watch sender cancels its listener or socket.
        *slot = (
            id,
            Some(Session {
                _cancel: cancel,
                outgoing,
            }),
        );
        Ok((cancel_rx, outgoing_rx))
    }

    fn stop(&self, id: u64) {
        if let Ok(mut slot) = self.0.lock() {
            if id >= slot.0 {
                *slot = (id, None);
            }
        }
    }
}

fn is_lan_address(ip: Ipv4Addr) -> bool {
    ip.is_private()
        || ip.is_link_local()
        || (ip.octets()[0] == 100 && (64..128).contains(&ip.octets()[1]))
}

#[tauri::command]
pub(crate) async fn beam_lan_listen(
    id: u64,
    events: Channel<LanEvent>,
    state: State<'_, LanBeam>,
) -> Result<LanInvitation> {
    let addresses = addresses::local_ipv4()
        .into_iter()
        .filter(|ip| is_lan_address(*ip))
        .collect::<Vec<_>>();
    if addresses.is_empty() {
        return Err("No local IPv4 address. Connect the screen to Wi-Fi or Ethernet.".into());
    }
    let listener = TcpListener::bind((Ipv4Addr::UNSPECIFIED, 0))
        .await
        .map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let mut key = [0; 32];
    OsRng.fill_bytes(&mut key);
    let (mut cancel, mut outgoing) = state.begin(id)?;
    tauri::async_runtime::spawn(async move {
        let serve = async {
            while let Ok((mut socket, source)) = listener.accept().await {
                if !matches!(source.ip(), std::net::IpAddr::V4(ip) if is_lan_address(ip)) {
                    continue;
                }
                let Ok(Ok(cipher)) =
                    timeout(AUTH_TIMEOUT, authenticate(&mut socket, &key, false)).await
                else {
                    continue;
                };
                // Frames left over from the previous peer belong to its session.
                while outgoing.try_recv().is_ok() {}
                run_socket(socket, cipher, &events, &mut outgoing).await;
            }
            let _ = events.send(LanEvent::Disconnected);
        };
        select(Box::pin(cancel.changed()), Box::pin(serve)).await;
    });
    Ok(LanInvitation {
        addresses,
        port,
        key: key.iter().map(|byte| format!("{byte:02X}")).collect(),
    })
}

#[tauri::command]
pub(crate) async fn beam_lan_connect(
    id: u64,
    address: Ipv4Addr,
    port: u16,
    key: String,
    events: Channel<LanEvent>,
    state: State<'_, LanBeam>,
) -> Result<()> {
    if !is_lan_address(address) || port == 0 {
        return Err("Use the local IPv4 address shown by the screen.".into());
    }
    let key = decode_key(&key)?;
    let (mut cancel, mut outgoing) = state.begin(id)?;
    let connect = async {
        let mut socket = TcpStream::connect(SocketAddrV4::new(address, port))
            .await
            .map_err(|e| e.to_string())?;
        let cipher = authenticate(&mut socket, &key, true).await?;
        Ok::<_, String>((socket, cipher))
    };
    let result = match select(
        Box::pin(cancel.changed()),
        Box::pin(timeout(CONNECT_TIMEOUT, connect)),
    )
    .await
    {
        Either::Left(_) => return Err("The LAN session was cancelled.".into()),
        Either::Right((result, _)) => result
            .unwrap_or_else(|_| Err("The screen could not be reached on this network.".into())),
    };
    let (socket, cipher) = match result {
        Ok(connection) => connection,
        Err(error) => {
            state.stop(id);
            return Err(error);
        }
    };
    tauri::async_runtime::spawn(async move {
        select(
            Box::pin(cancel.changed()),
            Box::pin(run_socket(socket, cipher, &events, &mut outgoing)),
        )
        .await;
    });
    Ok(())
}

#[tauri::command]
pub(crate) async fn beam_lan_send(id: u64, frame: String, state: State<'_, LanBeam>) -> Result<()> {
    if frame.len() > MAX_FRAME {
        return Err("LAN signaling frame is too large.".into());
    }
    let (sent, completion) = tokio::sync::oneshot::channel();
    {
        let slot = state.0.lock().map_err(|e| e.to_string())?;
        let session = slot
            .1
            .as_ref()
            .filter(|_| slot.0 == id)
            .ok_or("The LAN session is closed.")?;
        session
            .outgoing
            .try_send((frame, sent))
            .map_err(|_| "The LAN connection is unavailable or busy.")?;
    }
    timeout(AUTH_TIMEOUT, completion)
        .await
        .map_err(|_| "The LAN connection stopped responding.")?
        .map_err(|_| "The LAN connection was closed.".into())
}

#[tauri::command]
pub(crate) fn beam_lan_stop(id: u64, state: State<'_, LanBeam>) {
    state.stop(id);
}

fn decode_key(value: &str) -> Result<[u8; 32]> {
    if value.len() != 64 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("Invalid LAN invitation key.".into());
    }
    let mut key = [0; 32];
    for (index, byte) in key.iter_mut().enumerate() {
        *byte =
            u8::from_str_radix(&value[2 * index..2 * index + 2], 16).map_err(|e| e.to_string())?;
    }
    Ok(key)
}

struct Cipher {
    aead: XChaCha20Poly1305,
    salt: [u8; 16],
    counter: u64,
}

impl Cipher {
    fn nonce(&mut self) -> Result<[u8; 24]> {
        let mut nonce = [0; 24];
        nonce[..16].copy_from_slice(&self.salt);
        nonce[16..].copy_from_slice(&self.counter.to_be_bytes());
        self.counter = self
            .counter
            .checked_add(1)
            .ok_or("LAN connection exhausted its counter.")?;
        Ok(nonce)
    }

    fn seal(&mut self, bytes: &[u8]) -> Result<Vec<u8>> {
        let nonce = self.nonce()?;
        self.aead
            .encrypt(
                (&nonce).into(),
                Payload {
                    msg: bytes,
                    aad: AUTH_CONTEXT,
                },
            )
            .map_err(|_| "Could not encrypt LAN frame.".into())
    }

    fn open(&mut self, bytes: &[u8]) -> Result<Vec<u8>> {
        let nonce = self.nonce()?;
        self.aead
            .decrypt(
                (&nonce).into(),
                Payload {
                    msg: bytes,
                    aad: AUTH_CONTEXT,
                },
            )
            .map_err(|_| "The LAN invitation could not be authenticated.".into())
    }
}

async fn send_hello(
    socket: &mut TcpStream,
    cipher: &mut Cipher,
    challenge: &[u8; 16],
) -> Result<()> {
    socket
        .write_all(&cipher.salt)
        .await
        .map_err(|e| e.to_string())?;
    socket
        .write_all(&cipher.seal(challenge)?)
        .await
        .map_err(|e| e.to_string())
}

async fn read_hello(
    socket: &mut TcpStream,
    aead: &XChaCha20Poly1305,
    expected: &[u8; 16],
    own_salt: &[u8; 16],
) -> Result<Cipher> {
    let mut salt = [0; 16];
    let mut proof = [0; 32];
    socket
        .read_exact(&mut salt)
        .await
        .map_err(|e| e.to_string())?;
    socket
        .read_exact(&mut proof)
        .await
        .map_err(|e| e.to_string())?;
    let mut cipher = Cipher {
        aead: aead.clone(),
        salt,
        counter: 0,
    };
    if &salt == own_salt || cipher.open(&proof)? != expected {
        return Err("The LAN invitation could not be authenticated.".into());
    }
    Ok(cipher)
}

async fn authenticate(
    socket: &mut TcpStream,
    key: &[u8; 32],
    client: bool,
) -> Result<(Cipher, Cipher)> {
    socket.set_nodelay(true).map_err(|e| e.to_string())?;
    let mut salt = [0; 16];
    OsRng.fill_bytes(&mut salt);
    let mut tx = Cipher {
        aead: XChaCha20Poly1305::new(key.into()),
        salt,
        counter: 0,
    };
    // Distinct proof shapes in each direction bind the session to both fresh challenges.
    let mut rx;
    if client {
        send_hello(socket, &mut tx, &[0; 16]).await?;
        rx = read_hello(socket, &tx.aead, &salt, &salt).await?;
        socket
            .write_all(&tx.seal(&rx.salt)?)
            .await
            .map_err(|e| e.to_string())?;
    } else {
        rx = read_hello(socket, &tx.aead, &[0; 16], &salt).await?;
        send_hello(socket, &mut tx, &rx.salt).await?;
        let mut proof = [0; 32];
        socket
            .read_exact(&mut proof)
            .await
            .map_err(|e| e.to_string())?;
        if rx.open(&proof)? != salt {
            return Err("The LAN invitation could not be authenticated.".into());
        }
    }
    Ok((tx, rx))
}

async fn run_socket(
    socket: TcpStream,
    cipher: (Cipher, Cipher),
    events: &Channel<LanEvent>,
    outgoing: &mut mpsc::Receiver<Outgoing>,
) {
    if events.send(LanEvent::Connected).is_err() {
        return;
    }
    let (mut read, mut write) = socket.into_split();
    let (mut tx, mut rx) = cipher;
    let read_frames = async {
        while let Ok(message) = read_frame(&mut read, &mut rx).await {
            if events.send(LanEvent::Frame(message)).is_err() {
                break;
            }
        }
    };
    let write_frames = async {
        while let Some((message, sent)) = outgoing.recv().await {
            timeout(AUTH_TIMEOUT, write_frame(&mut write, &mut tx, &message))
                .await
                .map_err(|e| e.to_string())??;
            let _ = sent.send(());
        }
        Ok::<_, String>(())
    };
    select(Box::pin(read_frames), Box::pin(write_frames)).await;
    let _ = events.send(LanEvent::Disconnected);
}

async fn read_frame(
    reader: &mut (impl tokio::io::AsyncRead + Unpin),
    cipher: &mut Cipher,
) -> Result<String> {
    let size = reader.read_u32().await.map_err(|e| e.to_string())? as usize;
    if !(16..=MAX_FRAME + 16).contains(&size) {
        return Err("Invalid LAN frame size.".into());
    }
    let mut frame = vec![0; size];
    reader
        .read_exact(&mut frame)
        .await
        .map_err(|e| e.to_string())?;
    String::from_utf8(cipher.open(&frame)?).map_err(|e| e.to_string())
}

async fn write_frame(
    writer: &mut (impl tokio::io::AsyncWrite + Unpin),
    cipher: &mut Cipher,
    message: &str,
) -> Result<()> {
    let frame = cipher.seal(message.as_bytes())?;
    writer
        .write_u32(frame.len() as u32)
        .await
        .map_err(|e| e.to_string())?;
    writer.write_all(&frame).await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::future::join;

    #[test]
    fn authenticates_and_transfers_frames_over_tcp_in_both_directions() {
        tauri::async_runtime::block_on(async {
            let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
            let address = listener.local_addr().unwrap();
            for _ in 0..2 {
                let key = [17; 32];
                let challenge = "b".repeat(48 * 1024);
                let client = async {
                    let mut socket = TcpStream::connect(address).await.unwrap();
                    let (mut tx, mut rx) = authenticate(&mut socket, &key, true).await.unwrap();
                    write_frame(&mut socket, &mut tx, &challenge).await.unwrap();
                    assert_eq!(
                        read_frame(&mut socket, &mut rx).await.unwrap(),
                        "j{\"ok\":true}"
                    );
                };
                let server = async {
                    let (mut socket, _) = listener.accept().await.unwrap();
                    let (mut tx, mut rx) = authenticate(&mut socket, &key, false).await.unwrap();
                    assert_eq!(read_frame(&mut socket, &mut rx).await.unwrap(), challenge);
                    write_frame(&mut socket, &mut tx, "j{\"ok\":true}")
                        .await
                        .unwrap();
                };
                timeout(CONNECT_TIMEOUT, join(client, server))
                    .await
                    .unwrap();
            }
        });
    }

    #[test]
    fn rejects_wrong_keys_and_modified_frames() {
        tauri::async_runtime::block_on(async {
            let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
            let address = listener.local_addr().unwrap();
            let client = async {
                let mut socket = TcpStream::connect(address).await.unwrap();
                assert!(authenticate(&mut socket, &[1; 32], true).await.is_err());
            };
            let server = async {
                let (mut socket, _) = listener.accept().await.unwrap();
                assert!(authenticate(&mut socket, &[2; 32], false).await.is_err());
            };
            timeout(CONNECT_TIMEOUT, join(client, server))
                .await
                .unwrap();
        });
        let aead = XChaCha20Poly1305::new((&[1; 32]).into());
        let mut tx = Cipher {
            aead: aead.clone(),
            salt: [2; 16],
            counter: 0,
        };
        let mut rx = Cipher {
            aead,
            salt: [2; 16],
            counter: 0,
        };
        let mut altered = tx.seal(b"control").unwrap();
        altered[0] ^= 1;
        assert!(rx.open(&altered).is_err());
    }
}
