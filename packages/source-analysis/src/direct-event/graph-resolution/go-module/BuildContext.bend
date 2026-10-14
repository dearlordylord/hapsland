import Base
import ./RawText.bend as Raw
import ./RawTextMeasurement.bend as Measurement

# Complete go-build-context policy. Path basename and character observations are
# mechanical inputs; configuration, tokenization and membership remain here.
type Snapshot is Data:
  Snapshot{goos: String, +goarch: String, +tags: List<&2, String>}
type SnapshotResult is Data:
  SnapshotValid{snapshot: Snapshot}
  InvalidTarget{}
  InvalidUserTag{}
type Membership is Data:
  Active{}
  Inactive{}
  Unknown{}

def contains( +items: List<&2, String>, +wanted: String) -> Bool:
  match items:
    case []: False{}
    case head <> tail: Bool.or(String.eq(head, wanted), contains(tail, wanted))

def os( +name: String) -> Bool:
  contains(
    "aix" <> "android" <> "darwin" <> "dragonfly" <> "freebsd" <> "hurd" <> "illumos" <> "ios" <> "js" <> "linux" <> "netbsd" <> "openbsd" <> "plan9" <> "solaris" <> "wasip1" <> "windows" <> [],
    name
  )

def arch( +name: String) -> Bool:
  contains(
    "386" <> "amd64" <> "arm" <> "arm64" <> "loong64" <> "mips" <> "mipsle" <> "mips64" <> "mips64le" <> "ppc64" <> "ppc64le" <> "riscv64" <> "s390x" <> "wasm" <> [],
    name
  )

def unix( +name: String) -> Bool:
  contains(
    "aix" <> "android" <> "darwin" <> "dragonfly" <> "freebsd" <> "hurd" <> "illumos" <> "ios" <> "linux" <> "netbsd" <> "openbsd" <> "solaris" <> [],
    name
  )

def os_alias(+name: String) -> String:
  Bool.pick(
    String,
    String.eq(name, "android"),
    "linux",
    Bool.pick(
      String,
      String.eq(name, "illumos"),
      "solaris",
      Bool.pick(String, String.eq(name, "ios"), "darwin", "")
    )
  )

def ascii_letter(+code: Nat) -> Bool:
  Bool.or(
    Bool.and(Nat.is_ge(code, 65n), Nat.is_le(code, 90n)),
    Bool.and(Nat.is_ge(code, 97n), Nat.is_le(code, 122n))
  )

def digit(+code: Nat) -> Bool:
  Bool.and(Nat.is_ge(code, 48n), Nat.is_le(code, 57n))

def word(+code: Nat) -> Bool:
  Bool.or(ascii_letter(code), Bool.or(digit(code), Nat.is_eq(code, 95n)))

def expression_word(+code: Nat) -> Bool:
  Bool.or(word(code), Nat.is_eq(code, 46n))

def all_word( +items: List<&2, Raw.Character>) -> Bool:
  match items:
    case []: True{}
    case Raw.Character{ +code, _} <> tail: Bool.and(word(code), all_word(tail))

def valid_tag(+text: Raw.Text) -> Bool:
  +name = Raw.value(text)
  +items = Raw.chars(text)
  Bool.and(
    Bool.not(Raw.empty(items)),
    Bool.and(
      Nat.is_le(Measurement.utf16(items), 128n),
      Bool.and(
        all_word(items),
        Bool.not(
          Bool.or(
            os(name),
            Bool.or(arch(name), contains("unix" <> "cgo" <> "gc" <> "gccgo" <> [], name))
          )
        )
      )
    )
  )

def valid_tags( +items: List<&2, Raw.Text>) -> Bool:
  match items:
    case []: True{}
    case head <> tail: Bool.and(valid_tag(head), valid_tags(tail))

