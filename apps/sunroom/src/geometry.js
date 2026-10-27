import * as THREE from 'three/webgpu';
import polygonClipping from 'polygon-clipping';

const MM = 0.001;
const PI = Math.PI;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const asNumber = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const M = (v, fallback = 0) => asNumber(v, fallback) * MM;
const shade = (color, amount) => new THREE.Color(color).lerp(new THREE.Color(amount > 0 ? '#ffffff' : '#111410'), Math.abs(amount));

function roundedRect(w, h, r) {
  const x = -w / 2, y = -h / 2;
  r = clamp(r, 0.0001, Math.min(w, h) * 0.49);
  const s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** A bevelled, rounded footprint, with exact external dimensions. */
function softBoxGeometry(w, h, d, radius = 0.012) {
  w = Math.max(0.002, w); h = Math.max(0.002, h); d = Math.max(0.002, d);
  const r = Math.min(Math.max(radius, 0.001), w * 0.22, d * 0.22);
  const bevel = Math.min(r * 0.42, h * 0.22, w * 0.08, d * 0.08);
  const shape = roundedRect(w - 2 * bevel, d - 2 * bevel, Math.max(0.0002, r - bevel));
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: h - 2 * bevel, steps: 1, bevelEnabled: true,
    bevelSegments: 2, bevelSize: bevel, bevelThickness: bevel, curveSegments: 4,
  });
  geom.rotateX(-PI / 2);
  geom.translate(0, -h / 2 + bevel, 0);
  return geom;
}

function makeTools(materialFactory, itemId, primary = null) {
  const mats = new Map();
  const material = (kind = 'wood', color = '#c4ab88') => {
    if (primary && kind === primary.from && primary.to) kind = primary.to;
    const key = `${kind}:${color?.isColor ? color.getHexString() : color}`;
    if (mats.has(key)) return mats.get(key);
    let m = materialFactory?.(kind, color);
    if (!m?.isMaterial) m = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    mats.set(key, m);
    return m;
  };
  const mesh = (parent, geometry, mat, x = 0, y = 0, z = 0) => {
    const obj = new THREE.Mesh(geometry, mat);
    obj.position.set(x, y, z);
    obj.castShadow = true; obj.receiveShadow = true;
    if (itemId !== undefined) obj.userData.itemId = itemId;
    parent.add(obj);
    return obj;
  };
  const box = (parent, w, h, d, x = 0, y = 0, z = 0, kind = 'wood', color = '#c4ab88', r = 0) =>
    mesh(parent, r ? softBoxGeometry(w, h, d, r) : new THREE.BoxGeometry(w, h, d), material(kind, color), x, y, z);
  const cylinder = (parent, rt, rb, h, x = 0, y = 0, z = 0, kind = 'wood', color = '#c4ab88', segments = 24) =>
    mesh(parent, new THREE.CylinderGeometry(Math.max(0.0003, rt), Math.max(0.0003, rb), Math.max(0.001, h), segments), material(kind, color), x, y, z);
  const sphere = (parent, rx, ry, rz, x, y, z, kind, color) => {
    const s = mesh(parent, new THREE.SphereGeometry(1, 16, 10), material(kind, color), x, y, z);
    s.scale.set(rx, ry, rz); return s;
  };
  const rod = (parent, start, end, radius, kind = 'metal', color = '#575f57', endRadius = radius) => {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
    const delta = b.clone().sub(a), length = delta.length();
    if (length < 0.0001) return null;
    const c = cylinder(parent, endRadius, radius, length, ...a.clone().add(b).multiplyScalar(0.5).toArray(), kind, color, 12);
    c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    return c;
  };
  const line = (parent, points, radius = 0.0013, kind = 'fabric', color = '#a99b86', closed = false) => {
    if (points.length < 2) return null;
    let curve;
    if (closed) {
      // A four-corner Catmull-Rom curve balloons beyond the measured footprint.
      // Piecewise lines keep piping and seams inside their declared rectangle.
      curve = new THREE.CurvePath();
      for (let i = 0; i < points.length; i++) curve.add(new THREE.LineCurve3(new THREE.Vector3(...points[i]), new THREE.Vector3(...points[(i + 1) % points.length])));
    } else curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, 'centripetal');
    return mesh(parent, new THREE.TubeGeometry(curve, Math.max(8, points.length * 3), radius, 5, closed), material(kind, color));
  };
  const frameLine = (parent, w, d, y, color, r = 0.0012, x = 0, z = 0) => line(parent, [
    [x - w / 2, y, z - d / 2], [x + w / 2, y, z - d / 2],
    [x + w / 2, y, z + d / 2], [x - w / 2, y, z + d / 2],
  ], r, 'fabric', color, true);
  return { material, mesh, box, cylinder, sphere, rod, line, frameLine };
}

function fourLegs(t, g, w, d, h, top, color, radius = 0.024, inset = 0.08, kind = 'wood') {
  for (const x of [-w / 2 + inset, w / 2 - inset]) for (const z of [-d / 2 + inset, d / 2 - inset]) {
    t.cylinder(g, radius, radius * 0.74, h, x, top - h / 2, z, kind, color, 12);
  }
}

function addBed(t, g, w, d, h, color, type) {
  const frameH = Math.min(h * 0.28, 0.31), footH = Math.min(0.1, h * 0.09);
  const mattressH = Math.min(0.21, h * 0.23), headD = Math.min(0.095, d * 0.06);
  const bodyD = d - headD, centerZ = headD / 2;
  const wood = type === 'bed-storage' ? color : '#b3916c';
  const frameKind = type === 'bed-storage' ? 'wood' : 'fabric';
  const legsH = footH;
  fourLegs(t, g, w, bodyD, legsH, legsH, '#947555', 0.035, Math.min(0.16, w * 0.13));
  t.box(g, w, frameH, bodyD, 0, footH + frameH / 2, centerZ, frameKind, color, 0.035);
  t.box(g, w, h - footH, headD, 0, (h + footH) / 2, -d / 2 + headD / 2, frameKind, color, 0.055);
  const headLines = type === 'bed-single' ? 3 : 5;
  for (let i = 1; i < headLines; i++) {
    const x = -w / 2 + w * i / headLines;
    t.box(g, 0.003, Math.max(0.04, h - frameH - footH - 0.09), 0.0015,
      x, (h + frameH + footH) / 2, -d / 2 + headD + 0.001, frameKind, shade(color, -0.15));
  }
  const mattressW = w - Math.min(0.055, w * 0.04), mattressD = bodyD - 0.05;
  const mattressY = footH + frameH + mattressH / 2;
  t.box(g, mattressW, mattressH, mattressD, 0, mattressY, centerZ, 'fabric', '#f0ece2', 0.045);
  for (const y of [mattressY - mattressH * 0.31, mattressY + mattressH * 0.31])
    t.frameLine(g, mattressW - 0.025, mattressD - 0.02, y, '#d4cdbd', 0.0015, 0, centerZ);
  const surface = mattressY + mattressH / 2;
  const duvetH = Math.min(0.08, h * 0.07);
  const duvetD = mattressD * 0.73, duvetZ = centerZ + mattressD * 0.12;
  const duvetColor = type === 'bed-single' ? '#dce0ce' : '#e8dfcc';
  t.box(g, mattressW + 0.006, duvetH, duvetD, 0, surface + duvetH * 0.4, duvetZ, 'fabric', duvetColor, 0.048);
  t.box(g, mattressW - 0.01, duvetH * 0.45, Math.min(0.16, duvetD * 0.14), 0, surface + duvetH * 0.94,
    duvetZ - duvetD / 2 + 0.07, 'fabric', '#f2ede3', 0.026);
  const stripeColor = shade(duvetColor, -0.09);
  for (let i = -2; i <= 2; i++) {
    const x = i * mattressW / 6;
    t.line(g, [[x, surface + duvetH * 0.88, duvetZ - duvetD * 0.38], [x + 0.009, surface + duvetH * 0.93, duvetZ], [x, surface + duvetH * 0.87, duvetZ + duvetD * 0.38]], 0.0008, 'fabric', stripeColor);
  }
  const pillows = w < 1.2 ? 1 : 2, pillowW = Math.min(0.62, mattressW / pillows - 0.08);
  for (let i = 0; i < pillows; i++) {
    const x = (i - (pillows - 1) / 2) * (pillowW + 0.065);
    const pillowD = Math.min(0.4, d * 0.21), z = -d / 2 + headD + pillowD / 2 + 0.055;
    t.box(g, pillowW, 0.085, pillowD, x, surface + 0.065, z, 'fabric', '#f5f0e7', 0.055);
    t.frameLine(g, pillowW - 0.035, pillowD - 0.025, surface + 0.086, '#ded5c7', 0.001, x, z);
  }
  if (type === 'bed-storage') {
    for (const sign of [-1, 1]) for (let i = 0; i < 2; i++) {
      const z = centerZ - bodyD * 0.24 + i * bodyD * 0.48;
      t.box(g, 0.012, frameH * 0.72, bodyD * 0.44, sign * (w / 2 + 0.001), footH + frameH * 0.53, z, 'wood', shade(wood, 0.04), 0.009);
      t.box(g, 0.014, 0.012, 0.13, sign * (w / 2 + 0.009), footH + frameH * 0.70, z, 'metal', '#8e806c', 0.004);
    }
  }
}

