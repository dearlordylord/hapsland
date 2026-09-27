import Base
import ./ImportGraph.bend as ImportGraph

def main() -> ImportGraph.Step:
  ImportGraph.step(ImportGraph.initial(),
    ImportGraph.Root{1n, 100n, 100n, 2n <> Nil{}})
