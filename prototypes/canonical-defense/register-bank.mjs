// CPU-only lowering of Bend's uniform musttail register arguments. Each work
// loop owns one bank; segments capture their inputs before WL_OPEN and update
// the same outgoing words. No heap objects, task scheduling or owner data change.
// The emitted dialect is checked exactly; an unknown layout fails closed.
export const registerBankStamp = "// Hapsland CPU register bank: "

export function lowerHostRegisterBank(source) {
  const name = "hapsland_register_bank"
  if (source.includes(name) || source.includes(registerBankStamp)) throw new Error("Register bank already lowered or name collision")
  const macro = (key) => {
    const lines = [...source.matchAll(new RegExp(`^#define ${key} (.*)$`, "gm"))]
    if (lines.length !== 1) throw new Error(`Unsupported Bend register macro ${key}`)
    return lines[0]
  }
  const bank = macro("WL_BANK")
  const fields = /^Term (r\d+(?:, (?:r\d+|rp))*);$/.exec(bank[1])?.[1]?.split(", ")
  if (!fields?.length || fields.length > 257 || new Set(fields).size !== fields.length)
    throw new Error("Unsupported Bend register bank fields")
  const registers = fields.filter((field) => field !== "rp")
  if (registers.some((field, index) => field !== `r${index}`) ||
      (registers.length > 6 ? fields[6] !== "rp" : fields.includes("rp")))
    throw new Error("Unsupported Bend register bank ordering")
  const signature = macro("WL_SIG"), args = macro("WL_ALL")
  if (signature[1] !== `Env e, DEV Term* sp, u32 seq, u32 rn, ${fields.map((field) => `Term ${field}`).join(", ")}` ||
      args[1] !== `e, sp, seq, rn, ${fields.join(", ")}`)
    throw new Error("Unsupported Bend register signature")
  const open = "#define WL_OPEN    { WL_BANK u32 rn;"
  const marker = "#if !DEVICE\n#undef  WL_SPIN"
  if (source.split(open).length !== 2 || source.split(marker).length !== 2 ||
      !source.includes("  return WL_FID_ENTER(WL_ALL);"))
    throw new Error("Unsupported Bend host work-loop layout")
  const aliases = fields.map((field, index) => `#define ${field} ${name}[${index}]`).join("\n")
  let lowered = source
    .replace(bank[0], `#define WL_BANK Term ${name}[${fields.length}];`)
    .replace(signature[0], `#define WL_SIG Env e, DEV Term* sp, u32 seq, u32 rn, Term* ${name}`)
    .replace(args[0], `#define WL_ALL e, sp, seq, rn, ${name}`)
    .replace(open, "#define WL_OPEN    { u32 rn;")
    .replace(marker, `${aliases}\n\n${marker}`)
  lowered = `${registerBankStamp}${fields.length} words.\n${lowered}`
  return { source: lowered, words: fields.length }
}
