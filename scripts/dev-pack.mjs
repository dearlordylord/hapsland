import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Use the invoking npm's packlist and tar implementation, with fast local compression. */
export async function packDevelopmentArchive({ root, destination, npmEntrypoint = process.env.npm_execpath }) {
  if (!npmEntrypoint) throw new Error("Run dev-install through npm run so its packaging implementation is available");
  const require = createRequire(npmEntrypoint);
  const Arborist = require("@npmcli/arborist");
  const packlist = require("npm-packlist");
  const tar = require("tar");
  const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  if (manifest.name !== "@hapsland/hapsland") throw new Error("pack did not select a Hapsland package");
  const tree = await new Arborist({ path: root }).loadActual();
  const files = await packlist(tree, { path: root });
  const archive = resolve(destination, `${manifest.name.replace(/^@/, "").replaceAll("/", "-")}-${manifest.version}.tgz`);
  const bins = new Set(typeof manifest.bin === "string" ? [manifest.bin] : Object.values(manifest.bin ?? {}));
  await tar.c({ cwd: root, file: archive, prefix: "package/", portable: true, gzip: { level: 1 }, mtime: new Date("1985-10-26T08:15:00.000Z"),
    filter: (path, stat) => { if (bins.has(path.replace(/^\.\//, ""))) stat.mode |= 0o111; return true; },
  }, files);
  return archive;
}
