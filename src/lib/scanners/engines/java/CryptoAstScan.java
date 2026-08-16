/*
 * Java AST cryptography extractor for VERIQAS (CRYPTOSCAN_AST_JAVA).
 *
 * Parses Java with the JDK's own compiler front-end (javax.tools + com.sun.source)
 * — the authoritative grammar, so there is no third-party parser to drift out of
 * date. Runs via single-file source execution: `java CryptoAstScan.java <dir>`.
 *
 * This program only EXTRACTS structured detections; it deliberately does NOT
 * decide algorithm names or risk. Classification happens once, in TypeScript,
 * through the shared classifier, so an algorithm found in Java gets exactly the
 * same canonical name as the same algorithm found in Python or JavaScript. Two
 * spellings of one algorithm would split correlation cases and break
 * before/after fingerprint comparison.
 *
 * Emits JSON on stdout:
 *   {"detections":[{"file","line","kind","value","context","key_size"?}],
 *    "files_discovered":N,"files_parsed":N,"files_skipped":N}
 *
 * kind is one of: hash | hmac | cipher | sign | keygen | jwt | kdf | curve | pqc | protocol
 */
import com.sun.source.tree.*;
import com.sun.source.util.*;
import javax.tools.*;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.stream.Collectors;

public class CryptoAstScan {

    // ── JCA/JCE factory classes → the kind of detection they produce ──────────
    private static final Map<String, String> FACTORY_KIND = Map.ofEntries(
            Map.entry("MessageDigest", "hash"),
            Map.entry("Mac", "hmac"),
            Map.entry("Cipher", "cipher"),
            Map.entry("Signature", "sign"),
            Map.entry("KeyPairGenerator", "keygen"),
            Map.entry("KeyGenerator", "cipher"),
            Map.entry("KeyFactory", "keygen"),
            Map.entry("SecretKeyFactory", "kdf"),
            Map.entry("KeyAgreement", "keygen"),
            Map.entry("AlgorithmParameterGenerator", "keygen"),
            Map.entry("SSLContext", "protocol"),
            Map.entry("KeyStore", "protocol"));

    private static final Set<String> SKIP_DIRS = Set.of(
            ".git", "node_modules", "target", "build", "out", "bin",
            ".gradle", ".mvn", "generated", ".idea");

    private static final long MAX_FILE_BYTES = 2_000_000L;
    private static final int BATCH = 40;

    record Detection(String file, int line, String kind, String value, String context, Integer keySize) {}

    static final List<Detection> DETECTIONS = new ArrayList<>();
    static int discovered = 0, parsed = 0, skipped = 0;