function addCabinet(t, g, w, d, h, color, type) {
  const legH = type === 'wardrobe' || type === 'wardrobe-sliding' ? Math.min(0.05, h * 0.04) : Math.min(0.12, h * 0.18);
  const panel = Math.min(0.022, w * 0.045, d * 0.09), bodyH = h - legH;
  const dark = shade(color, -0.09), inner = shade(color, -0.04);
  if (legH > 0.04) fourLegs(t, g, w, d, legH, legH, '#8d7455', 0.019, Math.min(0.075, d * 0.15));
  else t.box(g, w * 0.92, legH, d * 0.92, 0, legH / 2, 0, 'wood', dark);
  t.box(g, w, panel, d, 0, h - panel / 2, 0, 'wood', color, 0.009);
  t.box(g, w, panel, d, 0, legH + panel / 2, 0, 'wood', color, 0.007);
  t.box(g, w, bodyH - panel * 2, panel * 0.45, 0, legH + bodyH / 2, -d / 2 + panel * 0.23, 'wood', inner);
  for (const s of [-1, 1]) t.box(g, panel, bodyH, d, s * (w / 2 - panel / 2), legH + bodyH / 2, 0, 'wood', color, 0.005);
  const frontZ = d / 2 - panel / 2;
  const isOpen = type === 'bookcase' || type === 'wall-shelf';
  if (isOpen) {
    const rows = type === 'bookcase' ? 5 : 4, cols = w > 0.95 ? 3 : 2;
    for (let i = 1; i < rows; i++) t.box(g, w - panel * 2, panel, d - panel * 0.6, 0, legH + bodyH * i / rows, 0, 'wood', color, 0.003);
    for (let col = 1; col < cols; col++) t.box(g, panel, bodyH - panel * 2, d - panel, -w / 2 + w * col / cols, legH + bodyH / 2, 0, 'wood', color);
    const bookColors = ['#7d8e85', '#d4c6a6', '#a76e58', '#d3d4c4', '#8b9b9e', '#c9a678'];
    for (let row = 0; row < rows; row++) {
      const shelfY = legH + panel + bodyH * row / rows;
      if (row % 2 === 0) {
        const bh = Math.min(0.27, bodyH / rows * 0.68), bw = Math.min(0.035, w * 0.045);
        for (let j = 0; j < 5; j++) {
          const x = -w / 2 + panel + 0.025 + j * (bw + 0.006);
          const b = t.box(g, bw, bh * (0.83 + j % 3 * 0.07), d * 0.56, x, shelfY + bh / 2, -d * 0.06, 'paper', bookColors[(j + row) % bookColors.length], 0.0015);
          if (j === 4) b.rotation.z = -0.08;
          t.box(g, bw * 0.66, 0.008, 0.0015, x, shelfY + bh * 0.7, d * 0.221, 'paper', '#e7dece');
        }
      } else {
        const bw = Math.min(w / cols * 0.64, 0.32), bh = Math.min(bodyH / rows * 0.52, 0.18);
        t.box(g, bw, bh, d * 0.66, w / 2 - w / cols * 0.52, shelfY + bh / 2, 0, 'fabric', '#c0b49a', 0.01);
        t.box(g, bw * 0.3, 0.026, 0.003, w / 2 - w / cols * 0.52, shelfY + bh * 0.62, d * 0.333, 'paper', '#e9e4d8', 0.003);
      }
    }
    return;
  }
  const sliding = type === 'wardrobe-sliding';
  const drawers = type === 'dresser' ? 3 : type === 'bedside' ? 2 : type === 'shoe-cabinet' ? 3 : 1;
  const cols = type === 'dresser' ? 2 : type === 'bedside' || type === 'shoe-cabinet' ? 1 : sliding ? 2 : clamp(Math.round(w / 0.46), 2, 5);
  const drawerStyle = ['dresser', 'bedside', 'shoe-cabinet'].includes(type);
  for (let col = 0; col < cols; col++) for (let row = 0; row < drawers; row++) {
    const pw = (w - panel * 2) / cols - 0.004;
    const ph = (bodyH - panel * 2) / drawers - 0.004;
    const px = -w / 2 + panel + (col + 0.5) * ((w - panel * 2) / cols);
    const py = legH + panel + (row + 0.5) * ((bodyH - panel * 2) / drawers);
    const z = frontZ - (sliding && col % 2 === 0 ? 0.019 : 0);
    t.box(g, pw, ph, panel, px, py, z, 'wood', col % 2 === 0 ? color : shade(color, -0.025), 0.004);
    if (drawerStyle) t.box(g, Math.min(0.15, pw * 0.4), 0.009, 0.013, px, py + ph * 0.18, z + panel * 0.75, 'metal', '#897a66', 0.003);
    else {
      const handleH = Math.min(0.3, ph * 0.22), handleX = sliding ? px - pw * 0.40 : px + (col % 2 === 0 ? pw * 0.38 : -pw * 0.38);
      t.box(g, 0.008, handleH, 0.018, handleX, py - ph * 0.12, z + panel * 0.7, 'metal', '#8d816c', 0.004);
    }
  }
  if (sliding) for (const y of [legH + panel * 0.7, h - panel * 0.7])
    t.box(g, w - panel * 2, 0.007, 0.033, 0, y, d / 2 - 0.026, 'metal', '#918b7d');
}

function addDesk(t, g, w, d, h, color, corner = false) {
  const thick = Math.min(0.035, h * 0.055), topY = h - thick / 2;
  const legColor = '#b19473';
  const rearD = corner ? Math.min(d * 0.48, 0.64) : d;
  const mainZ = corner ? -d / 2 + rearD / 2 : 0;
  t.box(g, w, thick, rearD, 0, topY, mainZ, 'wood', color, 0.018);
  if (corner) {
    const returnW = Math.min(w * 0.39, 0.58);
    const restD = d - rearD;
    t.box(g, returnW, thick, restD + 0.015, -w / 2 + returnW / 2, topY, rearD / 2, 'wood', color, 0.014);
    for (const x of [-w / 2 + 0.065, -w / 2 + returnW - 0.065]) t.cylinder(g, 0.027, 0.022, h - thick, x, (h - thick) / 2, d / 2 - 0.065, 'wood', legColor, 12);
  }
  for (const x of [-w / 2 + 0.07, w / 2 - 0.07]) for (const z of [mainZ - rearD / 2 + 0.07, mainZ + rearD / 2 - 0.07])
    t.cylinder(g, 0.027, 0.021, h - thick, x, (h - thick) / 2, z, 'wood', legColor, 12);
  t.box(g, w * 0.86, 0.05, 0.025, 0, h - thick - 0.047, mainZ - rearD / 2 + 0.056, 'wood', shade(color, -0.09));
  const drawerW = Math.min(0.42, w * 0.34), drawerH = Math.min(0.105, h * 0.14);
  t.box(g, drawerW, drawerH, rearD * 0.65, w * 0.20, h - thick - drawerH / 2, mainZ + rearD * 0.06, 'wood', shade(color, -0.04), 0.006);
  t.box(g, drawerW * 0.32, 0.009, 0.014, w * 0.20, h - thick - drawerH * 0.45, mainZ + rearD * 0.39, 'metal', '#8c7b66', 0.003);
  const grommet = t.cylinder(g, 0.024, 0.024, 0.002, w * 0.32, h + 0.001, mainZ - rearD * 0.28, 'metal', '#777b72', 20);
  grommet.scale.z = 0.74;
}

