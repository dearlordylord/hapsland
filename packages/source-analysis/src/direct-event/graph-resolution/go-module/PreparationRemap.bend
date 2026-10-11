import Base
import ../Types.bend as T
import ../traversal/core.bend as Local
import ./PreparationModel.bend as M
import ./ArtifactProtocol.bend as GoBoundary
import ./PreparationData.bend as D
import ./Package.bend as P
import ./Input.bend as U

type Binding is Data:
  Binding{file: String, name: String, target: Maybe<&2, String>}
type Demand is Data:
  Demand{key: String, targets: List<&2, String>}
type Assembly is Data:
  Assembly{
    declarations: List<&2, GoBoundary.BoundDeclaration>,
    demands: List<&2, Demand>,
    foreign: List<&2, String>
  }

def key(+root: String, +directory: String, +name: String) -> String:
  Bool.pick(
    String,
    String.eq(root, directory),
    name,
    String.append(directory, String.append("::", name))
  )

def facts_declarations(+facts: P.PackageResult) -> List<&2, P.Declaration>:
  match facts:
    case P.Refused{}: []
    case P.PackageFacts{+items, _, _}: items

def facts_types(+facts: P.PackageResult) -> List<&2, P.ConstantTypes>:
  match facts:
    case P.Refused{}: []
    case P.PackageFacts{_, _, +items}: items

def declaration(+items: List<&2, P.Declaration>, +name: String) -> Maybe<&2, P.Declaration>:
  match items:
    case []: None{}
    case +head <> +tail: Bool.pick(
      Maybe<&2, P.Declaration>,
      String.eq(P.declaration_key(head), name),
      Some{head},
      declaration(tail, name)
    )

def exported(+value: Maybe<&2, P.Declaration>) -> Bool:
  match value:
    case Some{P.Declaration{T.FactDeclaration{_, _, _, +value}, _}}: value
    case None{}: False{}

def constants_groups(+groups: List<&2, T.GoConstantFacts>, +member: String) -> Maybe<&2, String>:
  match groups:
    case []: None{}
    case T.GoConstantFacts{+name, +names, _} <> +tail:
      Bool.pick(Maybe<&2, String>, D.has(names, member), Some{name}, constants_groups(tail, member))

def prefer_name(+first: Maybe<&2, String>, +rest: Maybe<&2, String>) -> Maybe<&2, String>:
  match first:
    case None{}: rest
    case Some{+name}: Some{name}

def constants(+items: List<&2, T.GoFileSyntax>, +member: String) -> Maybe<&2, String>:
  match items:
    case []: None{}
    case T.GoFileSyntax{_, _, _, _, _, _, _, +groups, _, _, _, _, _} <> +tail:
      prefer_name(constants_groups(groups, member), constants(tail, member))

def binding_targets(
  +items: List<&2, Binding>,
  +file: String,
  +name: String
) -> List<&2, Maybe<&2, String>>:
  match items:
    case []: []
    case Binding{+path, +alias, +target} <> +tail:
      Bool.pick(
        List<&2, Maybe<&2, String>>,
        Bool.and(String.eq(path, file), String.eq(alias, name)),
        target <> binding_targets(tail, file, name),
        binding_targets(tail, file, name)
      )

def unique_target(+items: List<&2, Maybe<&2, String>>) -> Maybe<&2, String>:
  match items:
    case +value <> []: value
    case _: None{}

def shadowed(+files: List<&2, T.GoFileSyntax>, +name: String) -> Bool:
  match files:
    case []: False{}
    case T.GoFileSyntax{_, _, _, _, _, _, _, _, +bindings, _, _, _, _} <> +tail: Bool.or(
      D.has(bindings, name),
      shadowed(tail, name)
    )

def uppercase(+chars: List<&2, U.Character>) -> Bool:
  match chars:
    case U.Character{_, _, _, +upper} <> _: upper
    case []: False{}

def bound(+reference: T.FactReference, +binding: String) -> T.FactReference:
  match reference:
    case T.FactReference{_, +name, +expected, +target}: T.FactReference{
      Local.BoundNamed{binding},
      name,
      expected,
      target
    }

def foreign_selected(
  +allowed: Bool,
  +root: String,
  +directory: String,
  +name: String,
  +reference: T.FactReference
) -> T.FactReference:
  match allowed:
    case False{}: reference
    case True{}: bound(reference, key(root, directory, name))