def insert( +items: List<&2, String>, +value: String) -> List<&2, String>:
  match items:
    case []: value <> []
    case +head <> +tail: Bool.pick(
      List<&2, String>,
      String.eq(value, head),
      head <> tail,
      Bool.pick(
        List<&2, String>,
        String.is_lt(value, head),
        value <> head <> tail,
        head <> insert(tail, value)
      )
    )

def normalized( +items: List<&2, Raw.Text>, +acc: List<&2, String>) -> List<&2, String>:
  match items:
    case []: acc
    case head <> tail: normalized(tail, insert(acc, Raw.value(head)))

def snapshot_checked(
  +target: Bool,
  +tags_valid: Bool,
  +goos: String,
  +goarch: String,
  +tags: List<&2, Raw.Text>
) -> SnapshotResult:
  match target tags_valid:
    case False{} _: InvalidTarget{}
    case True{} False{}: InvalidUserTag{}
    case True{} True{}: SnapshotValid{Snapshot{goos, goarch, normalized(tags, [])}}

def snapshot(+goos: String, +goarch: String, +tags: List<&2, Raw.Text>) -> SnapshotResult:
  snapshot_checked(
    Bool.and(os(goos), arch(goarch)),
    Bool.and(Nat.is_le(List.length(&2, Raw.Text, tags), 64n), valid_tags(tags)),
    goos,
    goarch,
    tags
  )

def known_fact(+tag: String, +snapshot: Snapshot) -> Bool:
  match snapshot:
    case Snapshot{+goos, +goarch, +tags}:
      Bool.pick(
        Bool,
        os(tag),
        Bool.or(String.eq(tag, goos), String.eq(tag, os_alias(goos))),
        Bool.pick(
          Bool,
          arch(tag),
          String.eq(tag, goarch),
          Bool.pick(Bool, String.eq(tag, "unix"), unix(goos), contains(tags, tag))
        )
      )

def fact_present(
  +unsupported: Bool,
  +tag: String,
  +snapshot: Maybe<&2, Snapshot>
) -> Maybe<&2, Bool>:
  match unsupported snapshot:
    case True{} _: None{}
    case False{} None{}: None{}
    case False{} Some{ +value}: Some{known_fact(tag, value)}

def fact(+tag: String, +snapshot: Maybe<&2, Snapshot>) -> Maybe<&2, Bool>:
  fact_present(
    Bool.or(contains("cgo" <> "gc" <> "gccgo" <> [], tag), String.contains(tag, ".")),
    tag,
    snapshot
  )

def fact_true( +value: Maybe<&2, Bool>) -> Bool:
  match value:
    case Some{True{}}: True{}
    case _: False{}

def membership( +value: Bool) -> Membership:
  match value:
    case True{}: Active{}
    case False{}: Inactive{}

def constraints_true( +items: List<&2, String>, +snapshot: Snapshot) -> Bool:
  match items:
    case []: True{}
    case head <> tail: Bool.and(
      fact_true(fact(head, Some{snapshot})),
      constraints_true(tail, snapshot)
    )

def constraints( +items: List<&2, String>, +snapshot: Maybe<&2, Snapshot>) -> Membership:
  match items snapshot:
    case [] _: Active{}
    case _ None{}: Unknown{}
    case +items Some{ +value}: membership(constraints_true(items, value))

def suffix_constraints( +parts: List<&2, String>) -> List<&2, String>:
  match parts:
    case last <> previous <> _ <> _:
      Bool.pick(
        List<&2, String>,
        arch(last),
        Bool.pick(List<&2, String>, os(previous), previous <> last <> [], last <> []),
        Bool.pick(List<&2, String>, os(last), last <> [], [])
      )
    case last <> _ <> []: Bool.pick(List<&2, String>, Bool.or(arch(last), os(last)), last <> [], [])
    case _: []

def filename_checked( +excluded: Bool, +name: String, +snapshot: Maybe<&2, Snapshot>) -> Membership:
  match excluded:
    case True{}: Inactive{}
    case False{}: constraints(
      suffix_constraints(
        List.reverse(
          &2,
          String,
          String.split(String.take(name, Nat.sub(String.length(name), 3n)), '_')
        )
      ),
      snapshot
    )

