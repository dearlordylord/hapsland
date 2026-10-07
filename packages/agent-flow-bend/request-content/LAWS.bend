import Base
import ./core.bend as Core

# Empty input preserves the lookup fallback rather than inventing content.
law lookup_empty:
  for key: String
  for +fallback: String
  {Core.lookup(Nil{}, key, fallback) == fallback : String}

# A matching field supplies the value; later matching fields may replace it.
law lookup_match:
  for +rest: List<&2, Core.Field>
  for +key: String
  for name: String
  for +value: String
  for fallback: String
  for equal: {String.eq(key, name) == True{} : Bool}
  {
    Core.lookup(Core.Field{name, value} <> rest, key, fallback)
    == Core.lookup(rest, key, value)
    : String
  }

# A nonmatching field cannot affect lookup, including arbitrary private values.
law lookup_skip:
  for +rest: List<&2, Core.Field>
  for +key: String
  for name: String
  for value: String
  for +fallback: String
  for different: {String.eq(key, name) == False{} : Bool}
  {
    Core.lookup(Core.Field{name, value} <> rest, key, fallback)
    == Core.lookup(rest, key, fallback)
    : String
  }

# Exact framing preserves every supplied JSON fragment, including empty values.
law encode_exact:
  for +model: String
  for +state: String
  for +questions: String
  {
    Core.encode(model, state, questions)
    == "{\"model\":" ++ model ++ ",\"state\":" ++ state ++ ",\"questions\":" ++ questions ++ "}"
    : String
  }

# Production projection uses only these three lookups, never the whole input.
law project_exact:
  for +fields: List<&2, Core.Field>
  {
    Core.project(fields)
    == Core.encode(
      Core.lookup(fields, "model", "null"),
      Core.lookup(fields, "state", "null"),
      Core.lookup(fields, "questions", "null")
    )
    : String
  }

# OpenAI framing preserves every JSON fragment without extra fields.
law encode_openai_exact:
  for +model: String
  for +input: String
  for +questions: String
  {
    Core.encode_openai(model, input, questions)
    == "{\"model\":" ++ model ++ ",\"input\":" ++ input ++ ",\"questions\":" ++ questions ++ "}"
    : String
  }

# Explicit OpenAI projection selects input, never state or private fields.
law project_openai_exact:
  for +fields: List<&2, Core.Field>
  {
    Core.project_openai(fields)
    == Core.encode_openai(
      Core.lookup(fields, "model", "null"),
      Core.lookup(fields, "input", "null"),
      Core.lookup(fields, "questions", "null")
    )
    : String
  }
