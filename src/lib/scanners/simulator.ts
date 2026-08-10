/**
 * Scan simulator — generates realistic scanner output for dev/demo mode.
 * Each function returns output that matches exactly what the real tool produces,
 * so the adapter pipeline is exercised identically to production.
 */

// ── TLS / SSLyze ─────────────────────────────────────────────────────────────

function simulateSslyze(targets: string[]) {
  const tlsSuites = [
    "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
    "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
    "TLS_RSA_WITH_AES_256_CBC_SHA256",
    "TLS_RSA_WITH_3DES_EDE_CBC_SHA",
    "TLS_AES_256_GCM_SHA384",
    "TLS_CHACHA20_POLY1305_SHA256",
  ];
  const vulnSuites = tlsSuites.slice(0, 4);
  const goodSuites = tlsSuites.slice(4);

  return {
    server_scan_results: targets.map((t, i) => {
      const [hostname, portStr] = t.includes(":") ? t.split(":") : [t, "443"];
      const port = parseInt(portStr) || 443;
      const isVuln = i % 3 !== 0; // 2/3 endpoints have weak config
      return {
        uuid: `sim-${i}`,
        server_location: { hostname, port, ip_address: `10.0.0.${i + 1}` },
        connectivity_status: "COMPLETED",
        scan_result: {
          tls_1_2_cipher_suites: {
            status: "COMPLETED",
            result: {
              tls_version_used: "TLS 1.2",
              accepted_cipher_suites: (isVuln ? vulnSuites : goodSuites).map(name => ({
                cipher_suite: { name },
                ephemeral_key: name.includes("ECDHE")
                  ? { type: "ECDH", size: 256, curve_name: "prime256v1" }
                  : undefined,
              })),
            },
          },
          tls_1_3_cipher_suites: {
            status: "COMPLETED",
            result: {
              tls_version_used: "TLS 1.3",
              accepted_cipher_suites: goodSuites.map(name => ({
                cipher_suite: { name },
              })),
            },
          },
          elliptic_curves: {
            status: "COMPLETED",
            result: {
              supported_elliptic_curves: [
                { name: "prime256v1" },
                { name: "secp384r1" },
                { name: "X25519" },
              ],
            },
          },
          certificate_info: {
            status: "COMPLETED",
            result: {
              certificate_deployments: [{
                verified_chain: [{
                  subject: { rfc4514_string: `CN=${hostname}` },
                  public_key: {
                    algorithm: isVuln ? "RSA" : "ECDSA",
                    key_size: isVuln ? 2048 : 256,
                    ec_curve_name: isVuln ? undefined : "prime256v1",
                  },
                }],
              }],
            },
          },
        },
      };
    }),
    date_scans_completed: new Date().toISOString(),
  };
}

// ── SSH / ssh-audit ───────────────────────────────────────────────────────────

function simulateSshAudit(targets: string[]) {
  const vulnKex = ["diffie-hellman-group14-sha1", "diffie-hellman-group1-sha1", "ecdh-sha2-nistp256"];
  const goodKex = ["curve25519-sha256", "diffie-hellman-group16-sha512", "diffie-hellman-group18-sha512"];
  const enc = ["aes256-gcm@openssh.com", "aes128-gcm@openssh.com", "chacha20-poly1305@openssh.com", "aes128-cbc", "3des-cbc"];
  const mac = ["hmac-sha2-256", "hmac-sha2-512", "hmac-sha1", "hmac-md5"];

  return targets.map((t, i) => {
    const [host, portStr] = t.includes(":") ? t.split(":") : [t, "22"];
    const isVuln = i % 2 === 0;
    return {
      target: host,
      port: parseInt(portStr) || 22,
      banner: {
        protocol: { raw: "SSH-2.0" },
        software: isVuln ? "OpenSSH_7.4" : "OpenSSH_9.3",
      },
      algorithms: {
        kex: (isVuln ? vulnKex : goodKex).map(name => ({
          name,
          security: isVuln ? "warn" : "safe",
          description: `Key exchange: ${name}`,
        })),
        key: [
          { name: "ssh-rsa", security: "warn", description: "RSA host key" },
          { name: "ecdsa-sha2-nistp256", security: "warn", description: "ECDSA host key" },
        ],
        enc: enc.map(name => ({
          name,
          security: name.includes("cbc") || name.includes("3des") ? "fail" : "safe",
          description: `Cipher: ${name}`,
        })),
        mac: mac.map(name => ({
          name,
          security: name.includes("md5") || name === "hmac-sha1" ? "warn" : "safe",
          description: `MAC: ${name}`,
        })),
      },
      fingerprints: [
        { hash_alg: "SHA256", hash: `SHA256:sim${i}abc`, key_type: "ssh-rsa", key_bits: 2048 },
      ],
    };
  });
}

