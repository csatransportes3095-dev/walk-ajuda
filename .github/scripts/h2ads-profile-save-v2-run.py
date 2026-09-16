from pathlib import Path

source_path = Path('.github/scripts/h2ads-profile-save-v2.py')
source = source_path.read_text(encoding='utf-8')
filtered = '\n'.join(
    line for line in source.splitlines()
    if not line.startswith('replace_once(validate,')
) + '\n'
exec(compile(filtered, str(source_path), 'exec'), {'__name__': '__main__'})

validate_path = Path('.github/workflows/h2ads-validate.yml')
validate_text = validate_path.read_text(encoding='utf-8')
count = validate_text.count('1.3.8')
if count != 3:
    raise SystemExit(f'h2ads-validate.yml: expected 3 version references, found {count}')
validate_path.write_text(validate_text.replace('1.3.8', '1.3.9'), encoding='utf-8')
