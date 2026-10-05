// Consume the same owned List<Nat> as io_cbuf; no String/Nat.show intermediate.
Term defense_numeric_output_run(Env e, Term* f, IoWork* w) {
  uint64_t cap = 64, n = 0;
  char* buf = io_mem(malloc(cap));
  Term values = f[0];
  buf[n++] = '[';
  int comma = 0;
  while (term_aux(values) == CID(Con)) {
    Term fields[2];
    spare_free(e, cls_fit(2), ctr_take(e, values, 2, fields));
    if (n + 32 > cap) {
      cap *= 2;
      buf = io_mem(realloc(buf, cap));
    }
    if (comma) buf[n++] = ',';
    n += snprintf(buf + n, cap - n, "%llu", (unsigned long long)fields[0]);
    comma = 1;
    values = fields[1];
  }
  buf[n++] = ']';
  buf[n++] = '\n';
  io_out(stdout, buf, n);
  free(buf);
  return term_pak(CID(Unit), 0);
}
static void __attribute__((constructor)) defense_numeric_output_use(void) {
  io_eff(CID(write), defense_numeric_output_run, 0);
}
