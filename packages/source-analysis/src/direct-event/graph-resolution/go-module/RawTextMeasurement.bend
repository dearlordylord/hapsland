import Base
import ./RawText.bend as Raw

# UTF-16 and UTF-8 measurement of observed Go text, including lone surrogates.
def utf16_acc(items: List<&2, Raw.Character>, width: Nat) -> Nat:
  match items:
    case []: width
    case Raw.Character{code, _} <> tail:
      utf16_acc(tail, Nat.add(width, Bool.pick(Nat, Nat.is_gt(code, 65535n), 2n, 1n)))

def utf16(items: List<&2, Raw.Character>) -> Nat:
  utf16_acc(items, 0n)

def byte_width(+code: Nat) -> Nat:
  Bool.pick(Nat, Nat.is_le(code, 127n), 1n,
    Bool.pick(Nat, Nat.is_le(code, 2047n), 2n,
      Bool.pick(Nat, Nat.is_le(code, 65535n), 3n, 4n)))

def bytes_acc(items: List<&2, Raw.Character>, width: Nat) -> Nat:
  match items:
    case []: width
    case Raw.Character{code, _} <> tail: bytes_acc(tail, Nat.add(width, byte_width(code)))

def bytes(items: List<&2, Raw.Character>) -> Nat:
  bytes_acc(items, 0n)

