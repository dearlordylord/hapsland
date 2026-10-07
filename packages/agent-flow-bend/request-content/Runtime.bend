import Base
import ./core.bend as Core

def main() -> String:
  Core.project(Core.Field{"model", Core.project_openai(Nil{})} <> Nil{})
