import Base

# Values are JSON fragments encoded by the host. All top-level fields cross the
# boundary; only this production core selects the three permitted field names.
type Field is Data:
  Field{key: String, value: String}

def lookup(fields: List<&2, Field>, +key: String, fallback: String) -> String:
  match fields:
    case Nil{}: fallback
    case Field{name, value} <> rest:
      lookup(rest, key, Bool.pick(String, String.eq(key, name), value, fallback))

def encode(model: String, state: String, questions: String) -> String:
  "{\"model\":" ++ model ++ ",\"state\":" ++ state ++ ",\"questions\":" ++ questions ++ "}"

def project(+fields: List<&2, Field>) -> String:
  encode(
    lookup(fields, "model", "null"),
    lookup(fields, "state", "null"),
    lookup(fields, "questions", "null")
  )

# OpenAI has the same isolation boundary with its dedicated input field name.
def encode_openai(model: String, input: String, questions: String) -> String:
  "{\"model\":" ++ model ++ ",\"input\":" ++ input ++ ",\"questions\":" ++ questions ++ "}"

def project_openai(+fields: List<&2, Field>) -> String:
  encode_openai(
    lookup(fields, "model", "null"),
    lookup(fields, "input", "null"),
    lookup(fields, "questions", "null")
  )
