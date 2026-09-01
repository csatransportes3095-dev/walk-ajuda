import fs from 'node:fs';

const path = 'client/src/pages/Home.tsx';
let src = fs.readFileSync(path, 'utf8');

const oldGrid = '<div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">';
const newGrid = "<div className={`grid grid-cols-1 gap-8 md:gap-12 items-center ${VIDEO_URL && !videoError ? 'md:grid-cols-2' : 'md:grid-cols-1'}`}>";
if (!src.includes(oldGrid)) throw new Error('Hero grid anchor not found');
src = src.replace(oldGrid, newGrid);

const oldContent = '<div className="space-y-6">\n              <div className="space-y-3">';
const newContent = "<div className={`space-y-6 ${VIDEO_URL && !videoError ? '' : 'w-full max-w-6xl mx-auto text-center'}`}>\n              <div className={`space-y-3 ${VIDEO_URL && !videoError ? '' : 'w-full flex flex-col items-center'}`}>";
if (!src.includes(oldContent)) throw new Error('Hero content anchor not found');
src = src.replace(oldContent, newContent);

const oldTitle = '{HERO_TITLE && <h2 className="text-4xl md:text-5xl font-bold text-foreground leading-tight" dangerouslySetInnerHTML={{ __html: HERO_TITLE }} />}';
const newTitle = "{HERO_TITLE && <h2 className={`text-4xl md:text-5xl font-bold text-foreground leading-tight ${VIDEO_URL && !videoError ? '' : 'w-full text-center [&>*]:mx-auto [&>*]:max-w-full'}`} dangerouslySetInnerHTML={{ __html: HERO_TITLE }} />}";
if (!src.includes(oldTitle)) throw new Error('Hero title anchor not found');
src = src.replace(oldTitle, newTitle);

fs.writeFileSync(path, src);
console.log('Hero centered when no video');
