from pathlib import Path

path = Path('client/src/pages/Home.tsx')
src = path.read_text(encoding='utf-8')

old_title = '''                {HERO_TITLE && <h2 className={`text-4xl md:text-5xl font-bold text-foreground leading-tight ${VIDEO_URL && !videoError ? '' : 'w-full text-center [&>*]:mx-auto [&>*]:max-w-full'}`} dangerouslySetInnerHTML={{ __html: HERO_TITLE }} />}'''
new_title = '''                {HERO_TITLE && (
                  <div className={`public-hero-title-shell text-4xl md:text-5xl font-bold text-foreground leading-tight ${VIDEO_URL && !videoError ? '' : 'w-full text-center'}`}>
                    <div className="public-hero-title-html w-full" dangerouslySetInnerHTML={{ __html: HERO_TITLE }} />
                  </div>
                )}'''

if old_title not in src:
    raise SystemExit('Hero title anchor not found')
src = src.replace(old_title, new_title, 1)

hero_marker = '''      {/* Hero Section */}
      <section className="relative overflow-hidden py-4 md:py-20">'''
hero_with_style = '''      {/* O titulo do Hero aceita HTML completo. O fundo galactico e o texto precisam
          permanecer como uma unica composicao: centraliza o bloco sem esticar sua largura. */}
      <style>{`
        .public-hero-title-shell {
          width: 100%;
          min-width: 0;
        }
        .public-hero-title-html {
          width: 100%;
          min-width: 0;
        }
        .public-hero-title-html .h2-hero-colombiano {
          max-width: 100% !important;
          margin-left: auto !important;
          margin-right: auto !important;
          box-sizing: border-box !important;
        }
      `}</style>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-4 md:py-20">'''

if hero_marker not in src:
    raise SystemExit('Hero section marker not found')
src = src.replace(hero_marker, hero_with_style, 1)

path.write_text(src, encoding='utf-8')
print('Hero galactic composition centered without stretching.')
