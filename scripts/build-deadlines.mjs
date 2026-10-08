export const PRODUCT_COMPILATION_TIMEOUT_MS = 300_000
// Ten standalone producers at concurrency two: five two-minute waves, plus
// one minute for cached build restoration and host-module assembly.
export const PRODUCT_ASSEMBLY_TIMEOUT_MS = 660_000
// Include compilation, assembly, source inventories, validation and packing.
export const RELEASE_ARCHIVE_TIMEOUT_MS = 1_200_000
