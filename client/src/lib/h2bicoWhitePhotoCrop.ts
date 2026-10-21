/** Novo preset opcional: localiza a área realmente branca da foto no print.
 * Opera só na imagem lida localmente; o recorte quadrado existente não é alterado.
 * Se a região branca não for reconhecida, retorna null (nunca inclui fundo escuro).
 */
export type WhitePhotoCrop = { x: number; y: number; width: number; height: number };
type OriginalCrop = { x: number; y: number; size: number };

export function findWhitePhotoCrop(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  offsetX: number,
  offsetY: number,
  original: OriginalCrop,
): WhitePhotoCrop | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) ||
      width < 32 || height < 32 || pixels.length < width * height * 4 ||
      !Number.isFinite(original.size) || original.size < 48) return null;

  const n = width * height;
  const light = new Uint8Array(n);
  const visited = new Uint8Array(n);
  const queue = new Int32Array(n);
  const isWhite = (i: number) => {
    const p = i * 4;
    const r = pixels[p], g = pixels[p + 1], b = pixels[p + 2];
    return pixels[p + 3] >= 128 && r >= 210 && g >= 210 && b >= 210 &&
      Math.max(r, g, b) - Math.min(r, g, b) <= 40;
  };
  for (let i = 0; i < n; i++) light[i] = isWhite(i) ? 1 : 0;
  const sampleDark = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return null;
    const i = (y * width + x) * 4;
    return pixels[i] + pixels[i + 1] + pixels[i + 2] < 540;
  };
  const originalCx = original.x + original.size / 2;
  const originalCy = original.y + original.size / 2;
  let winner: WhitePhotoCrop | null = null;
  let bestScore = -Infinity;

  // Componentes claros conectados delimitam o fundo branco que envolve o rosto.
  // Texto branco solto no fundo escuro não forma uma área retangular suficiente.
  for (let i = 0; i < n; i++) {
    if (!light[i] || visited[i]) continue;
    let read = 0, write = 1, count = 0;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    queue[0] = i;
    visited[i] = 1;
    while (read < write) {
      const idx = queue[read++];
      const x = idx % width, y = (idx - x) / width;
      count++;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      const add = (next: number) => {
        if (!visited[next] && light[next]) {
          visited[next] = 1;
          queue[write++] = next;
        }
      };
      if (x > 0) add(idx - 1);
      if (x + 1 < width) add(idx + 1);
      if (y > 0) add(idx - width);
      if (y + 1 < height) add(idx + width);
    }
    const photoWidth = maxX - minX + 1;
    const photoHeight = maxY - minY + 1;
    if (photoWidth < Math.max(38, original.size * 0.45) ||
        photoHeight < Math.max(45, original.size * 0.52) ||
        photoWidth > original.size * 1.65 ||
        photoHeight > original.size * 1.8 ||
        count / (photoWidth * photoHeight) < 0.14) continue;

    const left = offsetX + minX, top = offsetY + minY;
    const right = left + photoWidth, bottom = top + photoHeight;
    const overlapX = Math.max(0, Math.min(right, original.x + original.size) - Math.max(left, original.x));
    const overlapY = Math.max(0, Math.min(bottom, original.y + original.size) - Math.max(top, original.y));
    const overlap = overlapX * overlapY / (original.size * original.size);
    if (overlap < 0.22 ||
        Math.abs(left + photoWidth / 2 - originalCx) > original.size * 0.63 ||
        Math.abs(top + photoHeight / 2 - originalCy) > original.size * 0.68) continue;

    // Exige contraste real com o lado de fora da fotografia.
    // Se tudo for claro (sem fronteira), não adivinha um recorte.
    let dark = 0, samples = 0;
    const probe = (x: number, y: number) => {
      const result = sampleDark(x, y);
      if (result !== null) { samples++; if (result) dark++; }
    };
    for (const t of [0.2, 0.5, 0.8]) {
      probe(minX - 4, Math.round(minY + photoHeight * t));
      probe(maxX + 4, Math.round(minY + photoHeight * t));
      probe(Math.round(minX + photoWidth * t), minY - 4);
      probe(Math.round(minX + photoWidth * t), maxY + 4);
    }
    if (samples < 5 || dark < 4) continue;

    // Use a área inteira detectada. Não força 4:5: fotos de cadastro podem
    // ser quase quadradas e o rosto/ombros não podem ser cortados nas laterais.
    const cropWidth = photoWidth;
    const cropHeight = photoHeight;
    if (cropWidth < 40 || cropHeight < 50) continue;
    const cropX = minX;
    const cropY = minY;
    const nearWhite = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < width && y < height && light[y * width + x] === 1;
    // Os dois cantos superiores da saída devem começar em fundo branco.
    if (!nearWhite(cropX + 2, cropY + 2) ||
        !nearWhite(cropX + cropWidth - 3, cropY + 2)) continue;

    const score = overlap * 100 + count / (photoWidth * photoHeight) * 30 +
      dark / samples * 15 - (Math.abs(left + photoWidth / 2 - originalCx) +
      Math.abs(top + photoHeight / 2 - originalCy)) / original.size * 20;
    if (score > bestScore) {
      bestScore = score;
      winner = { x: offsetX + cropX, y: offsetY + cropY, width: cropWidth, height: cropHeight };
    }
  }
  return winner;
}