function addChair(t, g, w, d, h, color, dining = false) {
  const seatH = Math.min(h * (dining ? 0.57 : 0.43), 0.47), seatW = w * (dining ? 0.94 : 0.77), seatD = d * (dining ? 0.8 : 0.72);
  const seatThick = Math.min(0.065, h * 0.065);
  t.box(g, seatW, seatThick, seatD, 0, seatH, d * 0.02, 'fabric', dining ? shade(color, 0.18) : color, 0.06);
  if (dining) {
    fourLegs(t, g, seatW, seatD, seatH - seatThick / 2, seatH - seatThick / 2, color, 0.022, 0.055);
    const backH = h - seatH - 0.05;
    t.box(g, w * 0.92, backH, Math.min(0.055, d * 0.12), 0, seatH + backH / 2 + 0.05, -d * 0.36, 'wood', color, 0.022);
    for (const x of [-w * 0.36, w * 0.36]) t.rod(g, [x, seatH - 0.04, -d * 0.32], [x, h - 0.08, -d * 0.37], 0.018, 'wood', color);
    t.rod(g, [-w * 0.35, 0.19, -d * 0.29], [w * 0.35, 0.19, -d * 0.29], 0.012, 'wood', shade(color, -0.12));
  } else {
    const metal = '#4e5754';
    t.cylinder(g, 0.023, 0.028, seatH - 0.11, 0, (seatH - 0.11) / 2 + 0.07, 0, 'metal', metal, 16);
    t.cylinder(g, 0.052, 0.062, 0.035, 0, 0.12, 0, 'metal', metal, 20);
    for (let i = 0; i < 5; i++) {
      const a = i * PI * 2 / 5, r = Math.min(w, d) * 0.43;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      t.rod(g, [0, 0.115, 0], [x, 0.065, z], 0.014, 'metal', metal);
      const wheel = t.cylinder(g, 0.027, 0.027, 0.03, x, 0.031, z, 'plastic', '#3e4742', 12); wheel.rotation.z = PI / 2;
    }
    const backH = h - seatH - 0.10;
    t.box(g, seatW * 0.94, backH, 0.07, 0, seatH + backH / 2 + 0.065, -seatD * 0.43, 'fabric', shade(color, -0.05), 0.055);
    for (let i = -3; i <= 3; i++) t.box(g, seatW * 0.80, 0.002, 0.0015, 0, seatH + 0.12 + (backH - 0.14) * (i + 3) / 6, -seatD * 0.43 + 0.036, 'fabric', shade(color, 0.12));
    for (const s of [-1, 1]) {
      t.rod(g, [s * w * 0.38, seatH - 0.015, 0], [s * w * 0.38, seatH + 0.20, 0], 0.015, 'metal', metal);
      t.box(g, w * 0.10, 0.033, d * 0.42, s * w * 0.38, seatH + 0.20, -d * 0.01, 'plastic', metal, 0.018);
    }
  }
}

function addSofa(t, g, w, d, h, color, seats = 3) {
  const footH = Math.min(0.12, h * 0.16), baseH = h * 0.25;
  const armW = Math.min(0.15, w * 0.12), backD = Math.min(0.17, d * 0.22);
  const seatH = h * 0.14, seatY = footH + baseH + seatH / 2;
  fourLegs(t, g, w, d, footH, footH, '#906e4e', 0.025, 0.12);
  t.box(g, w - 0.015, baseH, d - 0.015, 0, footH + baseH / 2, 0, 'fabric', shade(color, -0.06), 0.04);
  t.box(g, w - armW * 1.2, h - footH - baseH * 0.7, backD, 0, (h + footH + baseH * 0.7) / 2, -d / 2 + backD / 2, 'fabric', color, 0.055);
  const armH = h * 0.60;
  for (const s of [-1, 1]) t.box(g, armW, armH, d * 0.96, s * (w / 2 - armW / 2), footH + armH / 2, 0, 'fabric', color, 0.045);
  const usable = w - armW * 2 - 0.025, cushionW = usable / seats - 0.014, cushionD = d - backD - 0.055;
  for (let i = 0; i < seats; i++) {
    const x = -usable / 2 + (i + 0.5) * usable / seats;
    t.box(g, cushionW, seatH, cushionD, x, seatY, backD / 2, 'fabric', shade(color, 0.035), 0.044);
    t.frameLine(g, cushionW - 0.022, cushionD - 0.025, seatY + seatH * 0.18, shade(color, -0.14), 0.0012, x, backD / 2);
    const cushionBackH = Math.max(0.10, h - (seatY + seatH / 2) - 0.04);
    const back = t.box(g, cushionW - 0.012, cushionBackH, 0.14, x, seatY + seatH / 2 + cushionBackH / 2, -d / 2 + backD * 0.94, 'fabric', shade(color, 0.025), 0.043);
    back.rotation.x = -0.06;
  }
  const pillowW = Math.min(0.33, usable * 0.25), pillowH = Math.min(0.32, h * 0.38);
  const pillow = t.box(g, pillowW, pillowH, 0.11, -usable * 0.30, seatY + seatH / 2 + pillowH * 0.48, -d * 0.17, 'fabric', '#b09a77', 0.045);
  pillow.rotation.z = 0.12;
}

function addTable(t, g, w, d, h, color, round = false, side = false) {
  const topH = Math.min(0.035, h * 0.07);
  if (round) {
    const top = t.cylinder(g, 1, 1, topH, 0, h - topH / 2, 0, 'wood', color, 64);
    top.scale.set(w / 2, 1, d / 2);
    const base = t.cylinder(g, Math.min(w, d) * 0.22, Math.min(w, d) * 0.29, Math.min(0.04, h * 0.07), 0, Math.min(0.02, h * 0.035), 0, 'wood', shade(color, -0.08), 48);
    base.scale.x = Math.max(0.7, w / d); base.scale.z = Math.max(0.7, d / w);
    t.cylinder(g, Math.min(w, d) * 0.075, Math.min(w, d) * 0.11, h - topH - 0.04, 0, (h - topH) / 2, 0, 'wood', color, 32);
  } else {
    t.box(g, w, topH, d, 0, h - topH / 2, 0, 'wood', color, side ? 0.045 : 0.035);
    fourLegs(t, g, w, d, h - topH, h - topH, shade(color, -0.03), Math.min(0.033, w * 0.05), Math.min(0.09, Math.min(w, d) * 0.14));
    if (side) t.box(g, w * 0.83, topH * 0.55, d * 0.83, 0, h * 0.25, 0, 'wood', shade(color, -0.04), 0.025);
    else for (const z of [-d / 2 + 0.07, d / 2 - 0.07]) t.box(g, w * 0.85, h * 0.075, 0.025, 0, h - topH - h * 0.037, z, 'wood', shade(color, -0.10));
  }
}

function addRug(t, g, w, d, h, color) {
  const height = Math.max(0.004, Math.min(h, 0.04));
  t.box(g, w, height, d, 0, height / 2, 0, 'rug', color, 0.018);
  const border = Math.min(0.045, w * 0.05, d * 0.05), y = height + 0.0005;
  for (const s of [-1, 1]) {
    t.box(g, w - border, 0.001, border, 0, y, s * (d / 2 - border * 0.7), 'rug', shade(color, -0.12));
    t.box(g, border, 0.001, d - border, s * (w / 2 - border * 0.7), y, 0, 'rug', shade(color, -0.12));
  }
  const count = Math.min(42, Math.ceil(w / 0.045));
  for (let i = 1; i < count; i++) t.box(g, 0.0015, 0.0007, d - border * 3,
    -w / 2 + w * i / count, y + 0.0008, 0, 'rug', shade(color, i % 2 ? -0.045 : 0.05));
}

function addPlant(t, g, w, d, h, color) {
  const potH = h * 0.23, potR = Math.min(w, d) * 0.28;
  t.cylinder(g, potR, potR * 0.78, potH, 0, potH / 2, 0, 'ceramic', '#b99a7d', 32);
  t.cylinder(g, potR * 1.035, potR * 1.035, potH * 0.08, 0, potH * 0.95, 0, 'ceramic', '#c7ad8f', 32);
  t.cylinder(g, potR * 0.92, potR * 0.92, 0.012, 0, potH - 0.015, 0, 'soil', '#5b4b37', 24);
  const topY = h * 0.91;
  t.rod(g, [0, potH * 0.87, 0], [0.018, topY, 0.012], Math.min(0.012, w * 0.023), 'wood', '#6d7852', 0.004);
  for (let i = 0; i < 13; i++) {
    const a = i * 2.399963, ty = potH + (h - potH) * (0.2 + i * 0.052);
    const extent = Math.min(w, d) * (0.18 + (i % 3) * 0.027);
    const branchX = Math.sin(a) * extent, branchZ = Math.cos(a) * extent;
    t.rod(g, [0, ty - 0.055, 0], [branchX * 0.77, ty + 0.012, branchZ * 0.77], 0.0035, 'wood', '#66724b', 0.0015);
    const leaf = t.sphere(g, Math.min(w, d) * 0.115, h * 0.014, Math.min(w, d) * 0.225, branchX, ty + 0.018, branchZ, 'leaf', shade(color, (i % 4 - 1) * 0.045));
    leaf.rotation.set(0.24 + (i % 3) * 0.12, a + PI / 2, -0.10);
    t.rod(g, [branchX * 0.75, ty + 0.017, branchZ * 0.75], [branchX * 1.18, ty + 0.02, branchZ * 1.18], 0.0011, 'leaf', '#91a375');
  }
  const tip = t.sphere(g, w * 0.045, h * 0.055, d * 0.10, 0.018, h * 0.945, 0.012, 'leaf', shade(color, 0.08));
  tip.rotation.z = -0.19;
}

