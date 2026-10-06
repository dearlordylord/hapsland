"""Exercise formatter selection and the commit gate without a compiler or JAR."""
import base64
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/bend-format.py'
HOOK = ROOT / '.husky/pre-commit'


class FormatterGateTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='hapsland-format-wrapper-')
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name).resolve()
        self.git('init', '-q')
        self.git('-c', 'user.name=Probe', '-c', 'user.email=probe@example.org',
                 'commit', '--allow-empty', '--no-gpg-sign', '-qm', 'baseline')
        self.log = self.root / 'formatter-log.jsonl'
        fake = self.root / 'fake-formatter'
        fake.write_text('#!' + sys.executable + '\n' + '''import base64,json,os,pathlib,sys
args = sys.argv[1:]
source = sys.stdin.buffer.read() if '--stdin-path' in args else b''
with open(os.environ['FORMAT_TEST_LOG'], 'a') as log:
    log.write(json.dumps({'args': args, 'stdin': base64.b64encode(source).decode()}) + '\\n')
if args == ['--version']:
    print(os.environ.get('FORMAT_TEST_VERSION', 'bend-format 0.1.19'))
    sys.exit(0)
if '--stdin-path' not in args:
    source = b''.join(pathlib.Path(path).read_bytes() for path in args[1:] if path != '--')
sys.exit(2 if b'UNAVAILABLE' in source else 1 if b'BAD' in source else 0)
''')
        fake.chmod(0o755)
        self.env = dict(os.environ, BEND_FORMAT_BIN=str(fake), FORMAT_TEST_LOG=str(self.log))
        self.env.pop('BEND_FORMAT_JAR', None)

    def git(self, *args):
        return subprocess.check_output(['git', '-C', str(self.root), *args], stderr=subprocess.PIPE)

    def run_format(self, *args):
        return subprocess.run([sys.executable, str(SCRIPT), *args], cwd=self.root,
                              env=self.env, capture_output=True)

    def calls(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []

    def test_wrong_version_rejects_before_formatting(self):
        (self.root / 'example.bend').write_bytes(b'BAD\n')
        self.env['FORMAT_TEST_VERSION'] = 'bend-format 0.1.14'
        self.assertEqual(self.run_format('check').returncode, 2)
        self.assertEqual([call['args'] for call in self.calls()], [['--version']])

    def test_partial_staging_checks_exact_index_without_writes(self):
        path = self.root / 'space name.bend'
        staged = b'BAD staged\n\xff\n'
        path.write_bytes(staged)
        self.git('add', path.name)
        working = b'GOOD unstaged\n'
        path.write_bytes(working)
        index = (self.root / '.git/index').read_bytes()
        self.assertEqual(self.run_format('check', '--staged').returncode, 1)
        call = self.calls()[-1]
        self.assertEqual(call['args'], ['check', '--stdin-path', str(path)])
        self.assertEqual(base64.b64decode(call['stdin']), staged)
        self.assertEqual(path.read_bytes(), working)
        self.assertEqual(self.git('show', ':' + path.name), staged)
        self.assertEqual((self.root / '.git/index').read_bytes(), index)

    def test_working_files_with_spaces_use_one_batch(self):
        names = ['a space.bend', 'z.bend']
        for name in names:
            (self.root / name).write_bytes(b'GOOD\n')
        for mode in ['check', 'fix']:
            with self.subTest(mode=mode):
                self.log.unlink(missing_ok=True)
                self.assertEqual(self.run_format(mode, *names).returncode, 0)
                self.assertEqual([call['args'] for call in self.calls()],
                                 [['--version'], [mode, '--', *(str(self.root / name) for name in names)]])

    def test_unavailable_status_propagates_and_preserves_selected_bytes(self):
        path = self.root / 'unsupported.bend'
        path.write_bytes(b'UNAVAILABLE\n')
        self.git('add', path.name)
        for options in [[], ['--staged']]:
            with self.subTest(options=options):
                before = path.read_bytes()
                staged = self.git('show', ':' + path.name)
                self.assertEqual(self.run_format('check', *options).returncode, 2)
                self.assertEqual(path.read_bytes(), before)
                self.assertEqual(self.git('show', ':' + path.name), staged)

    def test_empty_selection_requires_no_formatter(self):
        self.env['BEND_FORMAT_BIN'] = str(self.root / 'absent')
        for options in [[], ['--staged'], ['--all']]:
            with self.subTest(options=options):
                self.assertEqual(self.run_format('check', *options).returncode, 0)
        self.assertEqual(self.calls(), [])

    def test_commit_hook_rejects_index_even_when_working_file_is_formatted(self):
        (self.root / 'scripts').mkdir()
        shutil.copyfile(SCRIPT, self.root / 'scripts/bend-format.py')
        (self.root / '.githooks').mkdir()
        hook = self.root / '.githooks/pre-commit'
        shutil.copyfile(HOOK, hook)
        hook.chmod(0o755)
        self.git('config', 'core.hooksPath', '.githooks')
        path = self.root / 'example.bend'
        path.write_bytes(b'BAD staged\n')
        self.git('add', path.name)
        path.write_bytes(b'GOOD working\n')
        original_head = self.git('rev-parse', 'HEAD')
        staged = self.git('show', ':' + path.name)
        result = subprocess.run(['git', '-c', 'user.name=Probe', '-c',
                                 'user.email=probe@example.org', 'commit', '--no-gpg-sign', '-qm', 'blocked'],
                                cwd=self.root, env=self.env, capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.git('rev-parse', 'HEAD'), original_head)
        self.assertEqual(self.git('show', ':' + path.name), staged)
        self.assertEqual(path.read_bytes(), b'GOOD working\n')
        self.assertEqual(base64.b64decode(self.calls()[-1]['stdin']), staged)


if __name__ == '__main__':
    unittest.main()
