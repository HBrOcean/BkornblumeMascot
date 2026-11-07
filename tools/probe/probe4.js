// 量化：每动画每帧的 bbox 中心偏移（相对静态框中心），用于确定"整体位移"阈值
const fs = require('fs');
const path = require('path');
const spine = require('@esotericsoftware/spine-core');
const dir = process.argv[2] || './Assets/characters/302001';
const base = path.basename(dir);
const atlasText = fs.readFileSync(path.join(dir, base + '.atlas'), 'utf8');
const skelBytes = new Uint8Array(fs.readFileSync(path.join(dir, base + '.skel')));
const mockTex = { width: 512, height: 1024, setFilters() {}, setWraps() {}, dispose() {} };
const data = new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(new spine.TextureAtlas(atlasText, () => mockTex))).readSkeletonData(skelBytes);
const skel = new spine.Skeleton(data);
const upd = () => skel.updateWorldTransform(1);
function fb() {
  let x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18;
  for (const slot of skel.drawOrder) {
    const att = slot.getAttachment();
    if (!att || !(att.worldVerticesLength >= 2)) continue;
    const n = att.worldVerticesLength, buf = new Float32Array(n);
    att.computeWorldVertices(slot, 0, n, buf, 0, 2);
    for (let i = 0; i + 1 < n; i += 2) {
      if (buf[i] < x0) x0 = buf[i]; if (buf[i] > x1) x1 = buf[i];
      if (buf[i + 1] < y0) y0 = buf[i + 1]; if (buf[i + 1] > y1) y1 = buf[i + 1];
    }
  }
  return { x0, y0, x1, y1 };
}
// 静态框（分位，复现 ComputeBounds 结果）
const frames = [];
skel.setToSetupPose(); upd();
for (const a of data.animations) {
  const dur = a.duration <= 0 ? 0.1 : a.duration;
  for (let i = 0; i <= 48; i++) { a.apply(skel, 0, dur * i / 48, false, null, 1, spine.MixBlend.setup, spine.MixDirection.in); upd(); frames.push(fb()); }
}
const P = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];
const s0 = frames.map(f => f.x0).sort((a, b) => a - b), s1 = frames.map(f => f.x1).sort((a, b) => a - b);
const t0 = frames.map(f => f.y0).sort((a, b) => a - b), t1 = frames.map(f => f.y1).sort((a, b) => a - b);
const q = { x0: P(s0, .1), x1: P(s1, .9), y0: P(t0, .1), y1: P(t1, .9) };
const SCX = (q.x0 + q.x1) / 2, SCY = (q.y0 + q.y1) / 2;
const axisX = -6.7, groundY = 11.0;   // probe2 算出的锚点
const statHalfW = Math.max(axisX - q.x0, q.x1 - axisX);
console.log(`静态分位框 x[${q.x0.toFixed(0)},${q.x1.toFixed(0)}] 中心 ${SCX.toFixed(0)}  halfW=${statHalfW.toFixed(0)}  上限(1.5x)=${(statHalfW * 1.5).toFixed(0)}`);
console.log('\n动画          max|中心偏移x|  max|中心偏移y|  帧号(x偏移最大)');
const rows = [];
for (const a of data.animations) {
  const dur = a.duration <= 0 ? 0.1 : a.duration;
  let mx = 0, my = 0, at = 0;
  for (let i = 0; i <= 48; i++) {
    a.apply(skel, 0, dur * i / 48, false, null, 1, spine.MixBlend.setup, spine.MixDirection.in); upd();
    const f = fb(); const cx = (f.x0 + f.x1) / 2 - SCX, cy = (f.y0 + f.y1) / 2 - SCY;
    if (Math.abs(cx) > Math.abs(mx)) { mx = cx; at = i; }
    if (Math.abs(cy) > Math.abs(my)) my = cy;
  }
  rows.push({ name: a.name, mx: Math.abs(mx), my: Math.abs(my), at });
}
rows.sort((a, b) => b.mx - a.mx);
for (const r of rows) console.log(`${r.name.padEnd(13)} ${r.mx.toFixed(0).padStart(9)} ${r.my.toFixed(0).padStart(12)}   t=${(r.at / 48).toFixed(2)}`);

console.log('\n=== 若阈值 T=70，补偿后各动画的 needW（上限 233）');
for (const r of rows.slice(0, 6)) {
  const a = data.findAnimation(r.name), dur = a.duration <= 0 ? 0.1 : a.duration;
  let mW = 0;
  for (let i = 0; i <= 48; i++) {
    a.apply(skel, 0, dur * i / 48, false, null, 1, spine.MixBlend.setup, spine.MixDirection.in); upd();
    const f = fb();
    const cx = (f.x0 + f.x1) / 2 - SCX, cy = (f.y0 + f.y1) / 2 - SCY;
    const T = 70;
    const ox = Math.abs(cx) > T ? cx - Math.sign(cx) * T : 0;
    const x0 = f.x0 - ox, x1 = f.x1 - ox;
    mW = Math.max(mW, Math.max(axisX - x0, x1 - axisX));
  }
  console.log(`  ${r.name.padEnd(12)} needW=${mW.toFixed(0)}  ${mW > statHalfW * 1.5 ? '超上限 ✗' : (mW > statHalfW ? '需扩张 ✓' : '不扩张 ✓')}`);
}