function addLamp(t, g, w, d, h, color) {
  const baseR = Math.min(w, d) * 0.36, baseH = Math.min(0.035, h * 0.03), shadeH = h * 0.19;
  t.cylinder(g, baseR, baseR, baseH, 0, baseH / 2, 0, 'metal', '#9c927f', 40);
  t.cylinder(g, 0.011, 0.014, h - shadeH * 0.6 - baseH, 0, (h - shadeH * 0.6 + baseH) / 2, 0, 'metal', '#8c816c', 20);
  const radius = Math.min(w, d) * 0.48;
  const shade = t.mesh(g, new THREE.CylinderGeometry(radius * 0.69, radius, shadeH, 48, 1, true), t.material('fabric', color), 0, h - shadeH / 2, 0);
  const rim = new THREE.TorusGeometry(radius, 0.003, 5, 48);
  const lower = t.mesh(g, rim, t.material('metal', '#c7b99e'), 0, h - shadeH, 0); lower.rotation.x = PI / 2;
  t.sphere(g, 0.032, 0.046, 0.032, 0, h - shadeH * 0.72, 0, 'light', '#ffe6b1');
  t.cylinder(g, radius * 0.79, radius * 0.79, 0.003, 0, h - shadeH + 0.007, 0, 'light', '#f2d7a3', 32);
  shade.userData.lampShade = true;
}

function addMirror(t, g, w, d, h, color) {
  const frame = Math.min(0.028, w * 0.06), panelD = Math.min(0.03, d * 0.24);
  t.box(g, w, h, panelD, 0, h / 2, d * 0.25, 'wood', color, Math.min(0.10, w * 0.16));
  t.box(g, w - frame * 2, h - frame * 2, 0.004, 0, h / 2, d * 0.25 + panelD / 2 + 0.001, 'mirror', '#d1dcd8', Math.min(0.085, w * 0.12));
  for (const s of [-1, 1]) t.rod(g, [s * w * 0.35, h * 0.64, d * 0.22], [s * w * 0.35, 0.012, -d * 0.42], 0.012, 'wood', shade(color, -0.12));
  t.rod(g, [-w * 0.35, 0.1, -d * 0.38], [w * 0.35, 0.1, -d * 0.38], 0.008, 'wood', color);
}

function addBox(t, g, w, d, h, color) {
  t.box(g, w * 0.97, h * 0.91, d * 0.97, 0, h * 0.455, 0, 'plastic', color, Math.min(0.03, w * 0.05));
  t.box(g, w, h * 0.10, d, 0, h * 0.95, 0, 'plastic', shade(color, 0.07), 0.025);
  for (const s of [-1, 1]) t.box(g, w * 0.035, h * 0.13, d * 0.34, s * w * 0.48, h * 0.70, 0, 'plastic', shade(color, -0.18), 0.012);
  t.box(g, w * 0.33, h * 0.18, 0.002, 0, h * 0.50, d * 0.487, 'paper', '#eee9dd', 0.005);
  t.box(g, w * 0.20, 0.002, 0.0025, 0, h * 0.52, d * 0.489, 'paper', '#a49e8f');
}

function addDivider(t, g, w, d, h, color) {
  const panel = Math.min(0.032, w * 0.04);
  for (const x of [-w * 0.33, w * 0.33]) t.box(g, panel * 1.8, 0.035, d, x, 0.0175, 0, 'wood', color, 0.008);
  for (const y of [h - panel / 2, 0.08]) t.box(g, w, panel, panel, 0, y, 0, 'wood', color, 0.004);
  const count = clamp(Math.round(w / 0.085), 5, 24);
  for (let i = 0; i <= count; i++) t.box(g, panel, h - 0.08, panel * 0.9, -w / 2 + panel / 2 + (w - panel) * i / count, (h + 0.08) / 2, 0, 'wood', i % 2 ? shade(color, -0.04) : color, 0.003);
}

function addRack(t, g, w, d, h, color) {
  const r = Math.min(0.015, w * 0.025), postX = w / 2 - r * 2;
  for (const s of [-1, 1]) {
    t.rod(g, [s * postX, 0.025, -d * 0.43], [s * postX, h - r, 0], r, 'metal', color);
    t.rod(g, [s * postX, 0.025, d * 0.43], [s * postX, h - r, 0], r, 'metal', color);
    t.rod(g, [s * postX, 0.028, -d * 0.46], [s * postX, 0.028, d * 0.46], r, 'metal', color);
  }
  t.rod(g, [-postX, h - r, 0], [postX, h - r, 0], r, 'metal', color);
  t.box(g, w * 0.87, 0.022, d * 0.78, 0, 0.17, 0, 'wood', '#bda580', 0.008);
  const hangW = Math.min(0.35, w * 0.3), hangH = Math.min(0.16, h * 0.11);
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * w * 0.22, y = h - 0.055;
    t.line(g, [[x, y + 0.03, 0], [x + 0.018, y + 0.015, 0], [x, y - 0.025, 0]], 0.003, 'metal', '#b5a482');
    t.line(g, [[x, y - 0.025, 0], [x - hangW / 2, y - hangH, 0], [x + hangW / 2, y - hangH, 0], [x, y - 0.025, 0]], 0.006, 'wood', '#baa17b');
  }
}

function addSmallHook(t, g, x, y, backZ, depth, drop, color = '#68746a') {
  const radius = Math.max(0.002, Math.min(0.005, depth * 0.07));
  t.line(g, [[x, y, backZ], [x, y, backZ + depth * 0.72],
    [x, y - drop * 0.74, backZ + depth], [x, y - drop, backZ + depth * 0.82],
    [x, y - drop * 0.87, backZ + depth * 0.64]], radius, 'metal', color);
}

function addWireBasket(t, g, w, d, h, x, y, z, color, kind = 'metal') {
  const rail = Math.max(0.002, Math.min(0.005, Math.min(w, d) * 0.035));
  t.box(g, w, 0.009, d, x, y + 0.0045, z, kind, color, 0.012);
  t.line(g, [[x-w/2,y+h,z-d/2],[x+w/2,y+h,z-d/2],[x+w/2,y+h,z+d/2],[x-w/2,y+h,z+d/2]], rail, kind, color, true);
  for (const sx of [-1,1]) for (const sz of [-1,1]) t.rod(g, [x+sx*w/2,y+0.008,z+sz*d/2],[x+sx*w/2,y+h,z+sz*d/2],rail,kind,color);
  const count = clamp(Math.floor(w/0.075),2,7);
  for(let i=1;i<count;i++) for(const side of [-1,1]) t.rod(g,[x-w/2+w*i/count,y+0.008,z+side*d/2],[x-w/2+w*i/count,y+h,z+side*d/2],rail*.6,kind,color);
}

function addBottle(t, g, x, y, z, height, radius, color = '#ded8c5') {
  t.cylinder(g, radius*.86, radius, height*.77, x, y+height*.385, z, 'plastic', color, 16);
  t.cylinder(g, radius*.43, radius*.55, height*.13, x, y+height*.835, z, 'plastic', '#eee9dc', 12);
  t.box(g,radius*.95,height*.06,radius*.30,x+radius*.15,y+height*.935,z,'plastic','#d4d1c4',.003);
  t.box(g,radius*1.0,height*.23,.0015,x,y+height*.42,z+radius*.97,'paper','#f2ede1',.004);
}

const WALL_TYPES = new Set(['floating-shelf','pegboard','wall-cabinet','hook-rail','entry-organizer','wall-rail','no-drill-rack','towel-rail','cable-tray']);
const METAL_TOOLS = new Set(['wall-rail','no-drill-rack','towel-rail','rolling-cart','slim-cart','cable-tray']);