def foreign_member(
  +root: String,
  +directory: String,
  +member: String,
  +files: List<&2, T.GoFileSyntax>,
  +facts: P.PackageResult,
  +reference: T.FactReference,
  +spellings: List<&2, U.Spelling>
) -> T.FactReference:
  +constant = constants(files, member)
  +name = D.optional_text(constant, member)
  foreign_selected(
    Bool.or(
      exported(declaration(facts_declarations(facts), name)),
      Bool.and(D.present_string(constant), uppercase(U.characters(spellings, member)))
    ),
    root,
    directory,
    name,
    reference
  )

def foreign_loaded(
  +root: String,
  +directory: String,
  +loaded: Maybe<&2, M.LoadedPackage>,
  +reference: T.FactReference,
  +member: String,
  +spellings: List<&2, U.Spelling>
) -> T.FactReference:
  match loaded:
    case None{}: reference
    case Some{M.LoadedPackage{+files, +facts, _}}: foreign_member(
      root,
      directory,
      member,
      files,
      facts,
      reference,
      spellings
    )

def foreign_package(
  +root: String,
  +target: Maybe<&2, String>,
  +packages: List<&2, M.PackageEntry>,
  +reference: T.FactReference,
  +member: String,
  +spellings: List<&2, U.Spelling>
) -> T.FactReference:
  match target:
    case None{}: reference
    case Some{+directory}: foreign_loaded(
      root,
      directory,
      D.loaded(D.package_entry(packages, directory)),
      reference,
      member,
      spellings
    )

def qualified_parts(
  +parts: List<&2, String>,
  +root: String,
  +files: List<&2, T.GoFileSyntax>,
  +origin: String,
  +bindings: List<&2, Binding>,
  +packages: List<&2, M.PackageEntry>,
  +reference: T.FactReference,
  +spellings: List<&2, U.Spelling>
) -> T.FactReference:
  match parts:
    case +qualifier <> +member <> []:
      Bool.pick(
        T.FactReference,
        shadowed(files, qualifier),
        reference,
        foreign_package(
          root,
          unique_target(binding_targets(bindings, origin, qualifier)),
          packages,
          reference,
          member,
          spellings
        )
      )
    case _: reference

def reference(
  +root: String,
  +directory: String,
  +files: List<&2, T.GoFileSyntax>,
  +origin: String,
  +bindings: List<&2, Binding>,
  +packages: List<&2, M.PackageEntry>,
  +item: T.FactReference,
  +spellings: List<&2, U.Spelling>
) -> T.FactReference:
  match item:
    case T.FactReference{Local.Named{}, +name, _, _}: bound(item, key(root, directory, name))
    case T.FactReference{Local.Unsupported{}, +name, _, _}:
      Bool.pick(
        T.FactReference,
        U.qualified(spellings, name),
        qualified_parts(
          String.split(name, '.'),
          root,
          files,
          origin,
          bindings,
          packages,
          item,
          spellings
        ),
        item
      )
    case _: item

def references(
  +items: List<&2, T.FactReference>,
  +root: String,
  +directory: String,
  +files: List<&2, T.GoFileSyntax>,
  +origin: String,
  +bindings: List<&2, Binding>,
  +packages: List<&2, M.PackageEntry>,
  +spellings: List<&2, U.Spelling>
) -> List<&2, T.FactReference>:
  match items:
    case []: []
    case +head <> +tail: reference(
      root,
      directory,
      files,
      origin,
      bindings,
      packages,
      head,
      spellings
    ) <> references(tail, root, directory, files, origin, bindings, packages, spellings)

def replace_references(
  +value: P.Declaration,
  +references: List<&2, T.FactReference>
) -> P.Declaration:
  match value:
    case P.Declaration{T.FactDeclaration{+key, +artifact, _, +exported}, +location}: P.Declaration{
      T.FactDeclaration{key, artifact, references, exported},
      location
    }

def declaration_refs(+value: P.Declaration) -> List<&2, T.FactReference>:
  match value:
    case P.Declaration{T.FactDeclaration{_, _, +references, _}, _}: references

def set_declaration(
  +items: List<&2, GoBoundary.BoundDeclaration>,
  +key: String,
  +value: P.Declaration
) -> List<&2, GoBoundary.BoundDeclaration>:
  match items:
    case []: [GoBoundary.BoundDeclaration{key, value}]
    case +head <> +tail:
      match head:
        case GoBoundary.BoundDeclaration{+name, _}: Bool.pick(
          List<&2, GoBoundary.BoundDeclaration>,
          String.eq(name, key),
          GoBoundary.BoundDeclaration{key, value} <> tail,
          head <> set_declaration(tail, key, value)
        )

