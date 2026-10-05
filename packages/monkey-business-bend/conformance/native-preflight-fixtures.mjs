import { nativeRunFixtures } from "./native-run-fixtures.mjs"

export const nativePreflightFixtures = Object.freeze(
  [
    "jev-recovery-native.bend",
    "jev-targets-native.bend",
    "jev-credentials-unavailable-native.bend",
    "jev-credentials-restore-native.bend",
    "jev-credentials-rotation-native.bend",
    "advicee-departure.bend",
    "advicee-removal.bend",
    "advicee-preparation-departure.bend",
    "permit-scenario.bend",
    "permit-generated-native.bend"
  ]
    .map((name) => new URL(name, import.meta.url))
    .concat(nativeRunFixtures)
)

export function usesNativePreflight(fixture) {
  return nativePreflightFixtures.some((selected) => selected.href === fixture.href)
}
