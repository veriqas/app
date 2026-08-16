"""
Python AST cryptography extractor for VERIQAS (CRYPTOSCAN_AST_PY).

Parses Python source with the standard library's own `ast` module — the
authoritative grammar, so there is no third-party parser to drift out of date.

This script only EXTRACTS structured detections; it deliberately does NOT decide
algorithm names or risk. Classification happens once, in TypeScript, through the
shared classifier so that an algorithm found in Python gets exactly the same
canonical name as the same algorithm found in JavaScript. Two spellings of one
algorithm would split correlation cases and break fingerprint comparison.

Emits JSON on stdout:
  {"detections": [{"file","line","kind","value","context","key_size"?}, ...],
   "files_discovered": N, "files_parsed": N, "files_skipped": N}

kind is one of: hash | hmac | cipher | sign | keygen | jwt | kdf | curve | pqc
"""
import ast
import json
import os
import sys

EXTENSIONS = (".py", ".pyi")
SKIP_DIRS = {".git", "node_modules", "venv", ".venv", "env", "__pycache__",
             "site-packages", "dist", "build", ".tox", ".mypy_cache"}
MAX_FILE_BYTES = 2_000_000


def dotted(node):
    """Return the dotted name for an attribute/name chain, e.g. hashlib.md5."""
    parts = []
    cur = node
    while isinstance(cur, ast.Attribute):
        parts.append(cur.attr)
        cur = cur.value
    if isinstance(cur, ast.Name):
        parts.append(cur.id)
    return ".".join(reversed(parts))


