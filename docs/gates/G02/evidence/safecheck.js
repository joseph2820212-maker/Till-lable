// Evidence for the G2 report, measured in the real rendered page with the embedded fonts:
//  - minInkEdgeMm: closest distance from any printed glyph / bar to its label's cut edge
//  - bottom critical content (SKU, unit price, barcode digits): ink distance from the bottom cut edge
//  - overlaps: pairs of printed elements whose INK boxes intersect (touching text)
// Ink boxes come from canvas measureText (actualBoundingBox*), per line, in the same font and size.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const fs = require('fs');
  const rows = [];
  for (const f of fs.readdirSync('.').filter(f => f.endsWith('.html') && !f.startsWith('calibration'))) {
    await p.goto('file://' + process.cwd() + '/' + f);
    await p.evaluate(() => document.fonts.ready);
    const r = await p.evaluate(() => {
      const mm = 96 / 25.4;
      const ctx = document.createElement('canvas').getContext('2d');
      const inkBoxes = el => {
        if (el.tagName.toLowerCase() === 'svg') return [el.getBoundingClientRect()];
        const cs = getComputedStyle(el);
        const out = [];
        // One box per text node line fragment: baseline from a zero-height inline marker is costly; use rects and
        // font ascent/descent from canvas to convert the line box into the glyph ink box.
        const range = document.createRange(); range.selectNodeContents(el);
        for (const lr of range.getClientRects()) {
          if (lr.width < 0.5) continue;
          ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
          const m = ctx.measureText(el.textContent || 'H');
          const fa = m.fontBoundingBoxAscent, fd = m.fontBoundingBoxDescent;
          const baseline = lr.top + (lr.height - (fa + fd)) / 2 + fa;
          out.push({ left: lr.left, right: lr.right, top: baseline - m.actualBoundingBoxAscent, bottom: baseline + m.actualBoundingBoxDescent });
        }
        return out;
      };
      let minEdge = 1e9, minEl = '', outside = 0, overlaps = 0; const bottoms = [];
      const pairs = [];
      for (const slot of document.querySelectorAll('.slot')) {
        const s = slot.getBoundingClientRect();
        const items = [];
        for (const el of slot.querySelectorAll('.band span,.name,.second,.small,.price,.nowline,.unit,.sku,.digits,.barcode svg')) {
          const cls = String(el.className?.baseVal ?? el.className) || el.parentElement.className;
          for (const bx of inkBoxes(el)) {
            const d = Math.min(bx.left - s.left, s.right - bx.right, bx.top - s.top, s.bottom - bx.bottom) / mm;
            if (d < minEdge) { minEdge = d; minEl = cls; }
            if (d < 0) outside++;
            if (/sku|digits|unit/.test(cls)) bottoms.push((s.bottom - bx.bottom) / mm);
            items.push({ bx, cls });
          }
        }
        for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
          if (items[i].cls === items[j].cls) continue;
          if (/band/.test(items[i].cls + items[j].cls)) continue; // band text sits on its own fill
          const a = items[i].bx, c = items[j].bx;
          const ix = Math.min(a.right, c.right) - Math.max(a.left, c.left), iy = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
          if (ix > 0 && iy > 0) { overlaps++; if (pairs.length < 4) pairs.push(`${items[i].cls}×${items[j].cls}`); }
        }
      }
      return { labels: document.querySelectorAll('.slot').length, minInkEdgeMm: +minEdge.toFixed(2), closest: minEl, outside, overlaps, pairs, minBottomCriticalInkMm: bottoms.length ? +Math.min(...bottoms).toFixed(2) : null };
    });
    rows.push({ file: f, ...r });
  }
  console.log(rows.map(r => `${r.file.padEnd(32)} labels ${String(r.labels).padStart(2)} · min ink→cut ${r.minInkEdgeMm} mm (${r.closest}) · bottom critical ink ${r.minBottomCriticalInkMm ?? '—'} mm · outside ${r.outside} · overlaps ${r.overlaps} ${r.pairs.join(' ')}`).join('\n'));
  fs.writeFileSync('safecheck.json', JSON.stringify(rows, null, 1));
  await b.close();
})();
