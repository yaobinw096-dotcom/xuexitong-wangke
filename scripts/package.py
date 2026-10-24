"""Build only allowlisted public files. No browser profiles or private work material."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import hashlib
import json

root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
top_files = ['README.md', 'LICENSE', 'NOTICE.md', 'PRIVACY.md', 'SECURITY.md',
             'CONTRIBUTING.md', 'CHANGELOG.md', 'package.json', 'package-lock.json', '.gitignore', '.gitattributes']
folders = ['extension', 'tests', 'scripts', 'docs', '.github']
public = [root / name for name in top_files]
for folder in folders:
    public += [p for p in (root / folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts]
for p in public:
    assert p.is_file() and not p.is_symlink()
    assert p.resolve().is_relative_to(root)
dist = root / 'dist'
dist.mkdir(exist_ok=True)

def write_zip(name, entries):
    target = dist / name
    entries = sorted(entries, key=lambda item: item[0])
    with ZipFile(target, 'w') as archive:
        for arcname, source in entries:
            info = ZipInfo(arcname, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, source.read_bytes())
    with ZipFile(target) as archive:
        assert archive.testzip() is None
        for arcname, source in entries:
            assert archive.read(arcname) == source.read_bytes()
    return {'file': name, 'bytes': target.stat().st_size,
            'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
            'entries': [name for name, _ in entries]}

extension = [(p.relative_to(root / 'extension').as_posix(), p) for p in public if p.is_relative_to(root / 'extension')]
extension += [(name, root / name) for name in ['LICENSE', 'NOTICE.md', 'PRIVACY.md']]
assert 'manifest.json' in dict(extension)
manifest = json.loads((root / 'extension/manifest.json').read_text(encoding='utf-8'))
assert 'host_permissions' not in manifest
source = [(p.relative_to(root).as_posix(), p) for p in public]
results = [write_zip(f'keban-edge-{version}.zip', extension), write_zip(f'keban-source-{version}.zip', source)]
(dist / 'checksums.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
for item in results:
    print(f"PASS {item['file']}: {item['bytes']} bytes, SHA256 {item['sha256']}")
