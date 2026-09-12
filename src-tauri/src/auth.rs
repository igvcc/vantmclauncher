use md5::{Digest, Md5};
use uuid::Uuid;

/// Oblicza poprawny Minecraft Offline UUID, identyczny z Java `UUID.nameUUIDFromBytes(("OfflinePlayer:" + nickname).getBytes(StandardCharsets.UTF_8))`
pub fn get_offline_uuid(nickname: &str) -> String {
    let source = format!("OfflinePlayer:{}", nickname);
    let mut hasher = Md5::new();
    hasher.update(source.as_bytes());
    let mut hash = hasher.finalize();

    // Ustawienie wersji UUID na 3 (MD5 based)
    hash[6] = (hash[6] & 0x0f) | 0x30;
    // Ustawienie wariantu na IETF RFC 4122
    hash[8] = (hash[8] & 0x3f) | 0x80;

    let uuid = Uuid::from_bytes(hash.into());
    uuid.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_offline_uuid() {
        // Dla nicku "Notch" poprawny offline UUID to "b50ad385-829d-3141-a216-7e7d7539ba7f"
        let uuid = get_offline_uuid("Notch");
        assert_eq!(uuid, "b50ad385-829d-3141-a216-7e7d7539ba7f");
    }
}