/** Busca em TODO o print, inclusive acima do nome. Não usa o crop antigo
 * como localização obrigatória. Cada candidato precisa ter uma área branca
 * conectada suficientemente grande, proporção de retrato e espaço para texto.
 */
export function locateWhitePortrait(
 pixels:Uint8ClampedArray,width:number,height:number,
 nameX:number,nameY:number,nameWidth:number,
):WhitePhotoCrop|null {
 if(width<80||height<80||pixels.length<width*height*4)return null;
 const mark=new Uint8Array(width*height);
 const seen=new Uint8Array(mark.length);
 const queue=new Int32Array(mark.length);
 for(let i=0;i<mark.length;i++){
  const p=i*4,r=pixels[p],g=pixels[p+1],b=pixels[p+2];
  mark[i]=(pixels[p+3]>=128&&r>=215&&g>=215&&b>=215&&Math.max(r,g,b)-Math.min(r,g,b)<=36)?1:0;
 }
 let best:WhitePhotoCrop|null=null,score=-Infinity;
 for(let i=0;i<mark.length;i++){
  if(!mark[i]||seen[i])continue;
  let head=0,tail=1,left=width,right=0,top=height,bottom=0;
  queue[0]=i;seen[i]=1;
  while(head<tail){
   const pos=queue[head++],x=pos%width,y=Math.floor(pos/width);
   left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
   const visit=(at:number)=>{if(mark[at]&&!seen[at]){seen[at]=1;queue[tail++]=at;}};
   if(x>0)visit(pos-1);if(x<width-1)visit(pos+1);
   if(y>0)visit(pos-width);if(y<height-1)visit(pos+width);
  }
  const w=right-left+1,h=bottom-top+1;
  if(w<70||h<88||w>width*.85||h>height*.85||h/w<.86||h/w>2.3||tail/(w*h)<.22)continue;
  // Nome logo abaixo da fotografia (ou à direita, nos cards tradicionais).
  const nameCenter=nameX+nameWidth*.5,cx=left+w*.5;
  const above=top<nameY && bottom<=nameY+Math.max(35,h*.35) &&
    Math.abs(cx-nameCenter)<Math.max(w*.9,nameWidth*.85);
  const leftOfName=right<nameX+Math.max(30,w*.25)&&
    Math.abs(top+h*.5-nameY)<Math.max(h*.9,70);
  const rightOfName=left>nameX&&left<nameX+nameWidth+w*1.3&&
    Math.abs(top+h*.5-nameY)<Math.max(h*.9,70);
  if(!above&&!leftOfName&&!rightOfName)continue;
  // Use the complete connected photo bounds. The original image can be
  // square or near-square; forcing 4:5 was cutting the sides and shoulders.
  const outW=w;
  const outH=h;
  if(outW<64||outH<80||top+outH>height)continue;
  const outX=left+Math.floor((w-outW)/2);
  if(!mark[(top+2)*width+outX+3]||!mark[(top+2)*width+outX+outW-4])continue;
  const distance=above?Math.abs(nameY-bottom):Math.abs(nameX-right);
  const candidateScore=(above?60:15)+Math.min(tail/(w*h),.75)*30+
    Math.min(w*h,250000)/5000-distance*.09-
    Math.abs(cx-nameCenter)*.025;
  if(candidateScore>score){score=candidateScore;best={x:outX,y:top,width:outW,height:outH};}
 }
 return best;
}

/** Auto-select only a real portrait ABOVE the OCR name. Never convert the
 * legacy left/right/square photo crops automatically.
 */
export function isWhitePortraitAboveName(
 crop:WhitePhotoCrop|null,
 nameBox:{left:number;top:number;width:number;height:number}|undefined,
):boolean {
 if(!crop||!nameBox||crop.width<64||crop.height<80)return false;
 const distance=nameBox.top-(crop.y+crop.height);
 const center=crop.x+crop.width/2;
 const nameCenter=nameBox.left+nameBox.width/2;
  return distance>=7 &&
  distance<=Math.max(35,crop.height*.60) &&
  Math.abs(center-nameCenter)<Math.max(crop.width*.50,nameBox.width*.8) &&
  crop.height/crop.width>=.70 && crop.height/crop.width<=2.30;
}
