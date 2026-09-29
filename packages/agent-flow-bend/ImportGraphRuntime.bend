import Base
import ./ImportGraph.bend as ImportGraph

# Keep local_budget reachable so the generated runtime exports it.
def main() -> ImportGraph.BoundedStep:
  Bool.pick(ImportGraph.BoundedStep, ImportGraph.local_budget(ImportGraph.Limits{1n, 262144n, 20480n, 8n, 1572864n, 16n, 4n, 128n}, 1n, 1n, 1n, 1n),
    ImportGraph.bounded_step(ImportGraph.bounded_initial(ImportGraph.Limits{1n, 262144n, 20480n, 8n,
    1572864n, 16n, 4n, 128n}),
    ImportGraph.Root{1n, 100n, 100n, 0n, 2n <> Nil{}}),
    ImportGraph.bounded_step(ImportGraph.bounded_initial(ImportGraph.Limits{1n, 262144n, 20480n, 8n, 1572864n, 16n, 4n, 128n}), ImportGraph.Next{}))