// ── ZGrab2 ────────────────────────────────────────────────────────────────────

function simulateZgrab2(targets: string[]) {
  return targets.map((t, i) => ({
    ip: t,
    domain: t,
    timestamp: new Date().toISOString(),
    data: {
      tls: {
        status: "success",
        port: 443,
        result: {
          handshake_log: {
            version: { value: 0x0303, name: "TLSv1.2" },
            cipher_suite: {
              value: 0xc02f,
              name: i % 2 === 0
                ? "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256"
                : "TLS_RSA_WITH_AES_256_CBC_SHA",
            },
            server_key_exchange: {
              ecdh_params: {
                curve_id: { name: "P-256" },
              },
            },
            server_certificates: {
              certificate: {
                parsed: {
                  subject: { common_name: [t] },
                  subject_key_info: {
                    key_algorithm: { name: "RSA" },
                    rsa_public_key: { length: 2048 },
                  },
                  signature_algorithm: { name: "SHA256WithRSA" },
                },
              },
            },
          },
        },
      },
    },
  }));
}

// ── CryptoScan ────────────────────────────────────────────────────────────────

function simulateCryptoscan(targets: string[]) {
  const repo = targets[0] ?? "repo";
  const findings = [
    { algorithm: "RSA-2048", primitive: "PUBLIC_KEY_ENCRYPTION", quantum_risk: "VULNERABLE", file: "src/auth/jwt.go", line: 47, library: "crypto/rsa", confidence: 92, purpose: "JWT signing key generation", category: "Key Generation" },
    { algorithm: "ECDSA-P256", primitive: "DIGITAL_SIGNATURE", quantum_risk: "VULNERABLE", file: "src/tls/config.go", line: 23, library: "crypto/ecdsa", confidence: 88, purpose: "TLS certificate signing", category: "Certificate" },
    { algorithm: "AES-256", primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "SAFE", file: "src/storage/encrypt.go", line: 112, library: "crypto/aes", confidence: 95, purpose: "Data at rest encryption", category: "Encryption" },
    { algorithm: "SHA-256", primitive: "HASH", quantum_risk: "SAFE", file: "src/api/middleware.go", line: 78, library: "crypto/sha256", confidence: 99, purpose: "Request HMAC verification", category: "Integrity" },
    { algorithm: "DH-2048", primitive: "KEY_EXCHANGE", quantum_risk: "VULNERABLE", file: "vendor/openssl/dh.c", line: 340, library: "openssl", confidence: 75, purpose: "Key exchange (legacy)", category: "Key Exchange" },
    { algorithm: "RSA-2048", primitive: "PUBLIC_KEY_ENCRYPTION", quantum_risk: "VULNERABLE", file: "src/payments/rsa.go", line: 89, library: "crypto/rsa", confidence: 91, purpose: "Payment data encryption", category: "Encryption" },
    { algorithm: "HMAC-SHA256", primitive: "MAC", quantum_risk: "SAFE", file: "src/api/auth.go", line: 156, library: "crypto/hmac", confidence: 97, purpose: "API authentication", category: "Authentication" },
    { algorithm: "3DES", primitive: "SYMMETRIC_ENCRYPTION", quantum_risk: "VULNERABLE", file: "src/legacy/cipher.go", line: 12, library: "golang.org/x/crypto", confidence: 83, purpose: "Legacy data migration", category: "Encryption" },
  ];

  return {
    tool: { name: "cryptoscan", version: "1.0.0" },
    scan_timestamp: new Date().toISOString(),
    findings: findings.map((f, i) => ({ pattern_id: `CS-${i + 1}`, ...f })),
  };
}