    // ── JSON helpers (the JDK has no JSON API) ────────────────────────────────
    static String esc(String s) {
        StringBuilder b = new StringBuilder();
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"' -> b.append("\\\"");
                case '\\' -> b.append("\\\\");
                case '\n' -> b.append("\\n");
                case '\r' -> b.append("\\r");
                case '\t' -> b.append("\\t");
                default -> {
                    if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
                    else b.append(c);
                }
            }
        }
        return b.toString();
    }

    static class Src extends SimpleJavaFileObject {
        final String code;
        final String rel;
        Src(String rel, String code) {
            super(URI.create("string:///" + rel.replace('\\', '/')), Kind.SOURCE);
            this.code = code;
            this.rel = rel;
        }
        @Override public CharSequence getCharContent(boolean ignore) { return code; }
    }

    // ── AST visitor ───────────────────────────────────────────────────────────
    static class Visitor extends TreeScanner<Void, Void> {
        final String rel;
        final LineMap lines;
        final CompilationUnitTree unit;
        // data-flow-lite
        final Map<String, String> constStrings = new HashMap<>();     // name -> literal
        final Map<String, String[]> varAlgo = new HashMap<>();        // var -> {kind, algorithm}
        // var -> index of the detection produced by its getInstance call, so a
        // later kpg.initialize(4096) REFINES that finding instead of adding a
        // second one. One key pair must yield one finding, at its real strength.
        final Map<String, Integer> varDetIdx = new HashMap<>();
        final List<Detection> pending = new ArrayList<>();
        // Spec constructors already folded into a key-pair finding.
        final Set<Tree> suppress = new HashSet<>();

        Visitor(String rel, CompilationUnitTree unit) {
            this.rel = rel;
            this.unit = unit;
            this.lines = unit.getLineMap();
        }

        int lineOf(Tree t) {
            long pos = ((com.sun.source.util.SourcePositions)
                    Trees.instance(TASK).getSourcePositions()).getStartPosition(unit, t);
            return pos < 0 ? 0 : (int) lines.getLineNumber(pos);
        }

        /** Resolve an expression to a string literal, following local constants. */
        String str(ExpressionTree e) {
            if (e == null) return null;
            if (e instanceof LiteralTree lt && lt.getValue() instanceof String s) return s;
            if (e instanceof IdentifierTree id) return constStrings.get(id.getName().toString());
            if (e instanceof MemberSelectTree ms) return constStrings.get(ms.getIdentifier().toString());
            return null;
        }

        Integer intOf(ExpressionTree e) {
            if (e instanceof LiteralTree lt && lt.getValue() instanceof Integer i) return i;
            return null;
        }

        void add(String kind, String value, Tree at, String context, Integer keySize) {
            if (value == null || value.isBlank()) return;
            pending.add(new Detection(rel, lineOf(at), kind, value, context, keySize));
        }

        @Override
        public Void visitVariable(VariableTree node, Void p) {
            String name = node.getName().toString();
            ExpressionTree init = node.getInitializer();
            if (init instanceof LiteralTree lt && lt.getValue() instanceof String s) {
                constStrings.put(name, s);
            }
            // KeyPairGenerator kpg = KeyPairGenerator.getInstance("RSA");
            String[] ka = (init instanceof MethodInvocationTree mit) ? factoryCall(mit) : null;
            int before = pending.size();
            super.visitVariable(node, p);
            if (ka != null) {
                varAlgo.put(name, ka);
                // Remember which detection this variable produced (added while
                // visiting the initializer) so initialize() can refine it.
                if (pending.size() > before) varDetIdx.put(name, pending.size() - 1);
            }
            return null;
        }

        /** If this is a JCA factory getInstance call, return {kind, algorithm}. */
        String[] factoryCall(MethodInvocationTree node) {
            if (!(node.getMethodSelect() instanceof MemberSelectTree ms)) return null;
            if (!ms.getIdentifier().contentEquals("getInstance")) return null;
            String recv = ms.getExpression().toString();
            String simple = recv.contains(".") ? recv.substring(recv.lastIndexOf('.') + 1) : recv;
            String kind = FACTORY_KIND.get(simple);
            if (kind == null) return null;
            String algo = node.getArguments().isEmpty() ? null : str(node.getArguments().get(0));
            if (algo == null) return null;
            return new String[]{kind, algo};
        }

        @Override
        public Void visitMethodInvocation(MethodInvocationTree node, Void p) {
            String[] ka = factoryCall(node);
            if (ka != null) {
                String recv = ((MemberSelectTree) node.getMethodSelect()).getExpression().toString();
                add(ka[0], ka[1], node, recv + ".getInstance", null);
            }

            if (node.getMethodSelect() instanceof MemberSelectTree ms) {
                String method = ms.getIdentifier().toString();
                String target = ms.getExpression().toString();

                // kpg.initialize(4096) — REFINE the variable's existing finding
                // rather than emitting a second one for the same key pair.
                if (method.equals("initialize") || method.equals("init")) {
                    String[] prior = varAlgo.get(target);
                    Integer idx = varDetIdx.get(target);
                    if (prior != null && idx != null && idx < pending.size() && !node.getArguments().isEmpty()) {
                        Detection d = pending.get(idx);
                        Integer bits = intOf(node.getArguments().get(0));
                        if (bits != null) {
                            pending.set(idx, new Detection(d.file(), d.line(), d.kind(), d.value(),
                                    target + "." + method, bits));
                        } else {
                            // kpg.initialize(new ECGenParameterSpec("secp384r1"))
                            ExpressionTree a0 = node.getArguments().get(0);
                            if (a0 instanceof NewClassTree nct && !nct.getArguments().isEmpty()) {
                                String spec = str(nct.getArguments().get(0));
                                if (spec != null) {
                                    pending.set(idx, new Detection(d.file(), d.line(), "curve", spec,
                                            target + "." + method, null));
                                    suppress.add(nct);   // don't also report the spec on its own
                                }
                            }
                        }
                    }
                }
                // Post-quantum libraries expose algorithm-named members/classes.
                String lowTarget = target.toLowerCase();
                for (String t : new String[]{"mlkem", "ml_kem", "kyber", "mldsa", "ml_dsa",
                                             "dilithium", "sphincs", "falcon", "slhdsa"}) {
                    if (lowTarget.contains(t)) { add("pqc", target, node, target, null); break; }
                }
            }
            return super.visitMethodInvocation(node, p);
        }

        @Override
        public Void visitNewClass(NewClassTree node, Void p) {
            String cls = node.getIdentifier().toString();
            String simple = cls.contains(".") ? cls.substring(cls.lastIndexOf('.') + 1) : cls;
            // new ECGenParameterSpec("secp256r1")
            if (suppress.contains(node)) return super.visitNewClass(node, p);
            if (simple.equals("ECGenParameterSpec") || simple.equals("ECParameterSpec")) {
                if (!node.getArguments().isEmpty()) {
                    String v = str(node.getArguments().get(0));
                    if (v != null) add("curve", v, node, simple, null);
                }
            }
            // new PBEKeySpec(...) / new SecretKeySpec(key, "AES")
            if (simple.equals("SecretKeySpec") && node.getArguments().size() > 1) {
                String v = str(node.getArguments().get(1));
                if (v != null) add("cipher", v, node, simple, null);
            }
            if (simple.equals("PBEKeySpec")) add("kdf", "pbkdf2", node, simple, null);
            // BouncyCastle / PQC constructors named after the algorithm
            String low = simple.toLowerCase();
            for (String t : new String[]{"mlkem", "kyber", "mldsa", "dilithium",
                                         "sphincs", "falcon", "slhdsa"}) {
                if (low.contains(t)) { add("pqc", simple, node, simple, null); break; }
            }
            return super.visitNewClass(node, p);
        }
    }

    static JavacTask TASK; // set per batch so Visitor can read source positions

    public static void main(String[] args) throws Exception {
        Path root = Paths.get(args.length > 0 ? args[0] : ".");
        List<Path> files = new ArrayList<>();
        try (var walk = Files.walk(root)) {
            walk.filter(Files::isRegularFile)
                .filter(p -> p.toString().endsWith(".java"))
                .filter(p -> {
                    for (Path part : root.relativize(p)) {
                        if (SKIP_DIRS.contains(part.toString())) return false;
                    }
                    return true;
                })
                .forEach(files::add);
        }
        discovered = files.size();

        JavaCompiler jc = ToolProvider.getSystemJavaCompiler();
        if (jc == null) {
            System.out.println("{\"error\":\"no java compiler available\",\"detections\":[]," +
                    "\"files_discovered\":0,\"files_parsed\":0,\"files_skipped\":0}");
            return;
        }

        for (int i = 0; i < files.size(); i += BATCH) {
            List<Path> batch = files.subList(i, Math.min(files.size(), i + BATCH));
            List<Src> sources = new ArrayList<>();
            for (Path f : batch) {
                try {
                    if (Files.size(f) > MAX_FILE_BYTES) { skipped++; continue; }
                    String rel = root.relativize(f).toString().replace('\\', '/');
                    sources.add(new Src(rel, Files.readString(f, StandardCharsets.UTF_8)));
                } catch (IOException | java.io.UncheckedIOException e) {
                    skipped++;
                }
            }
            if (sources.isEmpty()) continue;
            try {
                DiagnosticCollector<JavaFileObject> diag = new DiagnosticCollector<>();
                JavacTask task = (JavacTask) jc.getTask(null, null, diag, null, null, sources);
                TASK = task;
                Iterable<? extends CompilationUnitTree> units = task.parse();
                int idx = 0;
                for (CompilationUnitTree u : units) {
                    String rel = idx < sources.size() ? sources.get(idx).rel : "unknown.java";
                    idx++;
                    try {
                        Visitor v = new Visitor(rel, u);
                        v.scan(u, null);
                        DETECTIONS.addAll(v.pending);
                        parsed++;
                    } catch (RuntimeException e) {
                        skipped++;
                    }
                }
            } catch (Exception e) {
                skipped += sources.size();   // batch failed to parse
            }
        }

        String items = DETECTIONS.stream().map(d -> {
            StringBuilder b = new StringBuilder();
            b.append("{\"file\":\"").append(esc(d.file())).append("\",")
             .append("\"line\":").append(d.line()).append(",")
             .append("\"kind\":\"").append(esc(d.kind())).append("\",")
             .append("\"value\":\"").append(esc(d.value())).append("\",")
             .append("\"context\":\"").append(esc(d.context() == null ? d.value() : d.context())).append("\"");
            if (d.keySize() != null) b.append(",\"key_size\":").append(d.keySize());
            return b.append("}").toString();
        }).collect(Collectors.joining(","));

        System.out.println("{\"detections\":[" + items + "]," +
                "\"files_discovered\":" + discovered + "," +
                "\"files_parsed\":" + parsed + "," +
                "\"files_skipped\":" + skipped + "}");
    }
}
