// Small deterministic parser fixture, not a user document or a generated report.
export function pdfFixture(pages=['Project overview.','Project code: LANTERN-742. Review date: 2026-11-18.']) {
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const kids=[];
  for(const text of pages){
    const pageId=objects.length+1,streamId=pageId+1;kids.push(`${pageId} 0 R`);
    const lines=text.split('\n').map(line=>line.replace(/[\\()]/g,'\\$&'));
    const stream=`BT /F1 12 Tf 16 TL 40 740 Td `+lines.map((line,i)=>(i?'T* ':'')+`(${line}) Tj`).join(' ')+' ET';
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  }
  objects[1]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;
  let pdf='%PDF-1.4\n';const offsets=[0];
  objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${o}\nendobj\n`;});
  const xref=Buffer.byteLength(pdf);
  pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('');
  pdf+=`trailer\n<< /Root 1 0 R /Size ${objects.length+1} >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

export function longPdfFixture() {
  return pdfFixture(Array.from({length:12},(_,i)=>[
    `SECTION ${i+1}: Project review notes.`,
    ...(i===0?['START milestone code: START-214. Owner: Alice.']:[]),
    ...(i===6?['MIDDLE milestone code: MID-582. Review date: 2026-12-19.']:[]),
    ...(i===11?['FINAL approval code: END-936. Approved budget: 91200 dollars.']:[]),
    ...Array.from({length:30},(_,j)=>`Item ${i+1}.${j+1}: Review design, verify records, and retain source evidence.`),
    'Do not treat draft estimates as final approval. Check page references.'
  ].join('\n')));
}

// A native-text cover plus a raster-only page. No hidden text layer is embedded.
export async function scannedPdfFixture({header='',lines=['Project code: LANTERN-742','Review date: 2026/11/18','會議備註：請攜帶設計圖。']}={}) {
  const {createCanvas}=await import('@napi-rs/canvas');
  const canvas=createCanvas(1224,1584),g=canvas.getContext('2d');
  g.fillStyle='white';g.fillRect(0,0,canvas.width,canvas.height);
  g.fillStyle='black';g.font='42px "Microsoft JhengHei"';
  lines.forEach((line,i)=>g.fillText(line,70,150+i*100));
  const jpeg=canvas.toBuffer('image/jpeg');
  const cover='BT /F1 14 Tf 40 740 Td (Project overview. Scanned details on page two.) Tj ET';
  const raster='q 612 0 0 792 0 0 cm /Im1 Do Q'+(header?` BT /F1 14 Tf 40 770 Td (${header}) Tj ET`:'');
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [4 0 R 6 0 R] /Count 2 >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>',
    `<< /Length ${Buffer.byteLength(cover)} >>\nstream\n${cover}\nendstream`,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> /XObject << /Im1 8 0 R >> >> /Contents 7 0 R >>',
    `<< /Length ${Buffer.byteLength(raster)} >>\nstream\n${raster}\nendstream`,
    Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 1224 /Height 1584 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),jpeg,Buffer.from('\nendstream')])
  ];
  const parts=[Buffer.from('%PDF-1.4\n')],offsets=[0];let length=parts[0].length;
  objects.forEach((o,i)=>{offsets.push(length);const b=Buffer.concat([Buffer.from(`${i+1} 0 obj\n`),Buffer.from(o),Buffer.from('\nendobj\n')]);parts.push(b);length+=b.length;});
  parts.push(Buffer.from(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Root 1 0 R /Size ${objects.length+1} >>\nstartxref\n${length}\n%%EOF\n`));
  return {pdf:Buffer.concat(parts),png:canvas.toBuffer('image/png')};
}
