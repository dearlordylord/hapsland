import Base
import ./core.bend as Core

def main() -> String:
  Core.project(Core.Field{"model", "\"jev-latest\""} <> Nil{})
