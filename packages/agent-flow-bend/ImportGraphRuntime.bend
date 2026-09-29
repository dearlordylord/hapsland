import Base
import ./ImportGraph.bend as ImportGraph

def main() -> ImportGraph.BoundedStep:
  ImportGraph.bounded_step(ImportGraph.bounded_initial(ImportGraph.Limits{1n, 262144n, 20480n, 8n,
    1572864n, 16n, 4n, 128n}),
    ImportGraph.Root{1n, 100n, 100n, 2n <> Nil{}})