def find_bound(
  +items: List<&2, GoBoundary.BoundDeclaration>,
  +key: String
) -> Maybe<&2, P.Declaration>:
  match items:
    case []: None{}
    case GoBoundary.BoundDeclaration{+name, +value} <> +tail: Bool.pick(
      Maybe<&2, P.Declaration>,
      String.eq(name, key),
      Some{value},
      find_bound(tail, key)
    )

def demands(+items: List<&2, Demand>, +key: String) -> List<&2, String>:
  match items:
    case []: []
    case Demand{+name, +values} <> +tail: Bool.pick(
      List<&2, String>,
      String.eq(name, key),
      values,
      demands(tail, key)
    )

def main() -> Unit:
  Unit{}

type Environment is Data:
  Environment{
    root: String,
    packages: List<&2, M.PackageEntry>,
    bindings: List<&2, Binding>,
    spellings: List<&2, U.Spelling>
  }
type Region is Data:
  Region{directory: String, files: List<&2, T.GoFileSyntax>, facts: P.PackageResult}

def remap(
  +env: Environment,
  +region: Region,
  +origin: String,
  +item: T.FactReference
) -> T.FactReference:
  match env region:
    case Environment{+root, +packages, +bindings, +spellings} Region{+directory, +files, _}:
      reference(root, directory, files, origin, bindings, packages, item, spellings)

def remap_list(
  +items: List<&2, T.FactReference>,
  +env: Environment,
  +region: Region,
  +origin: String
) -> List<&2, T.FactReference>:
  match items:
    case []: []
    case +head <> +tail: remap(env, region, origin, head) <> remap_list(tail, env, region, origin)

def region_key(+env: Environment, +region: Region, +name: String) -> String:
  match env region:
    case Environment{+root, _, _, _} Region{+directory, _, _}: key(root, directory, name)

def region_find(+region: Region, +name: String) -> Maybe<&2, P.Declaration>:
  match region:
    case Region{_, _, +facts}: declaration(facts_declarations(facts), name)

def declaration_found(
  +value: Maybe<&2, P.Declaration>,
  +env: Environment,
  +region: Region,
  +origin: String,
  +assembly: Assembly
) -> Assembly:
  match value assembly:
    case None{} +assembly: assembly
    case Some{+value} Assembly{+declarations, +demands, +foreign}:
      Assembly{
        set_declaration(
          declarations,
          region_key(env, region, P.declaration_key(value)),
          replace_references(value, remap_list(declaration_refs(value), env, region, origin))
        ),
        demands,
        foreign
      }

def insert_declarations(
  +items: List<&2, T.FactDeclaration>,
  +env: Environment,
  +region: Region,
  +origin: String,
  +assembly: Assembly
) -> Assembly:
  match items:
    case []: assembly
    case +head <> +tail: insert_declarations(
      tail,
      env,
      region,
      origin,
      declaration_found(
        region_find(region, P.declaration_name(head)),
        env,
        region,
        origin,
        assembly
      )
    )

def types_lookup(+items: List<&2, P.ConstantTypes>, +wanted: String) -> List<&2, P.Inferred>:
  match items:
    case []: []
    case P.ConstantTypes{+name, +values} <> +tail: Bool.pick(
      List<&2, P.Inferred>,
      String.eq(name, wanted),
      values,
      types_lookup(tail, wanted)
    )

def inferred_values(+region: Region, +name: String) -> List<&2, P.Inferred>:
  match region:
    case Region{_, _, +facts}: types_lookup(facts_types(facts), name)

def file_exists(+files: List<&2, T.GoFileSyntax>, +path: String) -> Bool:
  match files:
    case []: False{}
    case +head <> +tail: Bool.or(String.eq(P.file_path(head), path), file_exists(tail, path))

def inferred_name(+item: P.Inferred) -> String:
  match item:
    case P.LocalType{+name}: name
    case P.QualifiedType{+name, _}: name

def inferred_origin(+item: P.Inferred, +origin: String) -> String:
  match item:
    case P.LocalType{_}: origin
    case P.QualifiedType{_, +path}: path

def named_target(+item: T.FactReference) -> List<&2, String>:
  match item:
    case T.FactReference{Local.BoundNamed{+binding}, _, _, _}: [binding]
    case T.FactReference{Local.Named{}, +name, _, _}: [name]
    case _: []

def inferred_reference(+name: String) -> T.FactReference:
  T.FactReference{
    Bool.pick(Local.ReferenceKind, String.contains(name, "."), Local.Unsupported{}, Local.Named{}),
    name,
    Local.AnyKind{},
    None{}
  }

