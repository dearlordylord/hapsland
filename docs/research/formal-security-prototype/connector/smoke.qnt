module smoke {
  var count: int
  var ready: bool

  action init = all {
    count' = 0,
    ready' = false,
  }

  action Inspect = all {
    count' = count + 1,
    ready' = true,
  }

  action step = any { Inspect }
}
