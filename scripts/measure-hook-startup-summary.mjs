export const summarizeStartup = (samples, { baseline, candidate, relativeThreshold, absoluteThresholdMs }) => {
  if (!(relativeThreshold >= 0) || !(absoluteThresholdMs >= 0)) throw new Error("invalid regression thresholds")
  const result = []
  for (const mode of ["healthy-resident", "cold-resident"]) {
    for (const metric of ["handlerReadyMs", "elapsedMs"]) {
      const summaries = {}
      for (const variant of [baseline, candidate]) {
        const selected = samples.filter((sample) => sample.variant === variant && sample.mode === mode)
        const values = selected.filter((sample) => sample.status === "registered").map((sample) => sample[metric])
        if (!values.length || values.some((value) => !Number.isFinite(value) || value < 0))
          throw new Error(`missing valid ${variant}/${mode}/${metric} observations`)
        values.sort((a, b) => a - b)
        const middle = Math.floor(values.length / 2)
        summaries[variant] = {
          observations: values.length,
          failures: selected.length - values.length,
          medianMs: values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2,
          minimumMs: values[0],
          maximumMs: values.at(-1),
          rangeMs: values.at(-1) - values[0]
        }
      }
      const differenceMs = summaries[candidate].medianMs - summaries[baseline].medianMs
      const baselineMedian = summaries[baseline].medianMs
      result.push({
        mode,
        metric,
        summaries,
        differenceMs,
        relativeDifference: baselineMedian === 0 ? null : differenceMs / baselineMedian,
        materialRegression: differenceMs > absoluteThresholdMs && differenceMs > baselineMedian * relativeThreshold
      })
    }
  }
  return result
}
