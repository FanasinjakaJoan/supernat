// ─── Test Suite: Anjanahary Cemetery & Ampasapito Map Architecture ─────────
// Tests scraped OSM data, coordinate mapping, sector classification,
// prop synthesis, and 2.5D rendering of Malagasy cemetery structures.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let failures = 0;
const assert = (cond, msg) => {
  if (cond) {
    console.log('  ✓ ' + msg);
  } else {
    failures++;
    console.error('  ✗ FAIL: ' + msg);
  }
};

console.log('=== TEST SUITE: ANJANAHARY & AMPASAPITO MAP ===');

// 1. Validate Scraped OpenStreetMap Data
console.log('\n─ Scraped OpenStreetMap Dataset ─');
const dataPath = path.join(__dirname, '..', 'data', 'ampasapito_anjanahary_data.json');
assert(fs.existsSync(dataPath), 'ampasapito_anjanahary_data.json exists');
const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
assert(rawData.metadata && rawData.metadata.site_name.includes('Anjanahary'), 'Metadata site name is Anjanahary');
assert(rawData.metadata.coordinates.latitude === -18.89626, 'Latitude is -18.89626');
assert(rawData.metadata.coordinates.longitude === 47.54028, 'Longitude is 47.54028');
assert(rawData.metadata.area_hectares === 12.0, 'Area is 12 hectares');
assert(rawData.metadata.lots_count === 66, 'Recounts 66 historical lots');
assert(rawData.cemetery_boundary.length >= 25, `Cemetery perimeter contains ${rawData.cemetery_boundary.length} OSM boundary nodes`);
assert(rawData.thoroughfares.rue_rasoamiaramanana.nodes.length >= 5, 'Contains Làlana Rasoamiaramanana (Rue Rasoamiaramanana) nodes');
assert(rawData.thoroughfares.allee_centrale.nodes.length >= 5, 'Contains Allée Centrale Pavée nodes');
assert(rawData.sectors.carre_militaire !== undefined, 'Contains Carré Militaire sector definition');
assert(rawData.sectors.ampasapito_stonemasons !== undefined, 'Contains Ampasapito stonemasons definition');

// 2. Validate Map Data Module
console.log('\n─ In-Engine Map Data Module ─');
const { ANJANAHARY_GEO, MALAGASY_LORE, getAnjanaharySector } = await import('../js/data/anjanaharyMapData.js');
assert(ANJANAHARY_GEO.area_ha === 12.0, 'Module area is 12.0 ha');
assert(ANJANAHARY_GEO.arena.w === 2400 && ANJANAHARY_GEO.arena.h === 2200, 'Module arena is 2400x2200');
assert(MALAGASY_LORE.sectors.length >= 5, `Defined ${MALAGASY_LORE.sectors.length} Malagasy sectors`);
assert(MALAGASY_LORE.waveFlavor.length >= 8, 'Defined 8 Malagasy wave flavor strings');

// 3. Validate Sector Classification
console.log('\n─ Historical Sector Spatial Classification ─');
assert(getAnjanaharySector(1000, 200).includes('LÀLANA RASOAMIARAMANANA'), 'North coordinates map to Làlana Rasoamiaramanana');
assert(getAnjanaharySector(2150, 400).includes('AMPASAPITO'), 'East coordinates map to Terminus Ampasapito');
assert(getAnjanaharySector(1680, 920).includes('CARRÉ MILITAIRE'), 'Military coordinates map to Carré Militaire');
assert(getAnjanaharySector(1100, 1200).includes('ALLÉE CENTRALE'), 'Central coordinates map to Allée Centrale Pavée');
assert(getAnjanaharySector(400, 1400).includes('FASAM-BAHINY 1880'), 'Southwest coordinates map to Fasam-bahiny 1880');
assert(getAnjanaharySector(600, 700).includes('FARITRA FASANA 1-35'), 'West coordinates map to Faritra Fasana 1-35');
assert(getAnjanaharySector(1600, 1500).includes('FARITRA FASANA 36-66'), 'Southeast coordinates map to Faritra Fasana 36-66');

// 4. Validate Props Synthesis
console.log('\n─ Anjanahary 2.5D Props Synthesis ─');
const { createCityProps, drawProp } = await import('../js/iso.js');
const props = createCityProps(2400, 2200);
assert(props.length >= 80, `Generated ${props.length} 2.5D props across the cemetery`);

const kinds = new Set(props.map(p => p.kind));
assert(kinds.has('fasana'), 'Props include Malagasy family vaults (fasana)');
assert(kinds.has('monument'), 'Props include Carré Militaire War Memorial (monument)');
assert(kinds.has('military_grave'), 'Props include military war graves (military_grave)');
assert(kinds.has('tamboho'), 'Props include Malagasy clay & stone perimeter walls (tamboho)');
assert(kinds.has('vavahady'), 'Props include Monumental iron gates (vavahady)');
assert(kinds.has('taxi_be'), 'Props include Malagasy Taxi-Be 154 minibus (taxi_be)');
assert(kinds.has('taxi_ville'), 'Props include Antananarivo Taxi-Ville (taxi_ville)');
assert(kinds.has('stonemason_bench'), 'Props include Ampasapito stonecutter workshops (stonemason_bench)');
assert(kinds.has('tree'), 'Props include Highland flora trees (tree)');

const treeTypes = new Set(props.filter(p => p.kind === 'tree').map(p => p.treeType));
assert(treeTypes.has('jacaranda'), 'Flora includes blooming Jacarandas with violet blossoms');
assert(treeTypes.has('cypress'), 'Flora includes Italian Cypresses');
assert(treeTypes.has('eucalyptus'), 'Flora includes Lemon Eucalyptus');

const fasanaStyles = new Set(props.filter(p => p.kind === 'fasana').map(p => p.style));
assert(fasanaStyles.has('grand'), 'Vaults include multi-tier patriarchal grand vaults');
assert(fasanaStyles.has('standard'), 'Vaults include standard Merina family vaults');
assert(fasanaStyles.has('colonial'), 'Vaults include 1880 Fasam-bahiny colonial vaults');

// 5. Validate 2.5D Canvas Rendering for Every Prop Kind
console.log('\n─ 2.5D Canvas Drawing Pipeline ─');
const mockCtx = {
  save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
  beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {},
  stroke() {}, fill() {}, arc() {}, ellipse() {}, fillRect() {}, strokeRect() {},
  fillText() {}, createLinearGradient: () => ({ addColorStop() {} }),
  createRadialGradient: () => ({ addColorStop() {} }),
  setLineDash() {},
};

let renderedCount = 0;
for (const p of props) {
  drawProp(mockCtx, p, 1140, 920, 1280, 720, 1.5);
  renderedCount++;
}
assert(renderedCount === props.length, `Rendered all ${renderedCount} props through drawProp without error`);

console.log(`\n=== RESULTS: ${failures === 0 ? 'ALL ANJANAHARY MAP TESTS PASSED ✓' : `${failures} FAILURE(S) ✗`} ===`);
process.exit(failures === 0 ? 0 : 1);