def filename(+basename: String, +snapshot: Maybe<&2, Snapshot>) -> Membership:
  filename_checked(
    Bool.or(
      Bool.not(String.ends_with(basename, ".go")),
      Bool.or(
        String.starts_with(basename, "."),
        Bool.or(String.starts_with(basename, "_"), String.ends_with(basename, "_test.go"))
      )
    ),
    basename,
    snapshot
  )

type Token is Data:
  Name{value: String}
  And{}
  Or{}
  Not{}
  Open{}
  Closing{}
  Invalid{}
type WordSpan is Data:
  WordSpan{remaining: List<&2, Raw.Character>, +text: String}

def span_word( +items: List<&2, Raw.Character>, +acc: String) -> WordSpan:
  match items:
    case []: WordSpan{[], acc}
    case +head <> +tail: Bool.pick(
      WordSpan,
      expression_word(Raw.code(head)),
      span_word(tail, String.append(acc, Raw.ascii(Raw.code(head)))),
      WordSpan{head <> tail, acc}
    )

type Lex is Data:
  Lex{remaining: List<&2, Raw.Character>, +tokens: List<&2, Token>}

def word_lex( +span: WordSpan, +tokens: List<&2, Token>) -> Lex:
  match span:
    case WordSpan{ +remaining, +text}: Lex{remaining, Name{text} <> tokens}

def symbol( +code: Nat) -> Token:
  match code:
    case 33n: Not{}
    case 40n: Open{}
    case 41n: Closing{}
    case _: Invalid{}

def lex_symbol(+code: Nat, +tail: List<&2, Raw.Character>, +tokens: List<&2, Token>) -> Lex:
  +pair = Bool.and(
    Bool.or(Nat.is_eq(code, 38n), Nat.is_eq(code, 124n)),
    Nat.is_eq(code, Raw.head_code(tail))
  )
  Lex{
    Bool.pick(List<&2, Raw.Character>, pair, Raw.drop(tail, 1n), tail),
    Bool.pick(
      Token,
      pair,
      Bool.pick(Token, Nat.is_eq(code, 38n), And{}, Or{}),
      symbol(code)
    ) <> tokens
  }

def lex_choose(
  +space: Bool,
  +is_word: Bool,
  +head: Raw.Character,
  +tail: List<&2, Raw.Character>,
  +tokens: List<&2, Token>
) -> Lex:
  match space is_word:
    case True{} _: Lex{tail, tokens}
    case False{} True{}: word_lex(span_word(head <> tail, ""), tokens)
    case False{} False{}: lex_symbol(Raw.code(head), tail, tokens)

def lex_step( +state: Lex) -> Lex:
  match state:
    case Lex{[], +tokens}: Lex{[], tokens}
    case Lex{+head <> tail, +tokens}: lex_choose(
      Raw.space(head),
      expression_word(Raw.code(head)),
      head,
      tail,
      tokens
    )

def lex_loop( +fuel: Nat, +state: Lex) -> Lex:
  match fuel:
    case 0n: state
    case 1n++rest: lex_loop(rest, lex_step(state))

def lex_result( +state: Lex) -> List<&2, Token>:
  match state:
    case Lex{_, +tokens}: List.reverse(&2, Token, tokens)

def tokenize(+items: List<&2, Raw.Character>) -> List<&2, Token>:
  lex_result(lex_loop(List.length(&2, Raw.Character, items), Lex{items, []}))

type Parser is Data:
  Parser{
    operators: List<&2, Token>,
    +values: List<&2, Bool>,
    +depth: Nat,
    +expect: Bool,
    +uncertain: Bool,
    +valid: Bool
  }

def invalid( +state: Parser) -> Parser:
  match state:
    case Parser{ +ops, +vals, +depth, +expect, +uncertain, _}: Parser{
      ops,
      vals,
      depth,
      expect,
      uncertain,
      False{}
    }

