function defense_numeric_output(values) {
  const pieces = ["["];
  let comma = false;
  while (values.$ === CID(Con)) {
    if (comma) pieces.push(",");
    pieces.push(String(values.head));
    comma = true;
    values = values.tail;
  }
  pieces.push("]\n");
  io_out(1, new TextEncoder().encode(pieces.join("")));
  return { $: CID(Unit) };
}
io_eff(CID(write), defense_numeric_output);
