function splitCSVLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' ) {
      if (inQuotes && i+1 < line.length && line[i+1] === '"') {
        cur += '"'; // escaped quote
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

// Simple CSV parser tolerant of quoted fields (reasonable, not full RFC)
function parseCSV(text) {
  const rows = [];
  // const lines = text.split(/\r?\n/);
  const lines = text.split(/\r?\n/).splice(0, 100);
  console.log(`Star CSV lines: ${lines.length}`);

  if (lines.length === 0) return rows;
  // header
  const header = splitCSVLine(lines[0]);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = splitCSVLine(line);
    // if column count mismatches, try to skip
    if (cols.length !== header.length) continue;
    const obj = {};
    for (let j = 0; j < header.length; j++) obj[header[j]] = cols[j];
    rows.push(obj);
  }
  return rows;
}

// Equatorial (ICRS J2000) -> Galactic rotation matrix (from standard transformation)
const EQ2GAL = [
  [-0.0548755604, -0.8734370902, -0.4838350155],
  [ 0.4941094279, -0.4448296300,  0.7469822445],
  [-0.8676661490, -0.1980763734,  0.4559837762]
];

function dotMatVec(M, v) {
  return [
    M[0][0]*v[0] + M[0][1]*v[1] + M[0][2]*v[2],
    M[1][0]*v[0] + M[1][1]*v[1] + M[1][2]*v[2],
    M[2][0]*v[0] + M[2][1]*v[1] + M[2][2]*v[2]
  ];
}

// RA/Dec (deg) + parallax (mas) -> top-down galactic-plane x,y in parsecs (no z)
function raDecParallaxToGalacticXY(ra_deg, dec_deg) {
  // if (!parallax_mas || Number(parallax_mas) <= 0) return null;
  const ra = Number(ra_deg) * Math.PI/180;
  const dec = Number(dec_deg) * Math.PI/180;

  // distance in parsec
  const d_pc = 1000.0 / Number(1); // parallax in mas

  // equatorial unit vector
  const cosd = Math.cos(dec), sind = Math.sin(dec);
  const cosr = Math.cos(ra), sinr = Math.sin(ra);
  const vecEq = [cosd * cosr, cosd * sinr, sind];

  // convert to galactic unit vector
  const vecGal = dotMatVec(EQ2GAL, vecEq);
  const xg = vecGal[0], yg = vecGal[1], zg = vecGal[2];

  // galactic lon (l) and lat (b)
  const l = Math.atan2(yg, xg);      // radians (-PI, PI]
  const b = Math.asin(zg);          // radians (-PI/2, PI/2)

  // project onto galactic plane (top-down): drop latitude (b) vertical
  const cosb = Math.cos(b);
  const x = d_pc * cosb * Math.cos(l);
  const y = d_pc * cosb * Math.sin(l);

  return { x_pc: x, y_pc: y, l_rad: l, b_rad: b, d_pc };
}

// map world (pc) to screen pixels (top-down orthographic projection)
// camera: { cx, cy } in parsecs, zoom: pixelsPerParsec, canvas: {width, height}
function worldToScreenXY(x_pc, y_pc, camera) {
  // subtract camera position (camera at center of screen)
  const lx = x_pc - camera.cx;
  const ly = y_pc - camera.cy;
  const sx = lx * camera.zoom + (camera.canvas.width  / 2);
  const sy = -ly * camera.zoom + (camera.canvas.height / 2); // invert Y so +Y up -> screen y down
  return { screenX: sx, screenY: sy };
}

function estimateMass(bp_rp) {
    bp_rp = Number(bp_rp);
    if (!Number.isFinite(bp_rp)) return 1.0; // default sun mass

    // Very simple color → mass mapping (main-sequence only)
    if (bp_rp < 0.0) return 6;    // B-type hot blue
    if (bp_rp < 0.3) return 2;    // A-type
    if (bp_rp < 0.6) return 1.4;  // F-type
    if (bp_rp < 1.0) return 1.0;  // G-type (Sun-like)
    if (bp_rp < 1.5) return 0.8;  // K-type
    if (bp_rp < 2.5) return 0.4;  // M-type
    return 0.15;                  // very cool red dwarfs
}

async function streamStars(url, camera, onStar) {
    const res = await fetch(url);
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");

    let buffer = "";
    let isFirstLine = true;

    let i = 0;

    while (i < 5000) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let lines = buffer.split("\n");
        buffer = lines.pop(); // last line incomplete

        for (let line of lines) {
            if (!line.trim()) continue;

            i++;
            console.log(i)

            // Skip header row
            if (isFirstLine) {
                isFirstLine = false;
                continue;
            }

            const cols = line.split(",");
            
            const ra = parseFloat(cols[2]);
            const dec = parseFloat(cols[3]);
            if (!ra || !dec) continue;
            const gal = raDecParallaxToGalacticXY(ra, dec);
            if (!gal) continue;

            const screen = worldToScreenXY(gal.x_pc, gal.y_pc, camera);

            // Assuming: name, ra, dec, mag
            const star = {
                name: cols[1],          // main_id
                screenX: screen.screenX, // ra
                screenY: screen.screenY, // dec
                mag: parseFloat(cols[74]), // Gmag (closest thing to "brightness")
                mass: estimateMass(parseFloat(cols[123])) // mass
            };

            onStar(star);
        }
    }

    // leftover final line
    if (buffer.trim().length > 0) {
        const cols = buffer.split(",");
        const star = {
            name: cols[0],
            ra: parseFloat(cols[1]),
            dec: parseFloat(cols[2]),
            mag: parseFloat(cols[3])
        };
        onStar(star);
    }
}



// ---- main loader + projector ----

/**
 * csvText: raw CSV text from named_stars_gaia_dr3_100k.csv (or similar)
 * camera: { cx, cy, zoom, canvas: {width, height} }
 * returns: array of star objects: { id, name, ra, dec, parallax, mag, x_pc, y_pc, screenX, screenY }
 */
function loadAndProjectCSV(csvText, camera) {
  // console.log(`Parsing CSV: ${csvText}`);
  const rows = parseCSV(csvText);
  const out = [];

  // Common column names from CDS Xmatch output: MAIN_ID, ra, dec, parallax, phot_g_mean_mag
  for (const r of rows) {
    const id = r.source_id || r['cat2_main_id'] || r['source_id'] || r['gaia_source_id'] || r['GAIA_SOURCE'] || r['cat2'] || null;
    const name = r.MAIN_ID || r.main_id || r['cat1_main_id'] || r['MAIN_ID'] || null;
    const ra = r.ra || r.RA || r.RAdeg || r['ra'];
    const dec = r.dec || r.DEC || r.DECdeg || r['dec'];
    const parallax = r.parallax || r.PLX || r['parallax'];
    const mag = r.phot_g_mean_mag || r.mag || r['phot_g_mean_mag'] || null;

    if (!ra || !dec) continue;           // skip missing essential fields
    const gal = raDecParallaxToGalacticXY(ra, dec);
    if (!gal) continue;

    const screen = worldToScreenXY(gal.x_pc, gal.y_pc, camera);

    out.push({
      id,
      name,
      ra: Number(ra),
      dec: Number(dec),
      parallax: Number(parallax),
      mag: mag ? Number(mag) : null,
      x_pc: gal.x_pc,
      y_pc: gal.y_pc,
      screenX: screen.screenX,
      screenY: screen.screenY,
      l_rad: gal.l_rad,
      b_rad: gal.b_rad,
      d_pc: gal.d_pc
    });
  }

  return out;
}