import Base
import ./AttachmentOriginRenderingMutantCore.bend as Core
import ../ForestSpecification.bend as F
import ../Types.bend as T

# Private transports for projected_unit_total. No runtime representation or
# separate migration frontier; they pin the full ordered origin fields.
# Origin text and the requested field order are arbitrary typed inputs.

def fixture_origin() -> T.BundledOrigin:
  T.BundledOrigin{String.append("v", SCon{Chr{55296}, SNil{}}), "s\0", String.append("m", SCon{Chr{55357}, SCon{Chr{56832}, SNil{}}}), "d", Nil{}}

def literal_field_0() -> {Core.origin_field(fixture_origin(), T.OriginKindKey{}) == F.origin_field(T.OriginKindKey{}, fixture_origin()) : T.OrderedField<T.ProductValue>}:
  {==}

def literal_field_1() -> {Core.origin_field(fixture_origin(), T.LibraryKey{}) == F.origin_field(T.LibraryKey{}, fixture_origin()) : T.OrderedField<T.ProductValue>}:
  {==}

def literal_field_2() -> {Core.origin_field(fixture_origin(), T.CompilerVersionKey{}) == F.origin_field(T.CompilerVersionKey{}, fixture_origin()) : T.OrderedField<T.ProductValue>}:
  {==}

def literal_field_3() -> {Core.origin_field(fixture_origin(), T.CompilerSourceKey{}) == F.origin_field(T.CompilerSourceKey{}, fixture_origin()) : T.OrderedField<T.ProductValue>}:
  {==}

def literal_field_4() -> {Core.origin_field(fixture_origin(), T.ModuleHashKey{}) == F.origin_field(T.ModuleHashKey{}, fixture_origin()) : T.OrderedField<T.ProductValue>}:
  {==}

def literal_field_5() -> {Core.origin_field(fixture_origin(), T.DeclarationHashKey{}) == F.origin_field(T.DeclarationHashKey{}, fixture_origin()) : T.OrderedField<T.ProductValue>}:
  {==}

def literal_fields_0() -> {Core.origin_fields(fixture_origin(), Nil{}) == F.origin_fields(Nil{}, fixture_origin()) : List<&2, T.OrderedField<T.ProductValue>>}:
  {==}

def literal_fields_1() -> {Core.origin_fields(fixture_origin(), [T.CompilerSourceKey{}, T.OriginKindKey{}, T.CompilerSourceKey{}]) == F.origin_fields([T.CompilerSourceKey{}, T.OriginKindKey{}, T.CompilerSourceKey{}], fixture_origin()) : List<&2, T.OrderedField<T.ProductValue>>}:
  {==}

def literal_fields_2() -> {Core.origin_fields(fixture_origin(), [T.DeclarationHashKey{}, T.ModuleHashKey{}, T.CompilerSourceKey{}, T.CompilerVersionKey{}, T.LibraryKey{}, T.OriginKindKey{}]) == F.origin_fields([T.DeclarationHashKey{}, T.ModuleHashKey{}, T.CompilerSourceKey{}, T.CompilerVersionKey{}, T.LibraryKey{}, T.OriginKindKey{}], fixture_origin()) : List<&2, T.OrderedField<T.ProductValue>>}:
  {==}

def main() -> Unit:
  Unit{}
