import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, mkdir, readFile, readdir, readlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const generatedRoots = new Set([".test-runs", "dist", "coverage", "node_modules"]);

/** Identify current bytes, including dirty and nonignored untracked inputs. */
export async function sourceIdentity(root, excludedDirectory) {
  const { stdout } = await execute("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  });
  const { stdout: index } = await execute("git", ["ls-files", "--stage", "-z"], {
    cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  });
  const gitlinks = new Map(index.split("\0").filter(Boolean).flatMap((entry) => {
    const match = /^160000 ([a-f0-9]+) \d\t(.*)$/s.exec(entry);
    return match ? [[match[2], match[1]]] : [];
  }));
  const excluded = excludedDirectory && relative(root, excludedDirectory).replaceAll("\\", "/");
  const files = [...new Set(stdout.split("\0").filter(Boolean))].sort().filter((file) =>
    !generatedRoots.has(file.split("/")[0]) &&
    !(excluded && !isAbsolute(excluded) && excluded !== ".." && !excluded.startsWith("../") &&
      (file === excluded || file.startsWith(`${excluded}/`))));
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(`${file}\0`);
    let metadata;
    try { metadata = await lstat(join(root, file)); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      if (gitlinks.has(file)) throw new Error(`Archive input submodule is missing or uninitialized: ${file}`);
      hash.update("deleted\0");
      continue;
    }
    hash.update(`${metadata.mode}\0`);
    if (metadata.isSymbolicLink()) hash.update(`link\0${await readlink(join(root, file))}\0`);
    else if (metadata.isFile()) {
      const bytes = await readFile(join(root, file));
      hash.update(`file\0${bytes.length}\0`);
      hash.update(bytes);
    } else if (metadata.isDirectory() && gitlinks.has(file)) {
      const directory = join(root, file);
      let checkout;
      try {
        const top = await execute("git", ["rev-parse", "--show-toplevel"], { cwd: directory, encoding: "utf8" });
        if (resolve(top.stdout.trim()) !== resolve(directory)) throw new Error("No submodule checkout");
        checkout = await execute("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" });
      } catch {
        throw new Error(`Archive input submodule is missing or uninitialized: ${file}`);
      }
      hash.update(`submodule\0${gitlinks.get(file)}\0${checkout.stdout.trim()}\0`);
      hash.update(await sourceIdentity(directory, excludedDirectory));
    } else throw new Error(`Unsupported archive input: ${file}`);
  }
  return hash.digest("hex");
}

/** Build and pack once for this run; never reuse an archive from another run. */
export async function prepareArchive({ root, runDirectory, runStage }) {
  root = resolve(root);
  runDirectory = resolve(runDirectory);
  const artifacts = join(runDirectory, "package");
  await mkdir(artifacts, { recursive: true });
  if ((await readdir(artifacts)).length !== 0) throw new Error("Archive output directory must be empty");
  const sourceDigest = await sourceIdentity(root, runDirectory);
  for (const stage of [
    { name: "package-build", command: "npm", args: ["run", "build"] },
    { name: "package-pack", command: "npm", args: ["pack", "--ignore-scripts=true", "--json", "--pack-destination", artifacts] },
  ]) {
    const result = await runStage({ ...stage, cwd: root, env: {} });
    if (result.exitCode !== 0 || result.signal || result.timedOut) {
      throw new Error(`${stage.name} failed; see ${result.logPath ?? "stage result"}`);
    }
    if (await sourceIdentity(root, runDirectory) !== sourceDigest) {
      throw new Error(`Source inputs changed during ${stage.name}; archive cannot validate these sources`);
    }
  }
  const archives = (await readdir(artifacts)).filter((file) => file.endsWith(".tgz"));
  if (archives.length !== 1) throw new Error(`Expected one package archive, found ${archives.length}`);
  const archivePath = join(artifacts, archives[0]);
  const archiveDigest = createHash("sha256").update(await readFile(archivePath)).digest("hex");
  const evidence = { archivePath, sourceDigest, archiveDigest };
  await writeFile(join(runDirectory, "archive.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}