// ── CryptoDeps ────────────────────────────────────────────────────────────────

function simulateCryptodeps(targets: string[]) {
  return {
    tool: { name: "cryptodeps", version: "0.9.0" },
    scanned_at: new Date().toISOString(),
    findings: [
      {
        package: "openssl", version: "1.1.1t", direct: true, dependency_path: ["openssl"],
        crypto_implementations: [
          { algorithm: "RSA-2048", quantum_risk: "VULNERABLE", reachability: "CONFIRMED", usage_context: "TLS key exchange" },
          { algorithm: "ECDSA-P256", quantum_risk: "VULNERABLE", reachability: "CONFIRMED", usage_context: "Certificate signing" },
        ],
      },
      {
        package: "bouncy-castle", version: "1.70", direct: false, dependency_path: ["spring-security", "bouncy-castle"],
        crypto_implementations: [
          { algorithm: "RSA-2048", quantum_risk: "VULNERABLE", reachability: "REACHABLE", usage_context: "S/MIME encryption" },
          { algorithm: "AES-256", quantum_risk: "SAFE", reachability: "CONFIRMED", usage_context: "Data encryption" },
        ],
      },
      {
        package: "jose", version: "4.14.4", direct: true, dependency_path: ["jose"],
        crypto_implementations: [
          { algorithm: "ECDSA-P256", quantum_risk: "VULNERABLE", reachability: "CONFIRMED", usage_context: "JWT signing (ES256)" },
          { algorithm: "RSA-2048", quantum_risk: "VULNERABLE", reachability: "AVAILABLE", usage_context: "JWT signing (RS256)" },
        ],
      },
      {
        package: "pyca-cryptography", version: "41.0.5", direct: true, dependency_path: ["pyca-cryptography"],
        crypto_implementations: [
          { algorithm: "AES-256", quantum_risk: "SAFE", reachability: "CONFIRMED", usage_context: "Fernet symmetric encryption" },
          { algorithm: "HMAC-SHA256", quantum_risk: "SAFE", reachability: "CONFIRMED", usage_context: "Token signing" },
        ],
      },
    ],
  };
}

// ── CBOMkit ───────────────────────────────────────────────────────────────────

function simulateCbomkit(targets: string[]) {
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: [{ vendor: "IBM", name: "CBOMkit", version: "1.0.0" }],
      component: { name: targets[0] ?? "application", version: "1.0.0" },
    },
    components: [
      {
        type: "cryptographic-asset",
        "bom-ref": "algo-rsa-2048",
        name: "RSA-2048",
        cryptoProperties: {
          assetType: "algorithm",
          algorithmProperties: {
            primitive: "PUBLIC_KEY_ENCRYPTION",
            parameterSetIdentifier: "2048",
            classicalSecurityLevel: 112,
            nistQuantumSecurityLevel: 0,
          },
        },
        evidence: { occurrences: [{ location: "src/auth/keys.java", line: 34 }] },
      },
      {
        type: "cryptographic-asset",
        "bom-ref": "algo-aes-256",
        name: "AES-256",
        cryptoProperties: {
          assetType: "algorithm",
          algorithmProperties: {
            primitive: "SYMMETRIC_ENCRYPTION",
            parameterSetIdentifier: "256",
            classicalSecurityLevel: 256,
            nistQuantumSecurityLevel: 1,
          },
        },
        evidence: { occurrences: [{ location: "src/storage/vault.java", line: 88 }] },
      },
      {
        type: "cryptographic-asset",
        "bom-ref": "algo-ecdsa-p256",
        name: "ECDSA-P256",
        cryptoProperties: {
          assetType: "algorithm",
          algorithmProperties: {
            primitive: "DIGITAL_SIGNATURE",
            curve: "P-256",
            classicalSecurityLevel: 128,
            nistQuantumSecurityLevel: 0,
          },
        },
        evidence: { occurrences: [{ location: "src/tls/cert.java", line: 61 }] },
      },
    ],
  };
}