function addWallFurnishing(t, g, w, d, h, color, type) {
  const back = -d/2, wood = '#bd9e79', metal = '#778277';
  if(type==='floating-shelf') {
    const boardH=Math.min(.035,h*.24),boardY=h*.20;
    t.box(g,w,boardH,d,0,boardY,0,'wood',color,.012);
    for(const sign of [-1,1]){
      const x=sign*w*.32;
      t.box(g,.022,h*.62,.013,x,h*.43,back+.011,'metal','#777d70',.003);
      t.rod(g,[x,boardY-boardH*.55,back+.02],[x,boardY-boardH*.55,d*.34],.006,'metal','#777d70');
    }
    for(let i=0;i<3;i++) t.box(g,w*.22,.018+i*.003,d*.60,-w*.23,boardY+boardH/2+.011+i*.022,-d*.05,'paper',['#b7bba9','#d7cbb2','#9daea4'][i],.003);
    t.cylinder(g,d*.14,d*.12,h*.46,w*.30,boardY+boardH/2+h*.23,0,'ceramic','#d9d0bd',20);
    return;
  }
  if(type==='pegboard'){
    const plate=.014,shape=roundedRect(w,h,.018),cols=clamp(Math.floor(w/.07),3,11),rows=clamp(Math.floor(h/.07),3,11);
    for(let iy=1;iy<rows;iy++) for(let ix=1;ix<cols;ix++){
      const hole=new THREE.Path();hole.absellipse(-w/2+w*ix/cols,-h/2+h*iy/rows,Math.min(.007,w/cols*.14),Math.min(.007,h/rows*.14),0,PI*2,true);shape.holes.push(hole);
    }
    t.mesh(g,new THREE.ExtrudeGeometry(shape,{depth:plate,bevelEnabled:false,curveSegments:4}),t.material('wood',color),0,h/2,back+.014);
    for(const sx of [-1,1])for(const sy of [-1,1]){
      const x=sx*w*.43,y=h/2+sy*h*.43;
      const screw=t.cylinder(g,.009,.009,.016,x,y,back+.022,'metal','#998e78',12);screw.rotation.x=PI/2;
    }
    addWireBasket(t,g,w*.42,d*.66,h*.17,w*.22,h*.11,d*.13,shade(color,-.12),'wood');
    t.box(g,w*.16,h*.20,d*.49,-w*.28,h*.28,d*.07,'wood',shade(color,-.06),.007);
    for(let i=0;i<4;i++)t.rod(g,[-w*.30+i*w*.018,h*.27,d*.06],[-w*.30+i*w*.018,h*(.48+i*.018),d*.06],.003,'wood',['#798e7c','#c3a172','#ad7f67','#b0b7a0'][i]);
    for(let i=0;i<3;i++)addSmallHook(t,g,-w*.27+i*w*.20,h*.76,back+.03,d*.60,h*.12,metal);
    t.box(g,w*.20,h*.18,.003,w*.24,h*.74,back+.032,'paper','#e6ddc9',.003);
    return;
  }
  if(type==='wall-cabinet'){
    const p=Math.min(.022,w*.035,d*.08);
    t.box(g,w,h,p,0,h/2,back+p/2,'wood',shade(color,-.03));
    for(const y of [p/2,h-p/2])t.box(g,w,p,d,0,y,0,'wood',color,.005);
    for(const x of [-w/2+p/2,w/2-p/2])t.box(g,p,h,d,x,h/2,0,'wood',color,.004);
    t.box(g,w-p*2,p,d-p,0,h*.47,0,'wood',shade(color,-.02));
    t.box(g,p,h-p*2,d-p,0,h/2,0,'wood',shade(color,-.03));
    for(const s of [-1,1]){
      const x=s*w*.25,doorW=w/2-p*.68;
      t.box(g,doorW,h-p*1.6,p,x,h/2,d/2-p*.8,'wood',s<0?color:shade(color,-.025),.005);
      t.box(g,.009,Math.min(.20,h*.30),.022,s*w*.055,h*.38,d/2-p*.12,'metal','#8e806b',.004);
    }
    return;
  }
  if(type==='hook-rail'){
    t.box(g,w,h,.022,0,h/2,back+.011,'wood',color,.020);
    for(let i=0;i<5;i++)addSmallHook(t,g,-w*.40+i*w*.20,h*.70,back+.026,d*.66,h*.38,'#7f806e');
    for(const s of [-1,1]){const screw=t.cylinder(g,.006,.006,.003,s*w*.45,h*.5,back+.025,'metal','#9d927b',10);screw.rotation.x=PI/2;}
    return;
  }
  if(type==='entry-organizer'){
    t.box(g,w,h,.018,0,h/2,back+.009,'wood',color,.016);
    const trayY=h*.35;
    t.box(g,w*.94,.022,d*.92,0,trayY,.012,'wood',color,.009);
    t.box(g,w*.62,h*.28,.012,-w*.14,trayY+h*.14,d*.40,'wood',shade(color,-.045),.005);
    for(const x of [-w*.46,w*.18])t.box(g,.014,h*.28,d*.79,x,trayY+h*.14,.005,'wood',shade(color,-.04),.004);
    for(let i=0;i<3;i++){const note=t.box(g,w*.22,h*.23,.004,-w*.22+i*.02,trayY+h*.15+i*.011,-d*.06+i*.01,'paper',['#eee8d9','#c7d0c0','#d5ba9a'][i],.002);note.rotation.z=(i-1)*.05;}
    const disk=t.cylinder(g,w*.115,w*.115,.006,w*.30,h*.74,back+.024,'mirror','#d1dcd5',36);disk.rotation.x=PI/2;
    for(let i=0;i<4;i++)addSmallHook(t,g,-w*.34+i*w*.22,h*.20,back+.024,d*.49,h*.12,'#8e7b5e');
    return;
  }
  if(type==='wall-rail'){
    const railY=h*.88;
    for(const x of [-w*.43,w*.43]){t.box(g,.040,h*.22,.016,x,railY-.015,back+.008,'metal',color,.008);t.rod(g,[x,railY,back+.015],[x,railY,d*.04],.008,'metal',color);}
    t.rod(g,[-w*.47,railY,d*.04],[w*.47,railY,d*.04],.009,'metal',color);
    addWireBasket(t,g,w*.34,d*.76,h*.32,w*.21,h*.06,d*.08,color);
    for(let i=0;i<3;i++)addSmallHook(t,g,-w*.33+i*w*.17,railY,d*.045,d*.20,h*.23,color);
    const towel=t.box(g,w*.16,h*.37,.012,-w*.32,h*.34,d*.18,'fabric','#d6d1bd',.009);towel.rotation.z=.035;
    return;
  }
  if(type==='no-drill-rack'){
    for(const x of [-w*.31,w*.31])t.box(g,w*.18,h*.52,.008,x,h*.64,back+.005,'plastic','#e4e5dc',.016);
    addWireBasket(t,g,w*.95,d*.88,h*.25,0,h*.10,.003,color);
    for(const x of [-w*.34,w*.34])t.rod(g,[x,h*.13,back+.017],[x,h*.80,back+.017],.006,'metal',color);
    for(let i=0;i<3;i++)addBottle(t,g,(i-1)*w*.25,h*.12,.005,h*(.58-i*.07),Math.min(w*.075,d*.18),['#ccd3bf','#d9c6af','#e1ded0'][i]);
    return;
  }
  if(type==='towel-rail'){
    const railY=h*.88;
    for(const x of [-w*.44,w*.44]){t.box(g,w*.075,h*.32,.013,x,railY-.01,back+.008,'metal',color,.010);t.rod(g,[x,railY,back+.018],[x,railY,d*.31],.008,'metal',color);}
    t.rod(g,[-w*.46,railY,d*.31],[w*.46,railY,d*.31],.009,'metal',color);
    t.box(g,w*.45,h*.80,.018,0,h*.47,d*.26,'fabric','#c8c8b4',.016);
    t.box(g,w*.45,h*.69,.014,0,h*.49,d*.06,'fabric','#d7d6c3',.012);
    for(const y of [h*.13,h*.19])t.box(g,w*.43,h*.025,.002,0,y,d*.362,'fabric','#aeb59d');
    return;
  }
  if(type==='cable-tray'){
    addWireBasket(t,g,w*.94,d*.88,h*.71,0,h*.04,.004,color);
    for(const x of [-w*.35,w*.35])t.box(g,w*.08,h*.94,.012,x,h*.50,back+.006,'metal',color,.004);
    t.box(g,w*.45,h*.20,d*.44,-w*.06,h*.20,0,'plastic','#d4d2c7',.009);
    for(let i=0;i<3;i++)t.box(g,w*.035,h*.008,d*.05,-w*.20+i*w*.14,h*.307,.003,'plastic','#8f958d',.001);
    for(let i=0;i<3;i++)t.line(g,[[-w*.27+i*w*.12,h*.37,0],[-w*.19+i*w*.14,h*.56,d*.10],[w*.22,h*.49,-d*.06],[w*.37,h*.78,-d*.13]],.0025,'plastic',['#777d73','#b4b6a7','#535e55'][i]);
  }
}