def negate(
  +operators: List<&2, Token>,
  +value: Bool,
  +depth: Nat,
  +tail: List<&2, Bool>,
  +uncertain: Bool,
  +valid: Bool
) -> Parser:
  match operators:
    case Not{} <> rest: negate(rest, Bool.not(value), Nat.sub(depth, 1n), tail, uncertain, valid)
    case _: Parser{operators, value <> tail, depth, False{}, uncertain, valid}

def push_value( +found: Maybe<&2, Bool>, +state: Parser) -> Parser:
  match found state:
    case None{} Parser{ +ops, +vals, +depth, _, _, +valid}: negate(
      ops,
      False{},
      depth,
      vals,
      True{},
      valid
    )
    case Some{ +value} Parser{ +ops, +vals, +depth, _, +uncertain, +valid}: negate(
      ops,
      value,
      depth,
      vals,
      uncertain,
      valid
    )

def atom( +token: Token, +state: Parser, +snapshot: Maybe<&2, Snapshot>) -> Parser:
  match token state:
    case Name{ +name} _: push_value(fact(name, snapshot), state)
    case Not{} Parser{ +ops, +vals, +depth, _, +uncertain, +valid}: Parser{
      Not{} <> ops,
      vals,
      Nat.add(depth, 1n),
      True{},
      uncertain,
      valid
    }
    case Open{} Parser{ +ops, +vals, +depth, _, +uncertain, +valid}: Parser{
      Open{} <> ops,
      vals,
      Nat.add(depth, 1n),
      True{},
      uncertain,
      valid
    }
    case _ _: invalid(state)

def reduce_one( +state: Parser) -> Parser:
  match state:
    case Parser{And{} <> ops, right <> left <> tail, +depth, +expect, +uncertain, +valid}: Parser{
      ops,
      Bool.and(left, right) <> tail,
      depth,
      expect,
      uncertain,
      valid
    }
    case Parser{Or{} <> ops, right <> left <> tail, +depth, +expect, +uncertain, +valid}: Parser{
      ops,
      Bool.or(left, right) <> tail,
      depth,
      expect,
      uncertain,
      valid
    }
    case _: invalid(state)

def reducible( +state: Parser, +all: Bool) -> Bool:
  match state:
    case Parser{And{} <> _, _, _, _, _, _}: True{}
    case Parser{Or{} <> _, _, _, _, _, _}: all
    case _: False{}

def reduce_loop( +fuel: Nat, +active: Bool, +state: Parser, +all: Bool) -> Parser:
  match fuel active:
    case 0n _: state
    case _ False{}: state
    case 1n++rest True{}:
      +next = reduce_one(state)
      reduce_loop(rest, reducible(next, all), next, all)

def operator_count( +state: Parser) -> Nat:
  match state:
    case Parser{ +ops, _, _, _, _, _}: List.length(&2, Token, ops)

def reduce(+state: Parser, +all: Bool) -> Parser:
  reduce_loop(operator_count(state), reducible(state, all), state, all)

def binary_push( +state: Parser, +token: Token) -> Parser:
  match state:
    case Parser{ +ops, +vals, +depth, _, +uncertain, +valid}: Parser{
      token <> ops,
      vals,
      depth,
      True{},
      uncertain,
      valid
    }

def close( +state: Parser) -> Parser:
  match state:
    case Parser{Open{} <> ops, value <> tail, +depth, _, +uncertain, +valid}: negate(
      ops,
      value,
      Nat.sub(depth, 1n),
      tail,
      uncertain,
      valid
    )
    case _: invalid(state)

def after_atom( +token: Token, +state: Parser) -> Parser:
  match token:
    case And{}: binary_push(reduce(state, False{}), And{})
    case Or{}: binary_push(reduce(state, True{}), Or{})
    case Closing{}: close(reduce(state, True{}))
    case _: invalid(state)