class Extractor(ast.NodeVisitor):
    def __init__(self, rel_path):
        self.rel = rel_path
        self.out = []
        # data-flow-lite: module/function level constant strings and ints
        self.const_str = {}
        self.const_int = {}
        # import aliases, e.g. `from hashlib import md5 as h` -> h: hashlib.md5
        self.aliases = {}

    # ── constant + alias tracking ──────────────────────────────────────────
    def visit_Assign(self, node):
        if len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            name = node.targets[0].id
            v = node.value
            if isinstance(v, ast.Constant):
                if isinstance(v.value, str):
                    self.const_str[name] = v.value
                elif isinstance(v.value, int) and not isinstance(v.value, bool):
                    self.const_int[name] = v.value
        self.generic_visit(node)

    def visit_ImportFrom(self, node):
        mod = node.module or ""
        for a in node.names:
            self.aliases[a.asname or a.name] = f"{mod}.{a.name}"
        self.generic_visit(node)

    def visit_Import(self, node):
        for a in node.names:
            if a.asname:
                self.aliases[a.asname] = a.name
        self.generic_visit(node)

    # ── resolution helpers ─────────────────────────────────────────────────
    def s(self, node):
        """Resolve an expression to a string literal where possible."""
        if node is None:
            return None
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            return node.value
        if isinstance(node, ast.Name):
            return self.const_str.get(node.id)
        return None

    def i(self, node):
        if node is None:
            return None
        if isinstance(node, ast.Constant) and isinstance(node.value, int) and not isinstance(node.value, bool):
            return node.value
        if isinstance(node, ast.Name):
            return self.const_int.get(node.id)
        return None

    def curve_of(self, node):
        """Resolve a curve argument, which is usually `ec.SECP384R1()` (a Call),
        sometimes a bare attribute/name, sometimes a plain string."""
        if node is None:
            return None
        if isinstance(node, ast.Call):
            node = node.func
        if isinstance(node, (ast.Attribute, ast.Name)):
            tail = dotted(node).rsplit(".", 1)[-1]
            return tail or None
        return self.s(node)

    def kw(self, call, *names):
        for k in call.keywords:
            if k.arg in names:
                return k.value
        return None

    def add(self, kind, value, node, context=None, key_size=None):
        rec = {"file": self.rel, "line": getattr(node, "lineno", 0),
               "kind": kind, "value": str(value), "context": context or str(value)}
        if key_size:
            rec["key_size"] = key_size
        self.out.append(rec)

    # ── call detection ─────────────────────────────────────────────────────
    def visit_Call(self, node):
        name = dotted(node.func)
        # Expand an aliased leading segment: `h(...)` where h == hashlib.md5
        head = name.split(".")[0] if name else ""
        if head in self.aliases:
            name = self.aliases[head] + name[len(head):]
        low = name.lower()
        last = low.rsplit(".", 1)[-1] if low else ""
        a0 = node.args[0] if node.args else None

        # ── PQC first: already-migrated code must not read as unknown ──
        for seg in low.split("."):
            if any(t in seg for t in ("mlkem", "ml_kem", "kyber", "mldsa", "ml_dsa",
                                      "dilithium", "slhdsa", "slh_dsa", "sphincs", "falcon")):
                self.add("pqc", seg, node, name)
                return self.generic_visit(node)
        # liboqs: oqs.KeyEncapsulation("Kyber768") / oqs.Signature("Dilithium3")
        if last in ("keyencapsulation", "signature") and self.s(a0):
            self.add("pqc", self.s(a0), node, name)
            return self.generic_visit(node)

        # ── hashlib ──
        if low.startswith("hashlib.") or head == "hashlib":
            if last == "new":
                v = self.s(a0)
                if v:
                    self.add("hash", v, node, name)
            elif last in ("md5", "sha1", "sha224", "sha256", "sha384", "sha512",
                          "sha3_224", "sha3_256", "sha3_384", "sha3_512", "md4",
                          "blake2b", "blake2s"):
                self.add("hash", last, node, name)
            elif last == "pbkdf2_hmac":
                self.add("kdf", "pbkdf2", node, name)
            elif last == "scrypt":
                self.add("kdf", "scrypt", node, name)
        # bare `md5(...)` imported via `from hashlib import md5`
        elif name in ("hashlib.md5", "hashlib.sha1") or low in ("md5", "sha1"):
            self.add("hash", last, node, name)

        # ── hmac ──
        if low.startswith("hmac.") and last in ("new", "digest"):
            algo = self.s(self.kw(node, "digestmod")) or self.s(node.args[2] if len(node.args) > 2 else None)
            if algo is None:
                dm = self.kw(node, "digestmod")
                if dm is not None:
                    algo = dotted(dm).rsplit(".", 1)[-1] or None
            self.add("hmac", algo or "sha256", node, name)

        # ── cryptography (pyca) ──
        # hashes.MD5(), hashes.SHA1()
        if ".hashes." in f".{low}." or low.startswith("hashes."):
            self.add("hash", last, node, name)
        # rsa.generate_private_key(public_exponent=..., key_size=2048)
        if last == "generate_private_key" or last == "generate_key":
            bits = self.i(self.kw(node, "key_size")) or self.i(self.kw(node, "bits"))
            if "rsa" in low:
                self.add("keygen", "rsa", node, name, key_size=bits)
            elif "dsa" in low:
                self.add("keygen", "dsa", node, name, key_size=bits)
            elif "ec" in low or "elliptic" in low:
                # The curve is normally an instantiated class: ec.SECP384R1().
                # Resolve through the Call to its callee, otherwise the curve —
                # and therefore the security level — would be reported wrongly.
                curve = self.curve_of(node.args[0]) if node.args else None
                curve = curve or self.curve_of(self.kw(node, "curve"))
                self.add("curve", curve or "unknown-curve", node, name)
            elif "ed25519" in low:
                self.add("keygen", "ed25519", node, name)
            elif "x25519" in low:
                self.add("keygen", "x25519", node, name)
            elif "dh" in low:
                self.add("keygen", "dh", node, name, key_size=bits)
        # algorithms.AES(key), algorithms.TripleDES(key), algorithms.ARC4(key)
        if low.startswith("algorithms.") or ".algorithms." in f".{low}.":
            self.add("cipher", last, node, name)
        # padding.OAEP / padding.PSS / padding.PKCS1v15
        if low.startswith("padding.") or ".padding." in f".{low}.":
            if last in ("oaep", "pss", "pkcs1v15"):
                self.add("sign", "rsa", node, name)
        # PBKDF2HMAC / Scrypt / HKDF classes
        if last in ("pbkdf2hmac", "scrypt", "hkdf", "hkdfexpand", "argon2id", "bcrypt"):
            self.add("kdf", last, node, name)

        # ── pycryptodome (Crypto.*) ──
        if low.startswith("crypto.") or head == "crypto":
            if ".cipher." in f".{low}." and last == "new":
                mod = name.split(".")
                algo = mod[2] if len(mod) > 2 else None   # Crypto.Cipher.AES.new
                if algo:
                    self.add("cipher", algo, node, name)
            elif ".hash." in f".{low}." and last == "new":
                mod = name.split(".")
                algo = mod[2] if len(mod) > 2 else None
                if algo:
                    self.add("hash", algo, node, name)
            elif ".publickey." in f".{low}." and last in ("generate", "construct"):
                bits = self.i(a0) or self.i(self.kw(node, "bits"))
                mod = name.split(".")
                algo = mod[2] if len(mod) > 2 else "rsa"
                self.add("keygen", algo, node, name, key_size=bits)
            elif ".signature." in f".{low}.":
                self.add("sign", "rsa" if "pkcs1" in low or "pss" in low else last, node, name)

        # ── PyJWT ──
        if low.startswith("jwt.") and last in ("encode", "decode"):
            alg = self.s(self.kw(node, "algorithm"))
            if alg is None:
                algs = self.kw(node, "algorithms")
                if isinstance(algs, (ast.List, ast.Tuple)) and algs.elts:
                    alg = self.s(algs.elts[0])
            if alg:
                self.add("jwt", alg, node, name)

        # ── bcrypt / passlib / nacl ──
        if head == "bcrypt" and last in ("hashpw", "gensalt", "kdf"):
            self.add("kdf", "bcrypt", node, name)
        if head == "nacl" or low.startswith("nacl."):
            if "signing" in low:
                self.add("keygen", "ed25519", node, name)
            elif "public" in low or "box" in low:
                self.add("keygen", "x25519", node, name)
            elif "secret" in low:
                self.add("cipher", "xsalsa20-poly1305", node, name)

        self.generic_visit(node)


def scan(root):
    detections, discovered, parsed, skipped = [], 0, 0, 0
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]
        for fn in filenames:
            if not fn.endswith(EXTENSIONS):
                continue
            discovered += 1
            full = os.path.join(dirpath, fn)
            rel = os.path.relpath(full, root).replace(os.sep, "/")
            try:
                if os.path.getsize(full) > MAX_FILE_BYTES:
                    skipped += 1
                    continue
                with open(full, "r", encoding="utf-8", errors="replace") as fh:
                    src = fh.read()
                tree = ast.parse(src, filename=rel)
            except (SyntaxError, ValueError, OSError):
                skipped += 1     # unparseable (e.g. Python 2) or unreadable
                continue
            ex = Extractor(rel)
            try:
                ex.visit(tree)
            except RecursionError:
                skipped += 1
                continue
            parsed += 1
            detections.extend(ex.out)
    return {"detections": detections, "files_discovered": discovered,
            "files_parsed": parsed, "files_skipped": skipped}


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "."
    json.dump(scan(target), sys.stdout)
