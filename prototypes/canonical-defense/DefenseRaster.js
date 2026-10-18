function defense_rasterize(rectangles) {
  const ordered = [];
  while (rectangles.$ === CID(Con)) {
    ordered.push(rectangles.head);
    rectangles = rectangles.tail;
  }
  const pixels = new Uint32Array(1024 * 1024).fill(1058076);
  for (let i = ordered.length - 1; i >= 0; i--) {
    const r = ordered[i], right = Math.min(1024, (r.x + r.w) >>> 0), bottom = Math.min(1024, (r.y + r.h) >>> 0);
    if (right <= r.x || bottom <= r.y) continue;
    for (let y = r.y; y < bottom; y++) pixels.fill(r.color, y * 1024 + r.x, y * 1024 + right);
  }
  function tree(x, y, size) {
    const color = pixels[y * 1024 + x];
    for (let row = y; row < y + size; row++) for (let col = x; col < x + size; col++) {
      if (pixels[row * 1024 + col] !== color) {
        const half = size / 2;
        return { $: CID(Qua), tl: tree(x, y, half), tr: tree(x + half, y, half), bl: tree(x, y + half, half), br: tree(x + half, y + half, half) };
      }
    }
    return { $: CID(Pix), color };
  }
  return tree(0, 0, 1024);
}
io_eff(CID(rasterize), defense_rasterize);