def inferred_demand(
  +item: P.Inferred,
  +env: Environment,
  +region: Region,
  +origin: String
) -> List<&2, String>:
  match region:
    case Region{_, +files, _}:
      Bool.pick(
        List<&2, String>,
        file_exists(files, inferred_origin(item, origin)),
        named_target(
          remap(env, region, inferred_origin(item, origin), inferred_reference(inferred_name(item)))
        ),
        []
      )

def all_demands(
  +items: List<&2, P.Inferred>,
  +env: Environment,
  +region: Region,
  +origin: String
) -> List<&2, String>:
  match items:
    case []: []
    case +head <> +tail: List.append(
      &2,
      String,
      inferred_demand(head, env, region, origin),
      all_demands(tail, env, region, origin)
    )

def has_foreign(+items: List<&2, P.Inferred>) -> Bool:
  match items:
    case []: False{}
    case +head <> +tail: Bool.or(String.contains(inferred_name(head), "."), has_foreign(tail))

def set_demand(
  +items: List<&2, Demand>,
  +key: String,
  +targets: List<&2, String>
) -> List<&2, Demand>:
  match items:
    case []: [Demand{key, targets}]
    case +head <> +tail:
      match head:
        case Demand{+name, _}: Bool.pick(
          List<&2, Demand>,
          String.eq(name, key),
          Demand{key, targets} <> tail,
          head <> set_demand(tail, key, targets)
        )

def insert_group(
  +key: String,
  +values: List<&2, P.Inferred>,
  +env: Environment,
  +region: Region,
  +origin: String,
  +assembly: Assembly
) -> Assembly:
  match assembly:
    case Assembly{+declarations, +demands, +foreign}:
      Assembly{
        declarations,
        set_demand(demands, key, all_demands(values, env, region, origin)),
        Bool.pick(List<&2, String>, has_foreign(values), D.add(foreign, key), foreign)
      }

def insert_groups(
  +items: List<&2, T.FactDeclaration>,
  +env: Environment,
  +region: Region,
  +origin: String,
  +assembly: Assembly
) -> Assembly:
  match items:
    case []: assembly
    case +head <> +tail:
      +name = P.declaration_name(head)
      insert_groups(
        tail,
        env,
        region,
        origin,
        insert_group(
          region_key(env, region, name),
          inferred_values(region, name),
          env,
          region,
          origin,
          assembly
        )
      )

def assemble_files(
  +items: List<&2, T.GoFileSyntax>,
  +env: Environment,
  +region: Region,
  +assembly: Assembly
) -> Assembly:
  match items:
    case []: assembly
    case T.GoFileSyntax{+path, _, +types, _, +constants, _, _, _, _, _, _, _, _} <> +tail:
      assemble_files(
        tail,
        env,
        region,
        insert_declarations(
          List.append(&2, T.FactDeclaration, types, constants),
          env,
          region,
          path,
          insert_groups(constants, env, region, path, assembly)
        )
      )

def assemble_packages(
  +items: List<&2, M.PackageEntry>,
  +env: Environment,
  +assembly: Assembly
) -> Assembly:
  match items:
    case []: assembly
    case M.PackageEntry{_, None{}} <> +tail: assemble_packages(tail, env, assembly)
    case M.PackageEntry{+directory, Some{M.LoadedPackage{+files, +facts, _}}} <> +tail:
      assemble_packages(
        tail,
        env,
        assemble_files(files, env, Region{directory, files, facts}, assembly)
      )

def build(
  +root: String,
  +packages: List<&2, M.PackageEntry>,
  +bindings: List<&2, Binding>,
  +spellings: List<&2, U.Spelling>
) -> Assembly:
  assemble_packages(
    packages,
    Environment{root, packages, bindings, spellings},
    Assembly{[], [], []}
  )

def is_constant(+value: P.Declaration) -> Bool:
  match value:
    case P.Declaration{
      T.FactDeclaration{_, T.Artifact{_, _, _, T.ConstantGroupArtifact{}, _, _, _, _}, _, _},
      _
    }: True{}
    case _: False{}

def has_binding(+items: List<&2, T.FactReference>, +binding: String) -> Bool:
  match items:
    case []: False{}
    case T.FactReference{Local.BoundNamed{+target}, _, _, _} <> +tail: Bool.or(
      String.eq(target, binding),
      has_binding(tail, binding)
    )
    case _ <> +tail: has_binding(tail, binding)