def parse_choose(
  +valid: Bool,
  +expect: Bool,
  +depth_ok: Bool,
  +token: Token,
  +state: Parser,
  +snapshot: Maybe<&2, Snapshot>
) -> Parser:
  match valid expect depth_ok:
    case False{} _ _: state
    case True{} True{} False{}: invalid(state)
    case True{} True{} True{}: atom(token, state, snapshot)
    case True{} False{} _: after_atom(token, state)

def parse_step( +token: Token, +state: Parser, +snapshot: Maybe<&2, Snapshot>) -> Parser:
  match state:
    case Parser{_, _, +depth, +expect, _, +valid}: parse_choose(
      valid,
      expect,
      Nat.is_le(depth, 32n),
      token,
      state,
      snapshot
    )

def parse( +items: List<&2, Token>, +state: Parser, +snapshot: Maybe<&2, Snapshot>) -> Parser:
  match items:
    case []: reduce(state, True{})
    case head <> tail: parse(tail, parse_step(head, state, snapshot), snapshot)

def parse_result( +state: Parser) -> Membership:
  match state:
    case Parser{[], value <> [], 0n, False{}, False{}, True{}}: membership(value)
    case _: Unknown{}

def expression_checked(
  +admit: Bool,
  +tokens: List<&2, Token>,
  +snapshot: Maybe<&2, Snapshot>
) -> Membership:
  match admit:
    case False{}: Unknown{}
    case True{}: parse_result(parse(tokens, Parser{[], [], 0n, True{}, False{}, True{}}, snapshot))

def expression_admit(
  admit: Bool,
  +items: List<&2, Raw.Character>,
  snapshot: Maybe<&2, Snapshot>
) -> Membership:
  match admit:
    case False{}: Unknown{}
    case True{}:
      +tokens = tokenize(items)
      +count = List.length(&2, Token, tokens)
      expression_checked(Bool.and(Nat.is_gt(count, 0n), Nat.is_le(count, 256n)), tokens, snapshot)

def expression_chars(+items: List<&2, Raw.Character>, snapshot: Maybe<&2, Snapshot>) -> Membership:
  expression_admit(Nat.is_le(Measurement.bytes(items), 4096n), items, snapshot)

def expression( +text: Raw.Text, +snapshot: Maybe<&2, Snapshot>) -> Membership:
  expression_chars(Raw.chars(text), snapshot)

type Header is Data:
  Header{
    line: List<&2, Raw.Character>,
    +valid: Bool,
    +package_seen: Bool,
    +expressions: List<&2, List<&2, Raw.Character>>
  }

def no_line_terminators( +items: List<&2, Raw.Character>) -> Bool:
  match items:
    case []: True{}
    case Raw.Character{+code, _} <> tail:
      Bool.and(
        Bool.not(
          Bool.or(
            Nat.is_eq(code, 10n),
            Bool.or(Nat.is_eq(code, 13n), Bool.or(Nat.is_eq(code, 8232n), Nat.is_eq(code, 8233n)))
          )
        ),
        no_line_terminators(tail)
      )

def legacy_build(+items: List<&2, Raw.Character>) -> Bool:
  +tail = Raw.skip_space(Raw.drop(items, 2n))
  Bool.and(
    Raw.prefix(tail, 43n <> 98n <> 117n <> 105n <> 108n <> 100n <> []),
    Bool.not(word(Raw.head_code(Raw.drop(tail, 6n))))
  )

def constraint_tail(
  +tail: List<&2, Raw.Character>,
  +expressions: List<&2, List<&2, Raw.Character>>
) -> List<&2, List<&2, Raw.Character>>:
  +body = Raw.skip_space(tail)
  Bool.pick(
    List<&2, List<&2, Raw.Character>>,
    Bool.or(Raw.empty(tail), Bool.and(Raw.head_space(tail), no_line_terminators(body))),
    List.append(&2, List<&2, Raw.Character>, expressions, body <> []),
    expressions
  )

