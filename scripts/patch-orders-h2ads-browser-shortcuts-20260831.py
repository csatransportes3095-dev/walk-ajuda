from pathlib import Path

path = Path('client/src/pages/AdminOrders.tsx')
source = path.read_text(encoding='utf-8')


def replace_once(old: str, new: str, label: str) -> None:
    global source
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: esperado 1 trecho, encontrado {count}')
    source = source.replace(old, new, 1)

replace_once(
    'import { OrderLoginAuthenticatorCode } from "@/components/OrderLoginAuthenticatorCode";\n',
    'import { OrderLoginAuthenticatorCode } from "@/components/OrderLoginAuthenticatorCode";\nimport OrderH2AdsBrowserShortcut from "@/components/OrderH2AdsBrowserShortcut";\n',
    'import do atalho H2ADS',
)

anchor = '''                          </button>
                          {/* Selo NOVO */}'''
replacement = '''                          </button>
                          <OrderH2AdsBrowserShortcut registrationId={order.id} subOrderIndex={order.subOrderIndex ?? 0} />
                          {/* Selo NOVO */}'''
replace_once(anchor, replacement, 'atalho ao lado do atendimento')

required = [
    'import OrderH2AdsBrowserShortcut from "@/components/OrderH2AdsBrowserShortcut";',
    '<OrderH2AdsBrowserShortcut registrationId={order.id} subOrderIndex={order.subOrderIndex ?? 0} />',
]
for marker in required:
    if marker not in source:
        raise SystemExit(f'marcador obrigatório ausente: {marker}')

path.write_text(source, encoding='utf-8')
print('ORDERS_H2ADS_BROWSER_SHORTCUT_PATCH_OK')
