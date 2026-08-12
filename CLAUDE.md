@AGENTS.md
@OPERATING_SYSTEM.md

# Penetration Testing Operational Scope

## Engagement Parameters
- **Target Boundaries**: Configured per engagement — defined in `./evidence/scope.txt` before any scan begins
- **Environment Status**: Isolated local lab environment. AUTHORIZED ONLY.
- **Egress Limits**: Strictly local / private networks. Zero external scanning allowed.

## Operational Methodology
- **Recon First**: Always perform passive/active mapping (`nmap`, `feroxbuster`) before touching endpoints
- **Hypothesis-Driven**: Do not blindly spray payloads. Formulate a threat hypothesis and design specific checks
- **Evidence Collection**: Every vulnerability must be proven. Save raw HTTP packets, terminal stdout, and logs to `./evidence/`

## Critical Constraints
- **Human-In-The-Loop**: Pause and request confirmation before running any destructive payload or remote exploit
- **No Guesses**: If an MCP tool execution fails, trace the network error code — do not hallucinate successful exploit state
- **No External Scanning**: Never target systems outside the defined scope. No internet-facing hosts

# Rust & WebAssembly Architecture Guidelines
> Apply these rules ONLY when writing Rust or WebAssembly code.

## Memory & Safety Rules
- **No Unsafe**: Strict `#![forbid(unsafe_code)]` enforced across all crates unless explicitly allowed
- **Wasm Allocation**: Minimise allocations inside hot loops. Prefer reusable buffers over vector reallocation
- **Reference Passing**: Pass data across the JS/Wasm boundary via slices (`&[u8]`) or shared memory markers — no serialisation overhead

## Compilation & Target Profiles
- **Profile Configuration**: Custom `[profile.release]` must use `lto = true`, `opt-level = 'z'`, `codegen-units = 1` for ultra-small Wasm binaries
- **Feature Flags**: Strip debug symbols and use `panic = 'abort'` to minimise binary footprint

## Core Tooling & Verification Commands
- **Build / Bindgen**: `wasm-pack build --target web --release`
- **Lint / Clippy**: `cargo clippy --all-targets --all-features -- -D warnings`
- **Testing Engine**: `wasm-pack test --headless --chrome`

---

## Code Quality Standards
- All code must be enterprise-grade: typed, validated at system boundaries, parameterised queries only, no hardcoded secrets
- Security-first: no SQL injection, no command injection, no XSS, no SSRF, no insecure deserialization
- Every route must authenticate and authorise. Every input must be validated
- Errors must be logged server-side and never expose stack traces to the client
- All cryptographic primitives must be post-quantum safe or explicitly flagged as legacy with a migration TODO