def constraint_line(
  +prefix: Bool,
  +items: List<&2, Raw.Character>,
  +expressions: List<&2, List<&2, Raw.Character>>
) -> List<&2, List<&2, Raw.Character>>:
  match prefix:
    case False{}: expressions
    case True{}: constraint_tail(Raw.drop(items, 10n), expressions)

def header_line_choices(
  +package_line: Bool,
  +empty: Bool,
  +comment: Bool,
  +legacy: Bool,
  +items: List<&2, Raw.Character>,
  +expressions: List<&2, List<&2, Raw.Character>>
) -> Header:
  match package_line empty comment legacy:
    case True{} _ _ _: Header{[], True{}, True{}, expressions}
    case False{} True{} _ _: Header{[], True{}, False{}, expressions}
    case False{} False{} False{} _: Header{[], False{}, False{}, expressions}
    case False{} False{} True{} True{}: Header{[], False{}, False{}, expressions}
    case False{} False{} True{} False{}: Header{
      [],
      True{},
      False{},
      constraint_line(
        Raw.prefix(
          items,
          47n <> 47n <> 103n <> 111n <> 58n <> 98n <> 117n <> 105n <> 108n <> 100n <> []
        ),
        items,
        expressions
      )
    }

def header_line(
  +items: List<&2, Raw.Character>,
  +expressions: List<&2, List<&2, Raw.Character>>
) -> Header:
  header_line_choices(
    Bool.and(
      Raw.prefix(items, 112n <> 97n <> 99n <> 107n <> 97n <> 103n <> 101n <> []),
      Raw.head_space(Raw.drop(items, 7n))
    ),
    Raw.empty(items),
    Raw.prefix(items, 47n <> 47n <> []),
    legacy_build(items),
    items,
    expressions
  )

def finish_line( +state: Header) -> Header:
  match state:
    case Header{_, False{}, +seen, +expressions}: Header{[], False{}, seen, expressions}
    case Header{_, +valid, True{}, +expressions}: Header{[], valid, True{}, expressions}
    case Header{ +line, True{}, False{}, +expressions}: header_line(
      Raw.trim(List.reverse(&2, Raw.Character, line)),
      expressions
    )

def header_character( +newline: Bool, +character: Raw.Character, +state: Header) -> Header:
  match newline state:
    case True{} _: finish_line(state)
    case False{} Header{ +line, +valid, +seen, +expressions}: Header{
      character <> line,
      valid,
      seen,
      expressions
    }

def header_scan(items: List<&2, Raw.Character>, +state: Header) -> Header:
  match items state:
    case _ Header{_, False{}, _, _}: state
    case _ Header{_, _, True{}, _}: state
    case Nil{} _: finish_line(state)
    case Con{+head, tail} _: header_scan(
      tail,
      header_character(Nat.is_eq(Raw.code(head), 10n), head, state)
    )

def file_result(
  +filename: Membership,
  +header: Header,
  +snapshot: Maybe<&2, Snapshot>
) -> Membership:
  match filename header:
    case Inactive{} _: Inactive{}
    case Unknown{} _: Unknown{}
    case Active{} Header{_, True{}, True{}, []}: Active{}
    case Active{} Header{_, True{}, True{}, expression <> []}: expression_chars(
      expression,
      snapshot
    )
    case _ _: Unknown{}

def file_checked(
  +filename: Membership,
  +source: Raw.Text,
  +snapshot: Maybe<&2, Snapshot>
) -> Membership:
  match filename:
    case Inactive{}: Inactive{}
    case _: file_result(
      filename,
      header_scan(Raw.chars(source), Header{[], True{}, False{}, []}),
      snapshot
    )

def file(+basename: String, +source: Raw.Text, +snapshot: Maybe<&2, Snapshot>) -> Membership:
  file_checked(filename(basename, snapshot), source, snapshot)
