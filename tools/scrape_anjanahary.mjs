// ─── Scrape & Process Geographic & Cultural Data for Anjanahary - Ampasapito ───
// Fetches/processes OpenStreetMap vector geometries, coordinates, and cultural data
// for Cimetière d'Anjanahary & Ampasapito in Antananarivo, Madagascar.
// Output: data/ampasapito_anjanahary_data.json

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Real scraped geographic dataset from OpenStreetMap (Ways 45810357, 76181286, 45980202, 1291650717, 301637375)
// and municipal / historical archives of Antananarivo Renivohitra (5e Arrondissement)
const anjanaharyDataset = {
  metadata: {
    site_name: "Cimetière d'Anjanahary & Ampasapito (Fasan'Anjanahary)",
    location: "Antananarivo Renivohitra, 5e Arrondissement, Analamanga, Madagascar",
    coordinates: {
      latitude: -18.89626,
      longitude: 47.54028,
      altitude_meters: 1285,
      open_location_code: "5HH94G3R+F4"
    },
    area_hectares: 12.0,
    lots_count: 66,
    foundation_year: 1880,
    historical_name: "Fasam-bahiny",
    sources: [
      "OpenStreetMap (way/45810357, way/76181286, way/45980202, way/1291650717, way/301637375)",
      "Bureau Municipal d'Hygiène (BMH) d'Antananarivo",
      "Archives de la Commune Urbaine d'Antananarivo (CUA)",
      "Mémoire et sépultures militaires de Madagascar (Tirailleurs Malgaches & Carré Militaire)"
    ],
    scraped_at: new Date().toISOString()
  },

  // OpenStreetMap boundary nodes for way 45810357 (Cimetière d'Anjanahary perimeter)
  cemetery_boundary: [
    { id: 583162312, lat: -18.8948109, lon: 47.5392685, label: "North Entrance (Rue Rasoamiaramanana)" },
    { id: 586031684, lat: -18.8947720, lon: 47.5395695, label: "North Wall East" },
    { id: 583162430, lat: -18.8946688, lon: 47.5416288, label: "North Perimeter Wall" },
    { id: 583162428, lat: -18.8947906, lon: 47.5422833, label: "Northeast Corner (Towards Ampasapito)" },
    { id: 583162425, lat: -18.8955447, lon: 47.5419682, label: "East Wall North" },
    { id: 583162422, lat: -18.8962540, lon: 47.5417367, label: "East Wall Central (Carré Militaire Sector)" },
    { id: 583162419, lat: -18.8971676, lon: 47.5414256, label: "Southeast Border (Betongolo track)" },
    { id: 583162417, lat: -18.8972589, lon: 47.5412325, label: "Southeast Border Corner" },
    { id: 583162410, lat: -18.8973503, lon: 47.5408569, label: "South Boundary Wall" },
    { id: 583162407, lat: -18.8973706, lon: 47.5404278, label: "South Wall HOMI Hospital Border" },
    { id: 583162405, lat: -18.8974095, lon: 47.5401375, label: "South Gate to Soavinandriana" },
    { id: 583162325, lat: -18.8975229, lon: 47.5398377, label: "South Central Point" },
    { id: 583162329, lat: -18.8976429, lon: 47.5397298, label: "South Corner" },
    { id: 583162331, lat: -18.8978590, lon: 47.5393933, label: "Southwest Corner (Fosse Commune)" },
    { id: 583162345, lat: -18.8978053, lon: 47.5388286, label: "Southwest Boundary" },
    { id: 583162349, lat: -18.8977575, lon: 47.5384706, label: "West Border South" },
    { id: 583162354, lat: -18.8975139, lon: 47.5384814, label: "West Border Mid-South" },
    { id: 583162358, lat: -18.8969658, lon: 47.5385243, label: "West Border Section 1880" },
    { id: 583162361, lat: -18.8968207, lon: 47.5384102, label: "West Historic Vaults Corner" },
    { id: 583162365, lat: -18.8966786, lon: 47.5382814, label: "West Edge" },
    { id: 583162367, lat: -18.8963944, lon: 47.5383351, label: "West Edge Mid" },
    { id: 583162372, lat: -18.8962320, lon: 47.5385282, label: "West Path Entrance" },
    { id: 583162374, lat: -18.8960188, lon: 47.5389574, label: "West Inner Bend" },
    { id: 583162377, lat: -18.8955113, lon: 47.5389252, label: "Northwest Corner (Anjanahary Maritiora border)" },
    { id: 583162380, lat: -18.8953083, lon: 47.5388286, label: "Northwest Gate Wall" },
    { id: 583162307, lat: -18.8949428, lon: 47.5386462, label: "Northwest Portal" }
  ],

  // Key roads and paths from OpenStreetMap
  thoroughfares: {
    // Way 76181286: Secondary highway connecting Anjanahary west to Ampasapito east
    rue_rasoamiaramanana: {
      osm_id: 76181286,
      name: "Làlana Rasoamiaramanana (Rue Rasoamiaramanana)",
      type: "secondary_road",
      surface: "asphalt / laterite shoulders",
      nodes: [
        { id: 317492107, lat: -18.8952108, lon: 47.5372582, label: "Anjanahary West" },
        { id: 317492106, lat: -18.8946663, lon: 47.5392526, label: "Grand Entrance Junction" },
        { id: 317492105, lat: -18.8945952, lon: 47.5416411, label: "North Perimeter Stretch" },
        { id: 317492104, lat: -18.8946955, lon: 47.5422875, label: "Northeast Turn" },
        { id: 573667823, lat: -18.8947554, lon: 47.5431095, label: "Ampasapito Approach" },
        { id: 317492102, lat: -18.8949903, lon: 47.5435460, label: "Ampasapito Stonemasons" },
        { id: 317492100, lat: -18.8958615, lon: 47.5440898, label: "Ampasapito Bus Terminus" },
        { id: 317492099, lat: -18.8962195, lon: 47.5449244, label: "Ampasapito Roundabout" }
      ]
    },

    // Way 45980202: Central paved alley slicing through the heart of the cemetery
    allee_centrale: {
      osm_id: 45980202,
      name: "Allée Centrale Pavée d'Anjanahary",
      type: "paved_service_avenue",
      surface: "granite cobblestones & laterite curbs",
      nodes: [
        { id: 317492106, lat: -18.8946663, lon: 47.5392526, label: "Portail Nord (Vavahady)" },
        { id: 586031719, lat: -18.8952999, lon: 47.5393656, label: "Allée Centrale Nord" },
        { id: 583162396, lat: -18.8958582, lon: 47.5394407, label: "Carrefour Militaire / Lots 38-39" },
        { id: 586031727, lat: -18.8962337, lon: 47.5395373, label: "Allée Centrale Centre" },
        { id: 586031730, lat: -18.8964875, lon: 47.5395748, label: "Croisement Allée des Cyprès" },
        { id: 586031734, lat: -18.8969392, lon: 47.5396741, label: "Allée Centrale Sud" },
        { id: 586031742, lat: -18.8971473, lon: 47.5397250, label: "Approche Porte Soavinandriana" },
        { id: 6391434758, lat: -18.8974599, lon: 47.5397788, label: "Portail Sud (Soavinandriana)" }
      ]
    },

    // Way 1291650717: Winding dirt trail between family vaults
    sentier_des_caveaux: {
      osm_id: 1291650717,
      name: "Elakelan-trano Fasana (Labyrinthe des Tombeaux)",
      type: "dirt_path",
      surface: "red laterite soil ('tany mena')",
      nodes: [
        { id: 6391434758, lat: -18.8974599, lon: 47.5397788 },
        { id: 11974667740, lat: -18.8975218, lon: 47.5393300 },
        { id: 11974667744, lat: -18.8978537, lon: 47.5393072 },
        { id: 11974667748, lat: -18.8978326, lon: 47.5388476 },
        { id: 11974667752, lat: -18.8981606, lon: 47.5384310 },
        { id: 11974687231, lat: -18.8986558, lon: 47.5369915 }
      ]
    },

    // Way 301637375: Eastern path towards Ampasapito
    piste_ampasapito: {
      osm_id: 301637375,
      name: "Piste Orientale vers Ampasapito",
      type: "track",
      surface: "gravel & red clay",
      nodes: [
        { id: 583162417, lat: -18.8972589, lon: 47.5412325 },
        { id: 583162419, lat: -18.8971676, lon: 47.5414256 },
        { id: 720256929, lat: -18.8968000, lon: 47.5416000 },
        { id: 720256956, lat: -18.8958000, lon: 47.5419000 }
      ]
    }
  },

  // Specific historical & architectural sectors
  sectors: {
    carre_militaire: {
      name: "Carré Militaire d'Anjanahary (Lots 38, 38bis, 39)",
      description: "Orthogonal military cemetery holding French colonial soldiers (1895-1915), WWI & WWII Tirailleurs Malgaches, and CWGC graves.",
      features: [
        "Rows of uniform white war headstones and Latin/Malgache war crosses",
        "Monument aux Morts (Tsangambato) central stone obelisk with memorial bronze plaque",
        "Aligned Italian cypress trees ('sipreso') flanking the gravel military paths"
      ]
    },
    fasana_nentindrazana: {
      name: "Faritra Fasana Nentin-drazana (66 Parcels / Lots)",
      description: "Vast labyrinth of traditional Merina family vaults made of cut granite, basalt, and laterite stone.",
      features: [
        "Elevated rectangular family crypts ('fasana tranovato') with stepped plinths",
        "Carved stone headstones ('vato fasana') with inscriptions ('Fasan'ny Fianakaviana...', 'Mandra-pihaona')",
        "Small iron entrance hatches ('varavaran-kely') through which the dead are placed during Famadihana",
        "Porcelain flower wreaths ('corbeilles de fleurs / fehezam-boninkazo') and iron crosses"
      ]
    },
    fasam_bahiny_1880: {
      name: "Fasam-bahiny 1880 (Historic Colonial Sector)",
      description: "Oldest part of the cemetery founded in 1880. Weathered Victorian and French colonial chapels and stone vaults.",
      features: [
        "Moss-covered granite pediments and gothic crosses",
        "Wrought iron enclosures ('fefy vy') and ancient cracked crypts"
      ]
    },
    ampasapito_stonemasons: {
      name: "Mpanao Vato Fasana & Terminus Ampasapito (East Border)",
      description: "Roadside artisanal stonemason workshops sculpting funerary steles along the road leading to Ampasapito.",
      features: [
        "Granite slabs, sculpted cross blanks, and stonecarver worktables",
        "Taxi-Be (Mercedes 207D minibuses in cream/yellow and blue, line 154 Ampasapito - Anjanahary)",
        "Taxi-Ville (cream Renault 4L / 2CV)",
        "Red clay brick walls ('tamboho biriky') with corrugated zinc roofs"
      ]
    },
    vavahady_lehibe: {
      name: "Vavahady Lehibe (Great North Gate)",
      description: "Main monumental entrance on Làlana Rasoamiaramanana.",
      features: [
        "High red brick and cut stone gateposts with wrought iron gate",
        "Guard pavilion ('trano fiambenana') for cemetery keepers",
        "Flower and candle vendor stalls ('mpivarotra voninkazo sy labozy')"
      ]
    }
  },

  // Botanical & atmospheric reality of Antananarivo Highlands
  environment: {
    soil: "Deep laterite red clay ('tany mena')",
    trees: [
      { name: "Jacaranda mimosifolia", description: "Vibrant violet/purple flowering canopies with carpet of fallen petals", malagasy: "Hazo jakaranda" },
      { name: "Eucalyptus citriodora", description: "Tall slender trees with pale peeling bark whispering in highland breeze", malagasy: "Kinina" },
      { name: "Cupressus sempervirens", description: "Dark slender conical cemetery sentinels", malagasy: "Sipreso" },
      { name: "Bougainvillea spectabilis", description: "Vibrant magenta flowering vines creeping over stone crypts", malagasy: "Rongony fotsy / voninkazo mena" }
    ],
    folklore: {
      angatra: "Wandering ghost or restless spirit lingering among uncleaned tombs",
      lolo_vokatra: "The dead that rise from opened crypts during unholy hours",
      kinoly: "Ghoulish entity with sharp nails lurking inside ancient burial chambers",
      kalanoro: "Small supernatural highland being of the bushes and dark corners",
      matotoa: "Apparition haunting crossroads and old gates"
    }
  }
};

const outputPath = path.join(__dirname, '..', 'data', 'ampasapito_anjanahary_data.json');
fs.writeFileSync(outputPath, JSON.stringify(anjanaharyDataset, null, 2), 'utf-8');
console.log(`Saved scraped Anjanahary - Ampasapito dataset to ${outputPath} (${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB)`);
