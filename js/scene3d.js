// scene3d.js — Scène 3D géospatiale (MapLibre GL JS + deck.gl).
//  - MapLibre : fond OSM raster, terrain 3D (DEM Terrarium), ombrage, bâtiments
//    en extrusion (fill-extrusion), pitch/bearing.
//  - deck.gl (MapLibreOverlay interleaved) : LE FAISCEAU est un vrai segment 3D
//    dont les coordonnées portent une altitude z ABSOLUE en mètres. En mode
//    "interleaved" deck.gl partage le contexte WebGL2 et le depth buffer de
//    MapLibre : le faisceau est donc testé en profondeur (depthTest) contre le
//    terrain ET les bâtiments. Un obstacle plus haut que le faisceau le masque
//    réellement à l'écran (ce n'est PAS une ligne drapée sur le sol).
//
// Les globals maplibregl / deck sont fournis par les scripts CDN (voir index.html).

import {
  TILES,
  COLORS,
  DEFAULT_EXAGGERATION,
  SITE_A,
  SITE_B,
} from "./config.js";

// Convertit "#rrggbb" -> [r,g,b].
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export class Scene3D {
  constructor(container) {
    this.map = null;
    this.overlay = null;
    this.container = container;

    // État du faisceau / marqueurs (coordonnées [lon, lat, altitude_m]).
    this._beam = null; // { source:[lon,lat,z], target:[lon,lat,z], blocked:bool }
    this._obstructions = []; // [{lon,lat,top}]
    this._beamVisible = true;
    this._buildingsVisible = true;
    // Facteur d'exagération verticale courant du terrain MapLibre. On l'applique
    // AUSSI aux altitudes rendues par deck.gl (faisceau/marqueurs) pour que les
    // extrémités restent ancrées à la surface exagérée. VISUEL UNIQUEMENT :
    // n'altère jamais le calcul de ligne de visée (voir _refreshLayers).
    this._exaggeration = DEFAULT_EXAGGERATION;
  }

  /** Initialise la carte MapLibre + terrain 3D. Résout quand le style est prêt. */
  init() {
    const mid = {
      lon: (SITE_A.lon + SITE_B.lon) / 2,
      lat: (SITE_A.lat + SITE_B.lat) / 2,
    };

    this.map = new maplibregl.Map({
      container: this.container,
      center: [mid.lon, mid.lat],
      zoom: 12,
      pitch: 62, // vue inclinée pour percevoir les altitudes
      bearing: 55, // orienté approximativement de A vers B
      maxPitch: 85,
      antialias: true,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: [TILES.osm],
            tileSize: 256,
            attribution: TILES.osmAttribution,
          },
          "terrain-dem": {
            type: "raster-dem",
            tiles: [TILES.terrarium],
            tileSize: 256,
            maxzoom: 15,
            encoding: "terrarium",
            attribution: TILES.terrariumAttribution,
          },
        },
        layers: [
          { id: "osm", type: "raster", source: "osm" },
          {
            id: "hillshade",
            type: "hillshade",
            source: "terrain-dem",
            paint: { "hillshade-exaggeration": 0.4 },
          },
        ],
      },
    });

    // Boussole MapLibre orientable À LA SOURIS sur TOUS les axes. Avec
    // visualizePitch:true + showCompass:true, un glisser sur la boussole change
    // à la fois le cap (bearing, glisser gauche/droite) ET l'inclinaison (pitch,
    // glisser haut/bas) ; l'aiguille s'incline pour visualiser le pitch courant,
    // et un clic réinitialise le cap au nord (et le pitch à plat). Les
    // interactions MapLibre dragRotate / touchZoomRotate (actives par défaut, non
    // désactivées) permettent aussi d'orienter la vue par clic-droit / ctrl-glisser
    // directement sur la carte. Placée en haut à droite : ne recouvre pas les
    // boutons cardinaux N/E/S/O (haut à gauche), complémentaires.
    this.map.addControl(
      new maplibregl.NavigationControl({
        showCompass: true,
        showZoom: true,
        visualizePitch: true,
      }),
      "top-right"
    );

    return new Promise((resolve, reject) => {
      this.map.on("error", (e) => {
        // On ne rejette pas sur les erreurs de tuiles isolées, seulement on log.
        // eslint-disable-next-line no-console
        console.warn("MapLibre:", e && e.error ? e.error.message : e);
      });
      this.map.on("load", () => {
        // Terrain 3D : relief issu du DEM Terrarium.
        this.map.setTerrain({
          source: "terrain-dem",
          exaggeration: DEFAULT_EXAGGERATION,
        });
        // Overlay deck.gl interleaved (partage le depth buffer de MapLibre).
        const Overlay = deck.MapLibreOverlay || deck.MapboxOverlay;
        this.overlay = new Overlay({ interleaved: true, layers: [] });
        this.map.addControl(this.overlay);
        this._refreshLayers();
        resolve();
      });
    });
  }

  /**
   * Règle l'exagération verticale du terrain 3D ET met à jour les couches
   * deck.gl : le faisceau et les marqueurs sont redessinés avec des altitudes
   * mises à l'échelle du même facteur, afin de rester collés à la surface
   * exagérée. C'est une mise à l'échelle VISUELLE : le calcul de ligne de visée
   * n'est pas affecté.
   */
  setExaggeration(v) {
    this._exaggeration = v;
    if (this.map && this.map.getTerrain()) {
      this.map.setTerrain({ source: "terrain-dem", exaggeration: v });
    }
    // Met à l'échelle la hauteur rendue des bâtiments par le même facteur, pour
    // qu'ils suivent le terrain exagéré de façon cohérente avec le faisceau.
    this._updateBuildingExaggeration();
    // Re-rend le faisceau/marqueurs avec les z mis à l'échelle du nouveau facteur.
    this._refreshLayers();
  }

  // --- Bâtiments (fill-extrusion) ---

  /**
   * Expression de hauteur d'extrusion mise à l'échelle de l'exagération.
   * VISUEL UNIQUEMENT : avec le terrain 3D, MapLibre pose la base de l'extrusion
   * (fill-extrusion-base = 0) sur la surface du terrain, elle-même exagérée par
   * le facteur d'exagération. On multiplie donc la hauteur VRAIE du bâtiment par
   * ce facteur pour que le toit rendu atteigne (sol + hauteur) × exagération,
   * exactement comme le faisceau rendu à altitude × exagération. La hauteur VRAIE
   * (properties.height) reste intacte et seule utilisée par le calcul de ligne de
   * visée (los.js) : l'exagération n'affecte JAMAIS le verdict ni le profil 2D.
   */
  _buildingHeightExpr() {
    return ["*", ["get", "height"], this._exaggeration];
  }

  /** Applique la hauteur d'extrusion exagérée à la couche existante. */
  _updateBuildingExaggeration() {
    if (this.map && this.map.getLayer("buildings-3d")) {
      this.map.setPaintProperty(
        "buildings-3d",
        "fill-extrusion-height",
        this._buildingHeightExpr()
      );
    }
  }

  /** Ajoute / remplace la couche de bâtiments en extrusion 3D. */
  setBuildings(fc) {
    const src = this.map.getSource("buildings");
    if (src) {
      src.setData(fc);
      return;
    }
    this.map.addSource("buildings", { type: "geojson", data: fc });
    this.map.addLayer({
      id: "buildings-3d",
      type: "fill-extrusion",
      source: "buildings",
      paint: {
        // Rouge si le bâtiment obstrue le faisceau, couleur neutre sinon.
        "fill-extrusion-color": [
          "case",
          ["get", "obstructs"],
          COLORS.buildingObstruct,
          COLORS.buildingDefault,
        ],
        // Base posée sur la surface (exagérée) du terrain par MapLibre.
        "fill-extrusion-base": 0,
        // Hauteur mise à l'échelle de l'exagération (VISUEL UNIQUEMENT, cf.
        // _buildingHeightExpr) : à exagération 1.0 l'expression vaut height × 1
        // et rien ne change par rapport à l'échelle réelle.
        "fill-extrusion-height": this._buildingHeightExpr(),
        "fill-extrusion-opacity": 0.85,
      },
    });
    this._buildingsFC = fc;
  }

  /** Marque les bâtiments obstruants (set d'ids) en rouge et rafraîchit. */
  markObstructing(idSet) {
    if (!this._buildingsFC) return;
    for (const f of this._buildingsFC.features) {
      f.properties.obstructs = idSet.has(f.properties.id);
    }
    const src = this.map.getSource("buildings");
    if (src) src.setData(this._buildingsFC);
  }

  setBuildingsVisible(visible) {
    this._buildingsVisible = visible;
    if (this.map.getLayer("buildings-3d")) {
      this.map.setLayoutProperty(
        "buildings-3d",
        "visibility",
        visible ? "visible" : "none"
      );
    }
  }

  /**
   * Oriente la caméra vers un cap cardinal (bearing MapLibre) avec une
   * animation douce. Convention MapLibre : bearing = direction de la boussole
   * affichée en haut de la vue (0 = nord en haut, 90 = est, 180 = sud, 270 =
   * ouest). Seul le bearing change : le pitch, le centre et le zoom courants
   * sont préservés (easeTo ne modifie que les propriétés passées).
   */
  orientTo(bearing) {
    if (!this.map) return;
    this.map.easeTo({ bearing, duration: 500 });
  }

  setTerrainVisible(visible) {
    if (!this.map) return;
    this.map.setTerrain(
      visible ? { source: "terrain-dem", exaggeration: this._exaggeration } : null
    );
    if (this.map.getLayer("hillshade")) {
      this.map.setLayoutProperty(
        "hillshade",
        "visibility",
        visible ? "visible" : "none"
      );
    }
  }

  // --- Faisceau + marqueurs (deck.gl, altitude absolue en z) ---

  /**
   * Définit le faisceau 3D. altA/altB en mètres ABSOLUS.
   * blocked = true -> faisceau rouge, sinon vert.
   */
  setBeam(altA, altB, blocked) {
    this._beam = {
      // z est l'altitude ABSOLUE en mètres (3e composante des positions).
      source: [SITE_A.lon, SITE_A.lat, altA],
      target: [SITE_B.lon, SITE_B.lat, altB],
      blocked: !!blocked,
    };
    this._refreshLayers();
  }

  /** Points d'impact d'obstruction : [{lon,lat,top}] (altitude = top en m). */
  setObstructions(points) {
    this._obstructions = points || [];
    this._refreshLayers();
  }

  setBeamVisible(visible) {
    this._beamVisible = visible;
    this._refreshLayers();
  }

  /** (Re)construit les couches deck.gl. */
  _refreshLayers() {
    if (!this.overlay) return;
    const layers = [];

    // VISUEL UNIQUEMENT : on multiplie chaque altitude (z) rendue par le facteur
    // d'exagération du terrain pour que le faisceau et les marqueurs suivent la
    // surface exagérée de MapLibre. Les altitudes VRAIES (this._beam.*, .top)
    // sont conservées intactes et restent utilisées par le calcul de ligne de
    // visée (los.js) : l'exagération n'affecte JAMAIS le verdict ni le profil 2D.
    const ex = this._exaggeration;

    // Marqueurs 3D des deux sites (colonnes à l'altitude vraie, mise à l'échelle
    // pour l'affichage uniquement).
    const siteData = [];
    if (this._beam) {
      siteData.push({
        position: [SITE_A.lon, SITE_A.lat, 0],
        altitude: this._beam.source[2] * ex,
        color: COLORS.markerA,
      });
      siteData.push({
        position: [SITE_B.lon, SITE_B.lat, 0],
        altitude: this._beam.target[2] * ex,
        color: COLORS.markerB,
      });
    }
    if (siteData.length) {
      // Colonne depuis le sol jusqu'à l'altitude du site (repère vertical).
      layers.push(
        new deck.PathLayer({
          id: "site-columns",
          data: siteData,
          getPath: (d) => [
            [d.position[0], d.position[1], 0],
            [d.position[0], d.position[1], d.altitude],
          ],
          getColor: (d) => d.color,
          getWidth: 6,
          widthUnits: "pixels",
          parameters: { depthTest: true },
        })
      );
      layers.push(
        new deck.ScatterplotLayer({
          id: "site-markers",
          data: siteData,
          getPosition: (d) => [d.position[0], d.position[1], d.altitude],
          getFillColor: (d) => d.color,
          getRadius: 40,
          radiusUnits: "meters",
          radiusMinPixels: 6,
          parameters: { depthTest: true },
        })
      );
    }

    // LE FAISCEAU : LineLayer dont les positions portent z (altitude en m).
    // parameters.depthTest:true + overlay interleaved => occlusion correcte
    // par le terrain et les bâtiments (un obstacle plus haut masque le trait).
    if (this._beam && this._beamVisible) {
      // Extrémités mises à l'échelle de l'exagération (z * ex) pour rester
      // ancrées à la surface exagérée ; les z vrais ne sont pas modifiés.
      const beamScaled = {
        source: [this._beam.source[0], this._beam.source[1], this._beam.source[2] * ex],
        target: [this._beam.target[0], this._beam.target[1], this._beam.target[2] * ex],
        blocked: this._beam.blocked,
      };
      layers.push(
        new deck.LineLayer({
          id: "laser-beam",
          data: [beamScaled],
          getSourcePosition: (d) => d.source, // [lon, lat, altitude_m * ex]
          getTargetPosition: (d) => d.target, // [lon, lat, altitude_m * ex]
          getColor: (d) => (d.blocked ? COLORS.beamBlocked : COLORS.beamClear),
          getWidth: 5,
          widthUnits: "pixels",
          parameters: { depthTest: true },
        })
      );
    }

    // Points d'impact d'obstruction (marqueurs rouges distincts à l'altitude top).
    if (this._obstructions.length) {
      layers.push(
        new deck.ScatterplotLayer({
          id: "obstruction-hits",
          data: this._obstructions,
          // z mis à l'échelle de l'exagération (affichage) ; d.top reste la
          // valeur vraie utilisée par le calcul de ligne de visée.
          getPosition: (d) => [d.lon, d.lat, d.top * ex],
          getFillColor: COLORS.obstructionHit,
          getRadius: 30,
          radiusUnits: "meters",
          radiusMinPixels: 5,
          parameters: { depthTest: true },
        })
      );
    }

    this.overlay.setProps({ layers });
  }
}

export { hexToRgb };
