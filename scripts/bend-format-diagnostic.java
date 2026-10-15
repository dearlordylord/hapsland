import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.List;
import org.editorconfig.core.EditorConfig;
import scala.Option;
import scala.collection.immutable.Vector;
import scala.collection.mutable.ArrayBuffer;
import scala.collection.mutable.Map;
import scala.runtime.BooleanRef;
import scala.runtime.IntRef;
import scala.runtime.ObjectRef;

/**
 * Location-only diagnostic for the unchanged bend-format 0.1.19 JAR.
 * Run with Java 21: java --class-path PINNED_JAR scripts/bend-format-diagnostic.java PINNED_JAR FILE.bend
 * Uses the actual private scanner, recognizer, settings and selector. No writes or format qualification.
 * Delete or replace when the pinned formatter supplies these locations itself; private ABI mismatch fails closed.
 */
class BendFormatDiagnostic {
  private static final String SHA = "50df827b59cb5bca51e2d555e81a2e2bbd8d28d7b799566d3e16653eaac50356";
  private static final String PREFIX = "com.dearlordylord.bend.idea.syntax.parser.BendLayoutPolicy$";
  private static final String ERROR = "Unsupported block expression in list";
  private final Object policy;
  private final Class<?> policyClass;
  private final String text;
  private final Object settings;
  private final Vector<?> tokens;
  private final Object structure;
  private final Vector<?> lists;
  private final Path file;

  // The hash fixes the entire private ABI. Methods are additionally checked for name/arity uniqueness.
  private static Method method(Class<?> type, String name, int arity) throws ReflectiveOperationException {
    List<Method> matches = Arrays.stream(type.getDeclaredMethods())
      .filter(m -> m.getName().equals(name) && m.getParameterCount() == arity && !m.isBridge()).toList();
    if (matches.size() != 1) throw new NoSuchMethodException("Unsupported pinned diagnostic signature: " + name);
    Method result = matches.get(0);
    result.setAccessible(true);
    return result;
  }

  private static Object invoke(Method method, Object receiver, Object... args) throws ReflectiveOperationException {
    return method.invoke(Modifier.isStatic(method.getModifiers()) ? null : receiver, args);
  }

  private Object policy(String name, Object... args) throws ReflectiveOperationException {
    return invoke(method(policyClass, name, args.length), policy, args);
  }

  private static Object field(Object value, String name) throws ReflectiveOperationException {
    return invoke(method(value.getClass(), name, 0), value);
  }

  private static int number(Object value, String name) throws ReflectiveOperationException {
    return (Integer) field(value, name);
  }

  private static Object right(Object either) throws ReflectiveOperationException {
    if (!either.getClass().getName().equals("scala.util.Right"))
      throw new IllegalStateException("Pinned scanner/recognizer did not produce a layout");
    return field(either, "value");
  }

