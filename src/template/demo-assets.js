// Stand-in images for the demo (fictitious brand): simple drawn seals and icons, no logo.
// A real company passes its own logo, icons and the official MINSAL seals.

const svgUrl = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function seal(lines) {
  const t = lines.map((l, i) => `<text x="50" y="${52 + i * 13 - (lines.length - 1) * 6}" font-family="Arial, sans-serif" font-weight="700" font-size="${l.length > 9 ? 10 : 12}" fill="#fff" text-anchor="middle">${l}</text>`).join('');
  return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="30,2 70,2 98,30 98,70 70,98 30,98 2,70 2,30" fill="#000"/><polygon points="31,6 69,6 94,31 94,69 69,94 31,94 6,69 6,31" fill="none" stroke="#fff" stroke-width="2"/><text x="50" y="30" font-family="Arial, sans-serif" font-weight="700" font-size="13" fill="#fff" text-anchor="middle">ALTO EN</text>${t}<text x="50" y="84" font-family="Arial, sans-serif" font-size="7" fill="#fff" text-anchor="middle">DEMO</text></svg>`);
}

const dot = (letter) => `<svg viewBox="0 0 10 10" width="8" height="8" aria-hidden="true"><circle cx="5" cy="5" r="5" fill="#2B1A10"></circle><text x="5" y="7.3" font-family="Arial, sans-serif" font-size="6.5" font-weight="700" fill="#fff" text-anchor="middle">${letter}</text></svg>`;

export function demoAssets() {
  return {
    logo: null,
    signatureIcon: null,
    seals: {
      energy: seal(['CALORÍAS']),
      sugars: seal(['AZÚCARES']),
      saturated_fat: seal(['GRASAS', 'SATURADAS']),
      sodium: seal(['SODIO']),
    },
    icons: { instagram: dot('i'), whatsapp: dot('w'), facebook: dot('f') },
  };
}
