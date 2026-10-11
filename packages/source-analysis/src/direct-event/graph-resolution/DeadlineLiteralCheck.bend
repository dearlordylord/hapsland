import ../../../../source-artifacts/src/direct-event/value/Value.bend as ArtifactValue
import Base
import ./DeadlineSpecification.bend as D
def case_0() -> {D.expired(ArtifactValue.Binary64{4293918720, 0}) == False{} : Bool}:
  {==}
def case_1() -> {D.expired(ArtifactValue.Binary64{3232991232, 0}) == False{} : Bool}:
  {==}
def case_2() -> {D.expired(ArtifactValue.Binary64{2147483648, 0}) == False{} : Bool}:
  {==}
def case_3() -> {D.expired(ArtifactValue.Binary64{0, 0}) == False{} : Bool}:
  {==}
def case_4() -> {D.expired(ArtifactValue.Binary64{1072693248, 0}) == False{} : Bool}:
  {==}
def case_5() -> {D.expired(ArtifactValue.Binary64{1085507583, 4294967295}) == False{} : Bool}:
  {==}
def case_6() -> {D.expired(ArtifactValue.Binary64{1085507584, 0}) == True{} : Bool}:
  {==}
def case_7() -> {D.expired(ArtifactValue.Binary64{1085507584, 1}) == True{} : Bool}:
  {==}
def case_8() -> {D.expired(ArtifactValue.Binary64{2146435072, 0}) == True{} : Bool}:
  {==}
def case_9() -> {D.expired(ArtifactValue.Binary64{2146959360, 0}) == False{} : Bool}:
  {==}
def case_10() -> {D.expired(ArtifactValue.Binary64{4294443008, 1}) == False{} : Bool}:
  {==}
def case_11() -> {D.expired(ArtifactValue.Binary64{2146435072, 1}) == False{} : Bool}:
  {==}
def case_12() -> {D.expired(ArtifactValue.Binary64{2147483647, 4294967295}) == False{} : Bool}:
  {==}
def main() -> Unit:
  Unit{}