  private BendFormatDiagnostic(Path jar, Path source) throws Exception {
    file = source.toRealPath();
    if (!file.toString().endsWith(".bend")) throw new IllegalArgumentException("Expected one Bend source");
    policyClass = Class.forName(PREFIX);
    Path loaded = Path.of(policyClass.getProtectionDomain().getCodeSource().getLocation().toURI()).toRealPath();
    if (!loaded.equals(jar.toRealPath()) ||
        !HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(loaded))).equals(SHA))
      throw new IllegalStateException("Unsupported formatter JAR");
    policy = policyClass.getField("MODULE$").get(null);
    Class<?> cliClass = Class.forName("com.dearlordylord.bend.idea.adapters.cli.BendFormatCli$");
    Object cli = cliClass.getField("MODULE$").get(null);
    settings = invoke(method(cliClass, "resolveSettings", 2), cli, new EditorConfig(), file);
    text = Files.readString(file);
    tokens = (Vector<?>) right(policy("scan", text));
    structure = right(policy("recognize", text, tokens));
    lists = (Vector<?>) field(structure, "lists");
  }

  private record Maps(Map<Object, Object> indentation, Map<Object, Object> gaps) {}

  private Maps initialMaps() throws Exception {
    Map<Object, Object> indentation = scala.collection.mutable.Map$.MODULE$.empty();
    Map<Object, Object> gaps = scala.collection.mutable.Map$.MODULE$.empty();
    Vector<String> lines = scala.jdk.javaapi.CollectionConverters.asScala(Arrays.asList(text.split("\n", -1))).toVector();
    IntRef offset = IntRef.create(0);
    BooleanRef invalid = BooleanRef.create(false);
    ArrayBuffer<Object> edits = scala.collection.mutable.ArrayBuffer$.MODULE$.empty();
    // Actual plan callbacks: no duplicated indentation or whitespace policy.
    if (lines.length() >= 2) for (int i = 0; i < lines.length(); i++)
      policy("plan$$anonfun$1", lines, offset, structure, settings, invalid, indentation, edits, i);
    if (invalid.elem) throw new IllegalStateException("Pinned indentation planning refused source");
    for (int i = 1; i < tokens.length(); i++) policy("plan$$anonfun$2", tokens, text, gaps, i);
    return new Maps(indentation, gaps);
  }

  private static Maps copy(Maps maps) {
    return new Maps(scala.collection.mutable.Map$.MODULE$.from(maps.indentation()),
      scala.collection.mutable.Map$.MODULE$.from(maps.gaps()));
  }

  private String select(Object list, Maps maps) throws Exception {
    ObjectRef<Option<String>> failure = ObjectRef.create(Option.empty());
    policy("select$1", text, tokens, maps.indentation(), settings, failure, lists, maps.gaps(),
      text.contains("\r\n") ? "\r\n" : "\n", list);
    return failure.elem.isDefined() ? failure.elem.get() : null;
  }

  /** Only the selector's own error guards, using its actual spelling/width/token predicates. */
  private List<Object> ownBlockTokens(Object list, Maps maps) throws Exception {
    int open = number(list, "open"), close = number(list, "close");
    if (((Vector<?>) field(list, "items")).isEmpty()) return List.of();
    int lineStart = text.lastIndexOf('\n', number(tokens.apply(open), "start") - 1) + 1;
    int lineEnd = text.indexOf('\n', number(tokens.apply(close), "end"));
    if (lineEnd == -1) lineEnd = text.length();
    int first = 0;
    while (first < tokens.length() && !(Boolean) policy("$anonfun$11", lineStart, tokens.apply(first))) first++;
    if (first == tokens.length()) throw new IllegalStateException("Unsupported selector line span");
    int last = close;
    if (open >= 2 && field(tokens.apply(open - 2), "text").equals("def")) {
      last = tokens.length() - 1;
      while (last >= 0 && !(Boolean) policy("$anonfun$12", lineEnd, tokens.apply(last))) last--;
    } else if (close + 1 < tokens.length() && field(tokens.apply(close + 1), "text").equals(":")) last++;
    Option<?> planned = maps.indentation().get(lineStart);
    Option<?> indent = planned.isDefined()
      ? (Option<?>) invoke(method(settings.getClass(), "indent", 1), settings, planned.get()) : Option.empty();
    String prefix = indent.isDefined() ? (String) indent.get()
      : (String) policy("$anonfun$14", text, lineStart, tokens, first);
    String spelling = (String) policy("spelling$1", tokens, maps.gaps(), text, first, last);
    if (!(Boolean) policy("overlong$1", settings, prefix + spelling, 0)) return List.of();
    for (int i = open; i <= close; i++)
      if ((Boolean) policy("select$1$$anonfun$1", tokens.apply(i))) return List.of();
    List<Object> found = new ArrayList<>();
    for (int i = open + 1; i < close; i++)
      if ((Boolean) policy("select$1$$anonfun$2", tokens.apply(i))) found.add(tokens.apply(i));
    return found;
  }

  private String location(int start, int end) {
    int line = 1, previous = -1;
    for (int i = 0; i < start; i++) if (text.charAt(i) == '\n') { line++; previous = i; }
    return "utf16=" + start + ":" + end + " line=" + line + " column=" + (start - previous);
  }

  private void report(String label, Object list, List<Object> offending) throws Exception {
    System.out.println(label + " " + location(number(tokens.apply(number(list, "open")), "start"),
      number(tokens.apply(number(list, "close")), "end")));
    for (Object token : offending)
      System.out.println("  block-token " + location(number(token, "start"), number(token, "end")));
  }

  private void run() throws Exception {
    Object result = policy("plan", text, settings);
    if (!result.getClass().getName().equals("scala.util.Left") || !ERROR.equals(field(result, "value")))
      throw new IllegalStateException("Expected the pinned unsupported-block failure; this is not a format check");
    Maps initial = initialMaps(), sequential = copy(initial);
    List<Object> roots = new ArrayList<>();
    for (int i = 0; i < lists.length(); i++) {
      Object list = lists.apply(i);
      if ((Boolean) policy("plan$$anonfun$3", list) &&
          (Boolean) policy("plan$$anonfun$4", lists, tokens, list)) roots.add(list);
    }
    System.out.println("Diagnostic only: pinned formatter 0.1.19; UTF-16 offsets, one-based line/column; no qualification");
    System.out.println("file=" + file);
    boolean found = false;
    for (Object root : roots) {
      List<Object> own = ownBlockTokens(root, sequential);
      String failure = select(root, sequential);
      if (failure != null) {
        if (!ERROR.equals(failure)) throw new IllegalStateException("First selected root has a different failure");
        report("first-failing-selected-root", root, own);
        found = true;
        break; // Exact original selector prefix; no attempt to mirror its recursive planner.
      }
    }
    if (!found) throw new IllegalStateException("No failing selected root found");
    for (int i = 0; i < lists.length(); i++) {
      Object list = lists.apply(i);
      if (roots.contains(list)) continue;
      List<Object> own = ownBlockTokens(list, initial);
      if (!own.isEmpty() && ERROR.equals(select(list, copy(initial))))
        report("independently-failing-nested-list-original-maps-not-sequential-traversal", list, own);
    }
  }

  public static void main(String[] args) {
    try {
      if (args.length != 2) throw new IllegalArgumentException("Expected PINNED_JAR FILE.bend");
      new BendFormatDiagnostic(Path.of(args[0]), Path.of(args[1])).run();
    } catch (Exception error) {
      Throwable cause = error instanceof InvocationTargetException ? error.getCause() : error;
      // Do not print formatter exceptions, source snippets, token text or reflection payloads.
      System.err.println("Diagnostic unavailable (not qualification): " + cause.getClass().getSimpleName());
      System.exit(2);
    }
  }
}