function addUtilityFurnishing(t,g,w,d,h,color,type){
  if(type==='laundry-basket'){
    const tube=Math.min(.008,w*.025),base=h*.06;
    t.box(g,w*.89,.018,d*.89,0,base/2,0,'fabric',shade(color,-.08),.025);
    for(const s of [-1,1]){
      t.box(g,w*.92,h*.82,.014,0,h*.46,s*d*.43,'fabric',s<0?shade(color,-.08):color,.022);
      t.box(g,.014,h*.82,d*.87,s*w*.445,h*.46,0,'fabric',shade(color,-.04),.020);
      t.line(g,[[s*w*.43,base,-d*.42],[s*w*.43,h*.89,-d*.42],[s*w*.43,h*.89,d*.42],[s*w*.43,base,d*.42]],tube,'metal','#8d9383');
      t.line(g,[[s*w*.28,h*.83,0],[s*w*.30,h*.98,0],[s*w*.18,h*.98,0],[s*w*.17,h*.83,0]],tube*1.1,'fabric',shade(color,-.2));
    }
    t.line(g,[[-w*.44,h*.88,-d*.43],[w*.44,h*.88,-d*.43],[w*.44,h*.88,d*.43],[-w*.44,h*.88,d*.43]],tube,'fabric',shade(color,-.17),true);
    for(let i=0;i<3;i++){const folded=t.box(g,w*.65,h*.10,d*.49,0,h*(.77+i*.048),-d*.04,'fabric',['#c5c7ba','#e3dfd0','#aebcab'][i],.024);folded.rotation.y=i*.07;}
    for(let i=0;i<8;i++)t.box(g,.001,h*.62,.001,-w*.36+i*w*.102,h*.45,d*.439,'fabric',shade(color,-.10));
    return;
  }
  const slim=type==='slim-cart',wheelR=Math.min(.028,w*.11),post=slim?.006:.009;
  const levels=[h*.13,h*.43,h*.73],trayW=w*.88,trayD=d*.85;
  for(const sx of [-1,1])for(const sz of [-1,1]){
    const x=sx*w*.39,z=sz*d*.36;
    const wheel=t.cylinder(g,wheelR,wheelR,.022,x,wheelR,z,'plastic','#606a60',14);wheel.rotation.z=PI/2;
    t.rod(g,[x,wheelR*1.6,z],[x,h*.94,z],post,'metal',color);
  }
  for(const y of levels)addWireBasket(t,g,trayW,trayD,h*.12,0,y,0,color);
  for(const s of [-1,1])t.line(g,[[-w*.38,h*.90,s*d*.36],[-w*.38,h*.98,s*d*.36],[w*.38,h*.98,s*d*.36],[w*.38,h*.90,s*d*.36]],post,'metal',color);
  if(slim){
    for(let i=0;i<3;i++)addBottle(t,g,0,levels[2]+.012,-d*.23+i*d*.23,h*(.17-i*.012),w*.18,['#e0dbce','#b3c2ad','#c7ae91'][i]);
    t.box(g,w*.65,h*.14,d*.35,0,levels[0]+h*.075,d*.18,'plastic','#d8cbb3',.014);
  }else{
    t.box(g,w*.37,h*.13,d*.54,-w*.20,levels[1]+h*.07,0,'fabric','#d4cab5',.011);
    for(let i=0;i<3;i++)t.box(g,w*.53,.016,d*.64,0,levels[0]+.013+i*.018,0,'paper',['#b5bda9','#d9ccb0','#b28c70'][i],.003);
    addBottle(t,g,w*.24,levels[2]+.012,0,h*.16,w*.085,'#d3d9c4');
  }
}

/**
 * Furniture meshes are local to their centre footprint and rest on y=0.
 * The returned group's position/rotation use the item's millimetre transform.
 */
export function createFurniture(item, materialFactory) {
  const root = new THREE.Group(), g = new THREE.Group(); root.add(g);
  const type = item.type || item.catalogId || 'low-cabinet';
  const w = Math.max(0.01, M(item.w, 800)), d = Math.max(0.01, M(item.d, 500)), h = Math.max(0.004, M(item.h, 750));
  const color = item.color || '#bfaa8c';
  const primaryKind = ['bed', 'bed-single', 'single-bed', 'double-bed', 'chair', 'sofa', 'loveseat', 'bench','laundry-basket'].includes(type) ? 'fabric'
    : type === 'plant' ? 'leaf' : type === 'rug' ? 'rug' : type === 'storage-box' ? 'plastic'
    : type === 'floor-lamp' || type === 'clothes-rack' || METAL_TOOLS.has(type) ? 'metal' : 'wood';
  const t = makeTools(materialFactory, item.id, { from: primaryKind, to: item.material });
  root.name = `furniture:${item.id || type}`;
  root.userData.itemId = item.id; root.userData.type = type;
  root.userData.mount = item.mount || (WALL_TYPES.has(type) ? 'wall' : 'floor');
  root.userData.dimensions = { w: w / MM, d: d / MM, h: h / MM };
  if (WALL_TYPES.has(type)) addWallFurnishing(t,g,w,d,h,color,type);
  else if(['rolling-cart','slim-cart','laundry-basket'].includes(type)) addUtilityFurnishing(t,g,w,d,h,color,type);
  else if (['bed', 'bed-single', 'bed-storage', 'single-bed', 'double-bed'].includes(type)) addBed(t, g, w, d, h, color, type);
  else if (['wardrobe', 'wardrobe-sliding', 'low-cabinet', 'bookcase', 'bedside', 'shoe-cabinet', 'dresser', 'wall-shelf', 'nightstand', 'bookshelf'].includes(type))
    addCabinet(t, g, w, d, h, color, type === 'nightstand' ? 'bedside' : type === 'bookshelf' ? 'bookcase' : type);
  else if (type === 'desk' || type === 'desk-corner') addDesk(t, g, w, d, h, color, type === 'desk-corner');
  else if (type === 'chair' || type === 'dining-chair') addChair(t, g, w, d, h, color, type === 'dining-chair');
  else if (type === 'sofa' || type === 'loveseat') addSofa(t, g, w, d, h, color, type === 'loveseat' ? 2 : 3);
  else if (['side-table', 'dining-table', 'round-table', 'coffee-table'].includes(type)) addTable(t, g, w, d, h, color, type === 'round-table', type === 'side-table' || type === 'coffee-table');
  else if (type === 'rug') addRug(t, g, w, d, h, color);
  else if (type === 'floor-lamp') addLamp(t, g, w, d, h, color);
  else if (type === 'plant') addPlant(t, g, w, d, h, color);
  else if (type === 'storage-box') addBox(t, g, w, d, h, color);
  else if (type === 'mirror') addMirror(t, g, w, d, h, color);
  else if (type === 'divider') addDivider(t, g, w, d, h, color);
  else if (type === 'clothes-rack') addRack(t, g, w, d, h, color);
  else if (type === 'bench') {
    const topH = h * 0.14;
    fourLegs(t, g, w, d, h - topH, h - topH, color, 0.024, Math.min(0.06, d * 0.16));
    t.box(g, w, topH, d, 0, h - topH / 2, 0, 'fabric', shade(color, 0.16), 0.025);
    t.box(g, w * 0.83, 0.018, d * 0.80, 0, h * 0.24, 0, 'wood', color, 0.006);
  } else t.box(g, w, h, d, 0, h / 2, 0, item.material || 'wood', color, 0.018);
  // Parametric templates include handles, seams, plant leaves and feet in their
  // stated dimensions. Fit the generated envelope, never the project data.
  g.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(g), size = bounds.getSize(new THREE.Vector3()), centre = bounds.getCenter(new THREE.Vector3());
  if (!bounds.isEmpty()) {
    g.scale.set(w / Math.max(size.x, 0.0001), h / Math.max(size.y, 0.0001), d / Math.max(size.z, 0.0001));
    g.position.set(-centre.x * g.scale.x, -bounds.min.y * g.scale.y, -centre.z * g.scale.z);
  }
  root.position.set(M(item.x), 0, M(item.z)); root.rotation.y = asNumber(item.rotation, 0);
  root.userData.localBounds = { min: [-w / 2, 0, -d / 2], max: [w / 2, h, d / 2] };
  return root;
}

function cleanVertices(vertices) {
  const result = [];
  for (const p of vertices || []) {
    if (!Array.isArray(p) || p.length < 2 || !p.every(v => Number.isFinite(Number(v)))) continue;
    const x = M(p[0]), z = M(p[1]);
    if (!result.length || Math.hypot(result.at(-1)[0] - x, result.at(-1)[1] - z) > 0.0001) result.push([x, z]);
  }
  if (result.length > 2 && Math.hypot(result[0][0] - result.at(-1)[0], result[0][1] - result.at(-1)[1]) < 0.0001) result.pop();
  return result;
}

function polygonShape(vertices) {
  const s = new THREE.Shape();
  vertices.forEach(([x, z], i) => i ? s.lineTo(x, -z) : s.moveTo(x, -z)); s.closePath();
  return s;
}

function wallIndex(opening) {
  const value = opening.wall ?? opening.wallIndex ?? opening.edgeIndex;
  if (typeof value === 'string' && /^wall-\d+$/.test(value)) return Number(value.replace('wall-', ''));
  return Number(value);
}

