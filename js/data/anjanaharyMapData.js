// ─── Geo & Architectural Data: Cimetière d'Anjanahary & Ampasapito ──────────
// Scraped & synthesized from OpenStreetMap (Ways 45810357, 76181286, 45980202,
// 1291650717, 301637375) and Antananarivo historical municipal records.

export const ANJANAHARY_GEO = {
  name: "Cimetière d'Anjanahary & Ampasapito",
  malagasy_name: "Fasan'Anjanahary sy Ampasapito",
  location: "Antananarivo Renivohitra, 5e Arrondissement, Madagascar",
  coordinates: { lat: -18.89626, lon: 47.54028, elevation_m: 1285 },
  area_ha: 12.0,
  lots_total: 66,
  founded: 1880,

  // World arena dimensions for 2.5D isometric projection
  arena: {
    w: 2400,
    h: 2200,
    // Key landmarks in arena coordinates
    vavahadyNorth: { x: 1080, y: 340, name: "Vavahady Lehibe (North Gate)" },
    ampasapitoEast: { x: 2180, y: 460, name: "Vavahady Ampasapito (East Gate)" },
    soavinandrianaSouth: { x: 1260, y: 2060, name: "Porte Soavinandriana (South Gate)" },
    carreMilitaire: { x: 1680, y: 920, name: "Carré Militaire (Lots 38-39)" },
    tsangambato: { x: 1680, y: 920, name: "Monument aux Morts (Tsangambato)" },
    fasamBahiny: { x: 520, y: 1320, name: "Fasam-bahiny 1880 (Historic Vaults)" },
    crossroads: { x: 1140, y: 920, name: "Carrefour Central" },
    stonemasons: { x: 2040, y: 420, name: "Mpanao Vato Fasana (Stonemasons)" },
  },

  // Thoroughfares
  roads: {
    rasoamiaramanana: {
      name: "Làlana Rasoamiaramanana",
      desc: "Connects Anjanahary west to Ampasapito east roundabout",
      y: 190,
      width: 140,
    },
    alleeCentrale: {
      name: "Allée Centrale Pavée",
      desc: "Granite cobblestone avenue (OSM way 45980202)",
      x1: 1080, y1: 260,
      x2: 1240, y2: 2100,
      width: 110,
    },
    alleeMilitaire: {
      name: "Allée du Carré Militaire",
      desc: "Cross avenue linking Allée Centrale to Carré Militaire",
      y: 920,
      x1: 1100, x2: 2100,
      width: 80,
    },
    sentierCaveaux: {
      name: "Elakelan-trano Fasana",
      desc: "Labyrinthine red laterite paths between family vaults (OSM way 1291650717)",
    },
  },
};

export const MALAGASY_LORE = {
  sectors: [
    { id: "allee_centrale", mal: "Allée Centrale Pavée", fr: "Grand Axe d'Anjanahary", sub: "Cobblestone artery cutting through 12 hectares of tombs" },
    { id: "carre_militaire", mal: "Kianjan'ny Miaramila", fr: "Carré Militaire (Lots 38-39)", sub: "Fallen French soldiers & Tirailleurs Malgaches" },
    { id: "fasana_nentindrazana", mal: "Faritra Fasana 66", fr: "Caveaux Familiaux Merina", sub: "Granite multi-tier family vaults of Antananarivo" },
    { id: "fasam_bahiny", mal: "Fasam-bahiny 1880", fr: "Nécropole Historique", sub: "Oldest colonial mausoleums from 1880" },
    { id: "ampasapito", mal: "Terminus Ampasapito", fr: "Bordure Ampasapito & Mpanao Vato", sub: "Taxi-Be 154 terminus & tomb stonecutters" },
  ],

  waveFlavor: [
    "The dead of Anjanahary awaken under the blood moon.",
    "Echoes from the Carré Militaire: the fallen Tirailleurs rise.",
    "Ny Angatra sy ny Lolo vokatra mananika ny tamboho.",
    "Red laterite dust rises over Ampasapito — hold the Great Gate!",
    "The stone vaults of Lot 38 have been cracked open.",
    "Ancient colonial spirits stir in the 1880 Fasam-bahiny.",
    "The Kinoly claws through the granite steps.",
    "Dawn will not reach Anjanahary. Stand firm among the tombs.",
  ],

  bannerTitles: [
    "VAVAHADY LEHIBE · NORTH GATE",
    "KIANJAN'NY MIARAMILA · CARRÉ MILITAIRE",
    "ELAKELAN-TRANO FASANA · TOMB LABYRINTH",
    "FASAM-BAHINY 1880 · HISTORIC CRYPTS",
    "TERMINUS AMPASAPITO · EAST GATEWAY",
    "ALIN'NY FASANA · NIGHT OF THE FALLEN",
  ],
};

/** Returns the authentic Anjanahary historical/geographical sector for coordinates (x, y) */
export function getAnjanaharySector(x, y) {
  if (y < 330) return "LÀLANA RASOAMIARAMANANA · NORTH GATE";
  if (x > 2000 && y < 650) return "TERMINUS AMPASAPITO · STONEMASONS";
  if (x >= 1420 && x <= 1940 && y >= 720 && y <= 1160) return "CARRÉ MILITAIRE · LOTS 38-39";
  if (x >= 980 && x <= 1260) return "ALLÉE CENTRALE PAVÉE";
  if (x < 650 && y > 1200 && y < 1750) return "FASAM-BAHINY 1880 · HISTORIC CRYPTS";
  if (x < 1000) return "FARITRA FASANA 1-35 · WEST LABYRINTH";
  return "FARITRA FASANA 36-66 · EAST VAULTS";
}
