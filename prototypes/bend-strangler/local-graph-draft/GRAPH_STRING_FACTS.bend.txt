import Base

def internal_append_nil(a: String) -> {a == String.append(a, SNil{}) : String}:
  match a:
    case SNil{}:
      {==}
    case SCon{+h, +t}:
      %internal_append_nil(t) : {SCon{h, t} == SCon{h, _} : String}
      {==}

# The empty string is a right identity for append: a ++ "" = a.
law append_nil:
  for a: String
  {String.append(a, SNil{}) == a : String}

def append_nil(a):
  Equal.sym(String, a, String.append(a, SNil{}), internal_append_nil(a))

