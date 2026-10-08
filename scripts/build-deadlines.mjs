export const PRODUCT_COMPILATION_TIMEOUT_MS = 300_000
// A real CLI producer took 165.6 seconds on the supported macOS arm64 host.
export const STANDALONE_PRODUCER_TIMEOUT_MS = 240_000
// Ten standalone producers at concurrency two: five four-minute waves, plus
// one minute for cached build restoration and host-module assembly.
export const PRODUCT_ASSEMBLY_TIMEOUT_MS = 5 * STANDALONE_PRODUCER_TIMEOUT_MS + 60_000
// Include compilation, assembly, source inventories, validation and packing.
export const RELEASE_ARCHIVE_TIMEOUT_MS = 1_800_000
