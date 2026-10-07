#!/usr/bin/env python3
"""Select repository Bend sources for the pinned bend-idea style tool."""
import argparse
import os
from pathlib import Path
import subprocess
import sys

VERSION = "bend-format 0.1.19"


def git(root, *args):
    return subprocess.check_output(["git", "-C", str(root), *args], timeout=10)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("check", "fix"))
    selection = parser.add_mutually_exclusive_group()
    selection.add_argument("--all", action="store_true", help="all tracked Bend files")
    selection.add_argument("--base", help="changes against a commit, including local edits")
    selection.add_argument("--staged", action="store_true", help="check exact index bytes")
    parser.add_argument("paths", nargs="*", help="explicit paths relative to repository root")
    args = parser.parse_args()
    if args.paths and (args.all or args.base or args.staged):
        parser.error("explicit paths cannot be combined with a selection option")
    if args.staged and args.mode != "check":
        parser.error("--staged is read-only; format the working file, then stage it")

    root = Path(git(Path.cwd(), "rev-parse", "--show-toplevel").decode().strip())
    if args.paths:
        paths = [os.fsencode(path) for path in args.paths]
    elif args.all:
        paths = git(root, "ls-files", "-z", "--", "*.bend").split(b"\0")
    else:
        diff = ["diff", "--name-only", "-z", "--diff-filter=ACMRT"]
        diff += ["--cached"] if args.staged else [args.base or "HEAD"]
        paths = git(root, *diff, "--", "*.bend").split(b"\0")
        if not args.staged:
            paths += git(root, "ls-files", "--others", "--exclude-standard", "-z", "--", "*.bend").split(b"\0")
    paths = sorted(set(path for path in paths if path))
    if not paths:
        print("No selected Bend files.")
        return 0

    jar = os.environ.get("BEND_FORMAT_JAR")
    command = ([os.environ.get("BEND_FORMAT_JAVA", "java"), "-jar", jar]
               if jar else [os.environ.get("BEND_FORMAT_BIN", "bend-format")])
    version = subprocess.run(command + ["--version"], capture_output=True, text=True, timeout=10)
    if version.returncode or version.stdout.strip() != VERSION:
        print(f"Required formatter: {VERSION}; select its executable with BEND_FORMAT_BIN "
              "or its JAR/runtime with BEND_FORMAT_JAR and BEND_FORMAT_JAVA.", file=sys.stderr)
        print(version.stdout + version.stderr, file=sys.stderr)
        return 2

    status = 0
    selected = []
    for raw in paths:
        relative = os.fsdecode(raw)
        path = root / relative
        if Path(relative).is_absolute() or ".." in Path(relative).parts or path.suffix != ".bend":
            print(f"Unavailable repository Bend path: {relative}", file=sys.stderr)
            status = 2
            continue
        if args.staged:
            source = git(root, "show", ":" + relative)
            result = subprocess.run(command + ["check", "--stdin-path", str(path)], input=source, timeout=60)
        else:
            selected.append(str(path))
            continue
        status = max(status, result.returncode if result.returncode in (0, 1, 2) else 2)
    if selected:
        # One process for a working-tree batch; stdin checks retain exact index bytes.
        result = subprocess.run(command + [args.mode, "--", *selected], timeout=60)
        status = max(status, result.returncode if result.returncode in (0, 1, 2) else 2)
    return status


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, subprocess.SubprocessError) as error:
        print(f"Formatting unavailable: {error}", file=sys.stderr)
        sys.exit(2)
