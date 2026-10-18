// Frontmost rectangle wins. Only pixel production crosses this IO boundary.
typedef struct { u32 x, y, right, bottom, color; } DefenseRasterRect;

static Term defense_raster_tree(Env e, const u32* pixels, u32 x, u32 y, u32 size) {
  u32 color = pixels[y * 1024 + x];
  for (u32 row = y; row < y + size; row++) {
    for (u32 col = x; col < x + size; col++) {
      if (pixels[row * 1024 + col] != color) {
        u32 half = size / 2;
        Term children[4];
        for (u32 i = 0; i < 4; i++) {
          children[i] = defense_raster_tree(e, pixels, x + (i % 2) * half, y + (i / 2) * half, half);
        }
        u64 location = heap_alloc(e, cls_fit(4));
        for (u32 i = 0; i < 4; i++) e.mem[location + i] = io_seal(e, children[i], CID(Qua));
        return term_ctr(CID(Qua), location);
      }
    }
  }
  return term_pak(CID(Pix), color);
}

Term defense_rasterize_run(Env e, Term* f, IoWork* w) {
  u64 count = 0, capacity = 256;
  DefenseRasterRect* rectangles = io_mem(malloc(capacity * sizeof(*rectangles)));
  Term list = f[0];
  while (term_aux(list) == CID(Con)) {
    Term pair[2], fields[5];
    spare_free(e, cls_fit(2), ctr_take(e, list, 2, pair));
    spare_free(e, cls_fit(5), ctr_take(e, pair[0], 5, fields));
    if (count == capacity) {
      capacity *= 2;
      rectangles = io_mem(realloc(rectangles, capacity * sizeof(*rectangles)));
    }
    u32 x = fields[0], y = fields[1];
    rectangles[count++] = (DefenseRasterRect){x, y, x + (u32)fields[2], y + (u32)fields[3], (u32)fields[4]};
    list = pair[1];
  }
  u32* pixels = io_mem(malloc(1024 * 1024 * sizeof(*pixels)));
  for (u32 i = 0; i < 1024 * 1024; i++) pixels[i] = 1058076;
  while (count) {
    DefenseRasterRect r = rectangles[--count];
    u32 right = r.right < 1024 ? r.right : 1024;
    u32 bottom = r.bottom < 1024 ? r.bottom : 1024;
    for (u32 y = r.y; y < bottom; y++) {
      for (u32 x = r.x; x < right; x++) pixels[y * 1024 + x] = r.color;
    }
  }
  free(rectangles);
  Term image = defense_raster_tree(e, pixels, 0, 0, 1024);
  free(pixels);
  return image;
}

static void __attribute__((constructor)) defense_rasterize_use(void) {
  io_eff(CID(rasterize), defense_rasterize_run);
}
