from pathlib import Path

path = Path("workers/windows/browser-session.mjs")
source = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str) -> None:
    global source
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: esperado 1 trecho, encontrado {count}")
    source = source.replace(old, new, 1)

replace_once('version: "1.0.0",', 'version: "1.1.0",', 'versao privacy guard')

replace_once(
'''    host_permissions: [
      "*://*.google.com/*",
      "*://*.google.com.br/*",
    ],
    declarative_net_request: {''',
'''    host_permissions: [
      "*://google.com/*",
      "*://*.google.com/*",
      "*://google.com.br/*",
      "*://*.google.com.br/*",
    ],
    web_accessible_resources: [
      {
        resources: ["blocked.html"],
        matches: [
          "*://google.com/*",
          "*://*.google.com/*",
          "*://google.com.br/*",
          "*://*.google.com.br/*",
        ],
      },
    ],
    declarative_net_request: {''',
'web accessible blocked page')

old_html = '''  const blockedHtml = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>H2ADS · Protecao de rede</title><style>html,body{margin:0;min-height:100%;font-family:Arial,sans-serif;background:#0b1220;color:#e5eefc}main{min-height:100vh;display:grid;place-items:center;padding:32px;box-sizing:border-box}section{max-width:700px;text-align:center;border:1px solid #23324d;border-radius:20px;padding:36px;background:#101b2e}small{color:#7dd3fc;font-weight:700;letter-spacing:.14em}h1{font-size:30px;margin:12px 0}p{color:#a9bad3;line-height:1.5;margin:0}</style></head><body><main><section><small>H2ADS · PRIVACY GUARD</small><h1>Conexao em verificacao</h1><p>Esta pagina foi ocultada para proteger os dados de rede da instancia. Nenhum endereco IP, usuario, senha, host ou porta do proxy e exibido aqui.</p></section></main></body></html>`;'''

new_html = '''  const blockedHtml = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>H2ADS · Conexao protegida</title><style>html,body{margin:0;min-height:100%;font-family:Arial,sans-serif;background:#0b1220;color:#e5eefc}main{min-height:100vh;display:grid;place-items:center;padding:32px;box-sizing:border-box}section{width:min(720px,100%);text-align:center;border:1px solid #23324d;border-radius:20px;padding:36px;background:#101b2e;box-sizing:border-box}small{color:#7dd3fc;font-weight:700;letter-spacing:.14em}h1{font-size:30px;margin:12px 0}p{color:#a9bad3;line-height:1.5;margin:0 auto;max-width:620px}.notice{margin-top:18px;border:1px solid #334155;background:#0b1526;border-radius:14px;padding:14px;text-align:left;color:#cbd5e1;font-size:14px;line-height:1.5}form{display:flex;gap:10px;margin-top:22px}input{min-width:0;flex:1;border:1px solid #334155;border-radius:12px;background:#07101d;color:#fff;padding:13px 14px;font-size:15px;outline:none}input:focus{border-color:#38bdf8}button{border:0;border-radius:12px;background:#f5b800;color:#171003;padding:0 20px;font-weight:800;cursor:pointer}a{display:inline-block;margin-top:16px;color:#7dd3fc;font-weight:700;text-decoration:none}@media(max-width:560px){form{flex-direction:column}button{padding:13px 18px}}</style></head><body><main><section><small>H2ADS · PRIVACY GUARD</small><h1>Google bloqueou esta conexao</h1><p>A pagina de verificacao foi ocultada para que os dados de rede da instancia nao fiquem expostos.</p><div class="notice">O H2ADS nao tenta contornar o reCAPTCHA do Google. Voce pode continuar navegando ou usar uma pesquisa alternativa abaixo.</div><form action="https://www.bing.com/search" method="get"><input name="q" type="search" autocomplete="off" placeholder="Digite sua pesquisa..." aria-label="Pesquisa alternativa"><button type="submit">Pesquisar</button></form><a href="https://www.bing.com/">Abrir mecanismo de pesquisa alternativo</a></section></main></body></html>`;'''
replace_once(old_html, new_html, 'tela interna com pesquisa alternativa')

replace_once(
'writeSession({ startedAt: new Date().toISOString(), instanceLabelState: "static_tab", observedIp: initialIp, privacyGuard: "protected", googleSorryPrivacyGuard: "enabled" });',
'writeSession({ startedAt: new Date().toISOString(), instanceLabelState: "static_tab", observedIp: initialIp, privacyGuard: "protected", googleSorryPrivacyGuard: "enabled_v2" });',
'session flag v2')

required = [
    'version: "1.1.0"',
    'web_accessible_resources',
    'resources: ["blocked.html"]',
    'google\\.com/sorry',
    'google\\.com\\.br/sorry',
    'Google bloqueou esta conexao',
    'action="https://www.bing.com/search"',
    'googleSorryPrivacyGuard: "enabled_v2"',
]
for marker in required:
    if marker not in source:
        raise SystemExit(f"marcador obrigatorio ausente: {marker}")

path.write_text(source, encoding="utf-8")
print("H2ADS_GOOGLE_SORRY_V2_PATCH_OK")
