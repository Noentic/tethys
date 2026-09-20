//! Maps the host `(OS, ARCH)` to the registry's platform key.

/// The registry's platform key for the running host, if one exists.
pub fn host_platform_key() -> Option<&'static str> {
    platform_key(std::env::consts::OS, std::env::consts::ARCH)
}

/// Maps an `(os, arch)` pair to the registry key.
///
/// The registry uses `darwin-aarch64`, `linux-x86_64`, `windows-aarch64`, …
pub fn platform_key(os: &str, arch: &str) -> Option<&'static str> {
    let arch = match arch {
        "x86_64" | "amd64" => "x86_64",
        "aarch64" | "arm64" => "aarch64",
        _ => return None,
    };
    match (os, arch) {
        ("macos", "x86_64") => Some("darwin-x86_64"),
        ("macos", "aarch64") => Some("darwin-aarch64"),
        ("linux", "x86_64") => Some("linux-x86_64"),
        ("linux", "aarch64") => Some("linux-aarch64"),
        ("windows", "x86_64") => Some("windows-x86_64"),
        ("windows", "aarch64") => Some("windows-aarch64"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_pairs_map_to_registry_keys() {
        let cases = [
            ("macos", "aarch64", "darwin-aarch64"),
            ("macos", "x86_64", "darwin-x86_64"),
            ("linux", "x86_64", "linux-x86_64"),
            ("linux", "aarch64", "linux-aarch64"),
            ("windows", "x86_64", "windows-x86_64"),
            ("windows", "aarch64", "windows-aarch64"),
        ];
        for (os, arch, expected) in cases {
            assert_eq!(platform_key(os, arch), Some(expected), "{os}/{arch}");
        }
    }

    #[test]
    fn unknown_pairs_are_unsupported() {
        assert_eq!(platform_key("freebsd", "x86_64"), None);
        assert_eq!(platform_key("linux", "riscv64"), None);
    }
}
