import { resolve } from "node:path"
import { readPackageGraph } from "./package-graph.mjs"
import { checkBendProducerReceipt } from "./bend-producer.mjs"

const root = resolve(import.meta.dirname, "..")
const producers = [...readPackageGraph(root).packages.values()].filter((node) => node.compiler === "bend")
if (!producers.length) throw new Error("Production Bend authority has no declared producer")
for (const producer of producers) checkBendProducerReceipt(root, producer)