function addOpening(t, wall, opening, thickness, wallH, length, outwardSign, type) {
  const width = clamp(M(opening.width, type === 'door' ? 850 : 1400), 0.15, Math.max(0.15, length - 0.08));
  const cx = clamp(M(opening.offset, length / MM / 2), width / 2 + 0.005, length - width / 2 - 0.005);
  const sill = type === 'door' ? 0 : clamp(M(opening.sill, 850), 0, wallH - 0.20);
  const height = clamp(M(opening.height, type === 'door' ? 2050 : 1400), 0.15, wallH - sill - 0.015);
  const edge = Math.min(0.055, width * 0.055, height * 0.04), z = 0;
  const frameColor = type === 'door' ? '#c7ad8b' : '#e6e5dd';
  const frameKind = type === 'door' ? 'wood' : 'metal';
  const frameD = thickness + 0.025;
  for (const x of [cx - width / 2 + edge / 2, cx + width / 2 - edge / 2])
    t.box(wall, edge, height, frameD, x, sill + height / 2, z, frameKind, frameColor, 0.003);
  t.box(wall, width, edge, frameD, cx, sill + height - edge / 2, z, frameKind, frameColor, 0.003);
  if (type === 'window') {
    t.box(wall, width, edge, frameD, cx, sill + edge / 2, z, frameKind, frameColor, 0.003);
    const glassW = width - edge * 2, glassH = height - edge * 2;
    t.box(wall, glassW, glassH, 0.008, cx, sill + height / 2, 0, 'glass', '#d5e6e3');
    if (width > 0.8) t.box(wall, edge * 0.65, glassH, thickness * 0.66, cx, sill + height / 2, 0, 'metal', frameColor, 0.002);
    if (height > 1.6) t.box(wall, glassW, edge * 0.55, thickness * 0.66, cx, sill + height * 0.73, 0, 'metal', frameColor, 0.002);
    const sillDepth = Math.max(thickness + 0.045, M(opening.depth, thickness / MM + 110));
    t.box(wall, width + 0.065, 0.035, sillDepth, cx, Math.max(0.018, sill - 0.017), -outwardSign * (sillDepth - thickness) * 0.25, 'stone', '#dfdcd0', 0.009);
    t.box(wall, 0.012, 0.11, 0.022, cx + width * 0.20, sill + height * 0.47, -outwardSign * thickness * 0.42, 'metal', '#9aa49a', 0.004);
  } else {
    const doorW = width - edge * 2, doorH = height - edge;
    const pivot = new THREE.Group();
    const hingeRight = opening.hinge === 'right' || opening.hinge === 1;
    pivot.position.set(cx + (hingeRight ? 1 : -1) * doorW / 2, 0, 0);
    const sign = hingeRight ? -1 : 1;
    const leaf = t.box(pivot, doorW, doorH, 0.035, sign * doorW / 2, doorH / 2, 0, 'wood', '#cab28e', 0.006);
    const faceZ = -outwardSign * 0.019;
    t.box(pivot, doorW * 0.73, doorH * 0.58, 0.004, sign * doorW / 2, doorH * 0.59, faceZ, 'wood', '#cfbb9d', 0.004);
    const handleX = sign * doorW * 0.86, handleY = Math.min(1.02, doorH * 0.5);
    t.cylinder(pivot, 0.024, 0.024, 0.008, handleX, handleY, faceZ * 1.4, 'metal', '#a99b7f', 16).rotation.x = PI / 2;
    t.box(pivot, 0.095, 0.012, 0.012, handleX - sign * 0.032, handleY, faceZ * 2.1, 'metal', '#b0a18a', 0.004);
    // Open inward by default, exposing the actual opening and circulation route.
    const swingValue = asNumber(opening.angle ?? opening.openAngle, 32);
    const swingSign = opening.swing === 'out' || opening.swing === -1 ? -1 : 1;
    pivot.rotation.y = sign * outwardSign * swingSign * clamp(swingValue, 0, 160) * PI / 180;
    pivot.name = `door-leaf:${opening.id || ''}`;
    pivot.userData.openingId = opening.id;
    leaf.userData.doorLeaf = true;
    wall.add(pivot);
    t.box(wall, width, 0.009, thickness + 0.012, cx, 0.0045, 0, 'wood', '#b29c7b');
  }
  return { left: cx - width / 2, right: cx + width / 2, bottom: sill, top: sill + height };
}

/** Append a measured, possibly rotated floor unit clipped to the room outline. */
function appendFloorUnit(triangles, unit, positions, uvs, elevation = 0.002) {
  const { x, z, length, width, angle, gap } = unit;
  const c = Math.cos(angle), s = Math.sin(angle);
  const halfL = Math.max(0.00005, (length - gap) / 2);
  const halfW = Math.max(0.00005, (width - gap) / 2);
  const toLocal = p => [(p[0] - x) * c + (p[1] - z) * s, -(p[0] - x) * s + (p[1] - z) * c];
  const toWorld = p => [x + p[0] * c - p[1] * s, z + p[0] * s + p[1] * c];
  const radiusX = Math.abs(c) * halfL + Math.abs(s) * halfW;
  const radiusZ = Math.abs(s) * halfL + Math.abs(c) * halfW;
  const originalLength = positions.length;
  const clip = (poly, axis, value, positive) => {
    const result = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const inA = positive ? a[axis] >= value - 1e-8 : a[axis] <= value + 1e-8;
      const inB = positive ? b[axis] >= value - 1e-8 : b[axis] <= value + 1e-8;
      if (inA) result.push(a);
      if (inA !== inB) {
        const ratio = (value - a[axis]) / (b[axis] - a[axis]);
        result.push([a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio]);
      }
    }
    return result;
  };
  for (const triangle of triangles) {
    if (triangle.maxX < x - radiusX || triangle.minX > x + radiusX || triangle.maxZ < z - radiusZ || triangle.minZ > z + radiusZ) continue;
    let poly = triangle.points.map(toLocal);
    for (const [axis, val, positive] of [[0, -halfL, true], [0, halfL, false], [1, -halfW, true], [1, halfW, false]]) {
      poly = clip(poly, axis, val, positive); if (poly.length < 3) break;
    }
    for (let i = 1; i + 1 < poly.length; i++) {
      const tri = [poly[0], poly[i], poly[i + 1]];
      const cross = (tri[1][0] - tri[0][0]) * (tri[2][1] - tri[0][1]) - (tri[1][1] - tri[0][1]) * (tri[2][0] - tri[0][0]);
      if (Math.abs(cross) < 1e-12) continue;
      // In x/z coordinates positive area points down in world y.
      if (cross > 0) [tri[1], tri[2]] = [tri[2], tri[1]];
      // Local UVs use actual metres, with u always along a plank's long edge.
      // This preserves grain direction and physical texture size in herringbone.
      for (const p of tri) {
        const world = toWorld(p);
        positions.push(world[0], elevation, world[1]);
        uvs.push(p[0] + length / 2, p[1] + width / 2);
      }
    }
  }
  return positions.length > originalLength;
}