def reverse_reference(
  +target: P.Declaration,
  +group: P.Declaration,
  +binding: String
) -> P.Declaration:
  match group:
    case P.Declaration{T.FactDeclaration{_, T.Artifact{_, _, _, _, +name, _, _, _}, _, _}, _}:
      Bool.pick(
        P.Declaration,
        has_binding(declaration_refs(target), binding),
        target,
        replace_references(
          target,
          List.append(
            &2,
            T.FactReference,
            declaration_refs(target),
            [T.FactReference{Local.BoundNamed{binding}, name, Local.AnyKind{}, None{}}]
          )
        )
      )

type FileRegion is Data:
  FileRegion{directory: String, file: T.GoFileSyntax}
type BindingCursor is Data:
  BindingCursor{
    directory: String,
    path: String,
    imports: List<&2, T.GoImport>,
    remaining: List<&2, FileRegion>,
    bindings: List<&2, Binding>
  }
type ReverseCursor is Data:
  ReverseCursor{
    assembly: Assembly,
    remaining: List<&2, String>,
    group: String,
    pending: List<&2, String>,
    visited: List<&2, String>
  }

def file_regions(+files: List<&2, T.GoFileSyntax>, +directory: String) -> List<&2, FileRegion>:
  match files:
    case []: []
    case +head <> +tail: FileRegion{directory, head} <> file_regions(tail, directory)

def all_files(+packages: List<&2, M.PackageEntry>) -> List<&2, FileRegion>:
  match packages:
    case []: []
    case M.PackageEntry{_, None{}} <> +tail: all_files(tail)
    case M.PackageEntry{+directory, Some{M.LoadedPackage{+files, _, _}}} <> +tail: List.append(
      &2,
      FileRegion,
      file_regions(files, directory),
      all_files(tail)
    )

def reference_names(+items: List<&2, T.FactReference>) -> List<&2, String>:
  match items:
    case []: []
    case T.FactReference{_, +name, _, _} <> +tail: name <> List.append(
      &2,
      String,
      String.split(name, '.'),
      reference_names(tail)
    )

def declaration_names(+items: List<&2, P.Declaration>) -> List<&2, String>:
  match items:
    case []: []
    case +head <> +tail: List.append(
      &2,
      String,
      reference_names(declaration_refs(head)),
      declaration_names(tail)
    )

def inferred_names(+items: List<&2, P.Inferred>) -> List<&2, String>:
  match items:
    case []: []
    case +head <> +tail:
      +name = inferred_name(head)
      name <> List.append(&2, String, String.split(name, '.'), inferred_names(tail))

def constants_names(+items: List<&2, P.ConstantTypes>) -> List<&2, String>:
  match items:
    case []: []
    case P.ConstantTypes{_, +values} <> +tail: List.append(
      &2,
      String,
      inferred_names(values),
      constants_names(tail)
    )

def package_spellings(+packages: List<&2, M.PackageEntry>) -> List<&2, String>:
  match packages:
    case []: []
    case M.PackageEntry{_, None{}} <> +tail: package_spellings(tail)
    case M.PackageEntry{_, Some{M.LoadedPackage{_, +facts, _}}} <> +tail:
      List.append(
        &2,
        String,
        declaration_names(facts_declarations(facts)),
        List.append(&2, String, constants_names(facts_types(facts)), package_spellings(tail))
      )

def start_reverse(+assembly: Assembly) -> ReverseCursor:
  match assembly:
    case Assembly{_, _, +foreign}: ReverseCursor{assembly, foreign, "", [], []}

def reverse_assembly(+cursor: ReverseCursor) -> Assembly:
  match cursor:
    case ReverseCursor{+assembly, _, _, _, _}: assembly

def assembled_declarations(+assembly: Assembly) -> List<&2, GoBoundary.BoundDeclaration>:
  match assembly:
    case Assembly{+items, _, _}: items

def assembly_demands(+assembly: Assembly, +key: String) -> List<&2, String>:
  match assembly:
    case Assembly{_, +items, _}: demands(items, key)

def reverse_update(
  +cursor: ReverseCursor,
  +target_key: String,
  +target: P.Declaration,
  +group: P.Declaration
) -> ReverseCursor:
  match cursor:
    case ReverseCursor{
      Assembly{+declarations, +demand_items, +foreign},
      +remaining,
      +group_key,
      +pending,
      +visited
    }:
      Bool.pick(
        ReverseCursor,
        is_constant(target),
        ReverseCursor{
          Assembly{declarations, demand_items, foreign},
          remaining,
          group_key,
          List.append(&2, String, pending, demands(demand_items, target_key)),
          visited
        },
        ReverseCursor{
          Assembly{
            set_declaration(declarations, target_key, reverse_reference(target, group, group_key)),
            demand_items,
            foreign
          },
          remaining,
          group_key,
          pending,
          visited
        }
      )
