// Apple clang 21.0.0, Darwin ARM64: preserve_none puts a22 in x9; Darwin
// stack probing for this frame clobbers it before the body reads it.
// clang -O3 -fstack-check -c apple-clang21-stack-probe.c crashes with
// "live register clobbered by inserted prologue instructions".
// -fno-stack-check compiles; so do dropping preserve_none, using a21 instead
// of a22, or reducing the buffer to 1024 bytes (mask 1023).
// Apple symptom: https://github.com/bendlang/bend/issues/1233
// This does not claim equivalence to that issue's Linux register-spill error.
// Remove this reproduction after the selected Apple compiler is fixed and
// the successful native build evidence is consolidated in ../README.md.
__attribute__((preserve_none))
unsigned long repro(unsigned long a0,
    unsigned long a1,
    unsigned long a2,
    unsigned long a3,
    unsigned long a4,
    unsigned long a5,
    unsigned long a6,
    unsigned long a7,
    unsigned long a8,
    unsigned long a9,
    unsigned long a10,
    unsigned long a11,
    unsigned long a12,
    unsigned long a13,
    unsigned long a14,
    unsigned long a15,
    unsigned long a16,
    unsigned long a17,
    unsigned long a18,
    unsigned long a19,
    unsigned long a20,
    unsigned long a21,
    unsigned long a22) {
    volatile unsigned char buffer[4096];
    buffer[a0 & 4095] = 1;
    return buffer[a0 & 4095] + a22;
}
