pub mod crypto;
pub mod vault;

pub use crypto::*;
pub use vault::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vault_encryption_decryption_roundtrip() {
        let pin = "123456";
        let salt = [0x42u8; 16];
        let key = VaultCrypto::derive_key(pin, &salt).expect("Key derivation failed");

        let secret_document = b"Sovereign Otium Private Document Content 100% Offline";
        let encrypted = VaultCrypto::encrypt(&key, secret_document).expect("Encryption failed");

        assert_ne!(encrypted.as_slice(), secret_document);

        let decrypted = VaultCrypto::decrypt(&key, &encrypted).expect("Decryption failed");
        assert_eq!(decrypted.as_slice(), secret_document);
    }

    #[test]
    fn test_vault_invalid_pin_rejection() {
        let pin = "123456";
        let salt = [0x42u8; 16];
        let key = VaultCrypto::derive_key(pin, &salt).unwrap();

        let wrong_key = VaultCrypto::derive_key("654321", &salt).unwrap();

        let secret = b"Top secret data";
        let encrypted = VaultCrypto::encrypt(&key, secret).unwrap();

        let result = VaultCrypto::decrypt(&wrong_key, &encrypted);
        assert!(result.is_err(), "Decryption with wrong key must fail");
    }

    #[test]
    fn test_vault_seal_and_unseal_bytes_roundtrip() {
        let secret = b"Otium Lab encrypted backup payload";
        let sealed = VaultCrypto::seal_bytes("passphrase-42", secret).expect("seal");
        assert!(sealed.starts_with(b"OTMV1"));
        let opened = VaultCrypto::unseal_bytes("passphrase-42", &sealed).expect("unseal");
        assert_eq!(opened, secret);
        assert!(VaultCrypto::unseal_bytes("wrong-pass", &sealed).is_err());
    }
}