// ── Semgrep ───────────────────────────────────────────────────────────────────

function simulateSemgrep(targets: string[]) {
  return {
    version: "1.50.0",
    results: [
      {
        check_id: "senqor.crypto.rsa-2048.weak-key",
        path: "src/auth/jwt.go",
        start: { line: 47, col: 12 },
        extra: {
          message: "RSA-2048 key generation detected. RSA is quantum-vulnerable (Shor's algorithm). Consider migrating to ML-KEM or hybrid schemes.",
          severity: "WARNING",
          metadata: {
            senqor_algorithm: "RSA-2048",
            senqor_primitive: "PUBLIC_KEY_ENCRYPTION",
            senqor_quantum_class: "QUANTUM_VULNERABLE",
            senqor_purpose: "JWT signing",
            senqor_confidence: 88,
            senqor_rule_set: "SENQOR_OWNED",
          },
          lines: "  privateKey, err := rsa.GenerateKey(rand.Reader, 2048)",
        },
      },
      {
        check_id: "senqor.crypto.ecdsa.quantum-vulnerable",
        path: "src/payments/sign.go",
        start: { line: 33, col: 5 },
        extra: {
          message: "ECDSA detected. Elliptic curve discrete log is quantum-vulnerable. Plan migration to ML-DSA.",
          severity: "WARNING",
          metadata: {
            senqor_algorithm: "ECDSA-P256",
            senqor_primitive: "DIGITAL_SIGNATURE",
            senqor_quantum_class: "QUANTUM_VULNERABLE",
            senqor_purpose: "Payment signing",
            senqor_confidence: 91,
            senqor_rule_set: "SENQOR_OWNED",
          },
          lines: "  sig, err := ecdsa.Sign(rand.Reader, privKey, hash[:])",
        },
      },
      {
        check_id: "senqor.crypto.aes256.safe",
        path: "src/vault/encrypt.go",
        start: { line: 19, col: 2 },
        extra: {
          message: "AES-256 detected. Quantum-resilient for symmetric encryption (128-bit security post-Grover).",
          severity: "INFO",
          metadata: {
            senqor_algorithm: "AES-256",
            senqor_primitive: "SYMMETRIC_ENCRYPTION",
            senqor_quantum_class: "QUANTUM_RESILIENT",
            senqor_purpose: "Data encryption",
            senqor_confidence: 96,
            senqor_rule_set: "SENQOR_OWNED",
          },
        },
      },
    ],
    errors: [],
    stats: { total_finding_count: 3 },
  };
}

// ── Zeek (log upload simulation) ──────────────────────────────────────────────

function simulateZeek(targets: string[]) {
  const endpoints = targets.length ? targets : ["10.0.1.1", "10.0.1.5"];
  return {
    logType: "ssl",
    entries: endpoints.flatMap((ep, i) => [
      {
        ts: Date.now() / 1000 - i * 300,
        uid: `C${i}abc123`,
        id: { orig_h: "10.0.0.1", orig_p: 54321, resp_h: ep, resp_p: 443 },
        version: i % 2 === 0 ? "TLSv12" : "TLSv13",
        cipher: i % 2 === 0
          ? "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384"
          : "TLS_AES_256_GCM_SHA384",
        curve: "secp256r1",
        server_name: `service-${i}.northstar.internal`,
        established: true,
        resumed: false,
      },
    ]),
  };
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export function simulateScan(sensorType: string, targets: string[]): unknown {
  switch (sensorType) {
    case "SSLYZE":     return simulateSslyze(targets);
    case "SSH_AUDIT":  return simulateSshAudit(targets);
    case "ZGRAB2":     return simulateZgrab2(targets);
    case "CRYPTOSCAN": return simulateCryptoscan(targets);
    case "CRYPTODEPS": return simulateCryptodeps(targets);
    case "SEMGREP":    return simulateSemgrep(targets);
    case "CBOMKIT":    return simulateCbomkit(targets);
    case "ZEEK":       return simulateZeek(targets);
    default: return { findings: [] };
  }
}