/** Millimetre room shell, real openings, clipped floorboards, grouped wall edges. */
export function buildRoom(structure, materialFactory) {
  const root = new THREE.Group(); root.name = 'room'; root.userData.walls = [];
  const vertices = cleanVertices(structure.vertices);
  if (vertices.length < 3) return root;
  const t = makeTools(materialFactory);
  const wallH = Math.max(0.5, M(structure.height, 2700));
  const thickness = Math.max(0.035, M(structure.wallThickness, 160));
  const wallColor = structure.wallColor || '#e8e3d7';
  const wallKey = structure.wallMaterial || 'paint';
  const wallKind = ({ paint: 'wall-paint', plaster: 'wall-plaster', wallpaper: 'wall-paper', paper: 'wall-paper' })[wallKey] || wallKey;
  const skirtingColor = structure.skirtingColor || '#e7dfd0';
  const floorKey = typeof structure.floorMaterial === 'string' ? structure.floorMaterial : structure.floorMaterial?.type || 'oak';
  const floorColor = structure.floorColor || structure.floorMaterial?.color || '#ffffff';
  const floorType = ['tile', 'plank'].includes(structure.floorType) ? structure.floorType : /tile|stone|marble|concrete|terrazzo/i.test(floorKey) ? 'tile' : 'plank';
  const patternValue = structure.floorPattern || (/herringbone/i.test(floorKey) ? 'herringbone' : floorType === 'plank' ? 'staggered' : 'straight');
  const pattern = ['straight', 'staggered', ...(floorType === 'plank' ? ['herringbone'] : [])].includes(patternValue) ? patternValue : 'straight';
  const unitWidth = clamp(M(structure.floorUnitWidth, floorType === 'tile' ? 600 : 180), 0.08, 2.0);
  const unitLength = clamp(M(structure.floorUnitLength, floorType === 'tile' ? 600 : 1200), 0.08, 3.0);
  const gap = clamp(M(structure.floorGap, floorType === 'tile' ? 2 : 1), 0, Math.min(0.02, unitWidth * 0.2, unitLength * 0.2));
  const groutColor = structure.floorGroutColor || (floorType === 'tile' ? '#d4d6d4' : '#7d807e');
  const floorKind = 'floor:' + floorType;
  const xs = vertices.map(p => p[0]), zs = vertices.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const shape = polygonShape(vertices), floorGeometry = new THREE.ExtrudeGeometry(shape, { depth: 0.11, bevelEnabled: false, steps: 1 });
  floorGeometry.rotateX(-PI / 2); floorGeometry.translate(0, -0.11, 0);
  const floorPositions = floorGeometry.getAttribute('position'), floorNormals = floorGeometry.getAttribute('normal'), floorUV = floorGeometry.getAttribute('uv');
  for (let i = 0; i < floorPositions.count; i++) if (floorNormals.getY(i) > 0.5) {
    floorUV.setXY(i, floorPositions.getX(i) - minX, floorPositions.getZ(i) - minZ);
  }
  floorUV.needsUpdate = true;
  floorGeometry.userData.floorUVUnits = 'metres';
  floorGeometry.userData.floorUVOrigin = [minX, minZ];
  const floor = t.mesh(root, floorGeometry, t.material('floor-grout', groutColor));
  floor.name = 'room-floor'; floor.userData.isFloor = true;
  const points = vertices.map(([x, z]) => new THREE.Vector2(x, z));
  const triangles = THREE.ShapeUtils.triangulateShape(points, []).map(indices => {
    const pts = indices.map(i => vertices[i]);
    return { points: pts, minX: Math.min(...pts.map(p => p[0])), maxX: Math.max(...pts.map(p => p[0])), minZ: Math.min(...pts.map(p => p[1])), maxZ: Math.max(...pts.map(p => p[1])) };
  });
  const positions = [], uvs = [], samples = [], pieces = [];
  const roomPolygon = [[...vertices, vertices[0]]];
  let pieceCount = 0;
  const addUnit = (x, z, angle = 0) => {
    const unit = { x, z, angle, length: unitLength, width: unitWidth, gap };
    if (!appendFloorUnit(triangles, unit, positions, uvs)) return;
    pieceCount++;
    if (samples.length < 64) samples.push(unit);
    // Keep the same clipped outlines for plan-view rendering and image exports.
    // Intersection can split a plank across a concave room; store each part.
    const c = Math.cos(angle), s = Math.sin(angle), l = (unitLength - gap) / 2, w = (unitWidth - gap) / 2;
    const outline = [[-l,-w],[l,-w],[l,w],[-l,w]].map(([u,v]) => [x + u*c - v*s, z + u*s + v*c]);
    const clipped = polygonClipping.intersection(roomPolygon, [[...outline, outline[0]]]);
    for (const polygon of clipped) if (polygon[0]?.length > 3) pieces.push(polygon[0].slice(0,-1));
  };
  if (pattern === 'herringbone') {
    // A true rectangular herringbone lattice: the two orthogonal planks occupy
    // a repeating cell of exactly 2 * length * width, with no overlap or holes.
    const angle = PI / 4, c = Math.cos(angle), s = Math.sin(angle);
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const local = vertices.map(([x, z]) => [(x - cx) * c + (z - cz) * s, -(x - cx) * s + (z - cz) * c]);
    const is = local.map(([x, z]) => (x - z) / (2 * unitLength));
    const js = local.map(([x, z]) => (x + z) / (2 * unitWidth));
    const worldUnit = (x, z, theta) => addUnit(cx + x * c - z * s, cz + x * s + z * c, theta);
    const marginI = Math.ceil((unitLength + unitWidth) / (2 * unitLength)) + 2;
    const marginJ = Math.ceil((unitLength + unitWidth) / (2 * unitWidth)) + 2;
    for (let i = Math.floor(Math.min(...is)) - marginI; i <= Math.ceil(Math.max(...is)) + marginI; i++) {
      for (let j = Math.floor(Math.min(...js)) - marginJ; j <= Math.ceil(Math.max(...js)) + marginJ; j++) {
        const x = i * unitLength + j * unitWidth, z = -i * unitLength + j * unitWidth;
        worldUnit(x + unitLength / 2, z + unitWidth / 2, angle);
        worldUnit(x + unitLength - unitWidth / 2, z - unitLength / 2, angle + PI / 2);
      }
    }
  } else {
    const rows = Math.ceil((maxZ - minZ) / unitWidth);
    for (let row = 0; row < rows; row++) {
      const offset = pattern === 'staggered' && row % 2 ? unitLength / 2 : 0;
      for (let column = -1; minX + column * unitLength + offset < maxX; column++) {
        addUnit(minX + (column + 0.5) * unitLength + offset, minZ + (row + 0.5) * unitWidth);
      }
    }
  }
  if (positions.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    geometry.userData.floorUVUnits = 'metres';
    geometry.userData.floorUVOrigin = 'per-unit';
    const surface = t.mesh(root, geometry, t.material(floorKind, floorColor));
    surface.name = floorType === 'tile' ? 'floor-tile' : 'floor-board';
    surface.userData.isFloor = true;
    surface.userData.floorUnits = samples;
  }
  const floorLayout = { type: floorType, pattern, unitWidth: unitWidth / MM, unitLength: unitLength / MM, gap: gap / MM, groutColor, pieceCount, pieces };
  floor.userData.floorLayout = floorLayout;
  root.userData.floorLayout = floorLayout;
  let area = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length]; area += a[0] * b[1] - b[0] * a[1];
  }
  const outwardSign = area > 0 ? -1 : 1;
  for (let edge = 0; edge < vertices.length; edge++) {
    const a = vertices[edge], b = vertices[(edge + 1) % vertices.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    if (length < 0.02) continue;
    const wall = new THREE.Group(); wall.name = `wall:${edge}`;
    wall.position.set(a[0], 0, a[1]); wall.rotation.y = -Math.atan2(dz, dx);
    wall.userData.edgeIndex = edge;
    wall.userData.outwardNormal = [outwardSign * -dz / length, 0, outwardSign * dx / length];
    wall.userData.center = [(a[0] + b[0]) / 2, wallH / 2, (a[1] + b[1]) / 2];
    wall.userData.length = length / MM;
    const openingRects = [];
    for (const door of structure.doors || []) if (wallIndex(door) === edge) openingRects.push(addOpening(t, wall, door, thickness, wallH, length, outwardSign, 'door'));
    for (const win of structure.windows || []) if (wallIndex(win) === edge) openingRects.push(addOpening(t, wall, win, thickness, wallH, length, outwardSign, 'window'));
    // Build only cells outside the union of door/window rectangles: actual holes.
    const cutsX = [...new Set([0, length, ...openingRects.flatMap(o => [o.left, o.right])].map(v => Math.round(clamp(v, 0, length) * 1e6) / 1e6))].sort((x, y) => x - y);
    const cutsY = [...new Set([0, wallH, ...openingRects.flatMap(o => [o.bottom, o.top])].map(v => Math.round(clamp(v, 0, wallH) * 1e6) / 1e6))].sort((x, y) => x - y);
    for (let xi = 0; xi + 1 < cutsX.length; xi++) for (let yi = 0; yi + 1 < cutsY.length; yi++) {
      const x0 = cutsX[xi], x1 = cutsX[xi + 1], y0 = cutsY[yi], y1 = cutsY[yi + 1];
      if (x1 - x0 < 0.0001 || y1 - y0 < 0.0001) continue;
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      if (openingRects.some(o => cx > o.left - 1e-6 && cx < o.right + 1e-6 && cy > o.bottom - 1e-6 && cy < o.top + 1e-6)) continue;
      const panel = t.box(wall, x1 - x0, y1 - y0, thickness, cx, cy, 0, wallKind, wallColor);
      panel.userData.isWallPanel = true;
    }
    const skirtingH = Math.min(0.085, wallH * 0.04), baseZ = -outwardSign * (thickness / 2 + 0.006);
    const baseCuts = [...new Set([0, length, ...openingRects.filter(o => o.bottom < skirtingH).flatMap(o => [o.left, o.right])])].sort((x, y) => x - y);
    for (let i = 0; i + 1 < baseCuts.length; i++) {
      const start = baseCuts[i], end = baseCuts[i + 1], mid = (start + end) / 2;
      if (end - start < 0.005 || openingRects.some(o => o.bottom < skirtingH && mid > o.left && mid < o.right)) continue;
      t.box(wall, end - start, skirtingH, 0.012, mid, skirtingH / 2, baseZ, 'board-white', skirtingColor, 0.002);
    }
    wall.userData.openings = openingRects;
    root.add(wall); root.userData.walls.push(wall);
  }
  root.userData.floorBounds = { minX, maxX, minZ, maxZ };
  return root;
}
