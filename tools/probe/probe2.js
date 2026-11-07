// 精确复现 C# SkeletonModel.ComputeBounds / ComputeAnchor + PetRenderControl.UpdateView
const fs = require('fs');
const path = require('path');
const spine = require('@esotericsoftware/spine-core');

const dir = process.argv[2] || './Assets/characters/302001';
const base = path.basename(dir);
const atlasText = fs.readFileSync(path.join(dir, base + '.atlas'), 'utf8');
const skelBytes = new Uint8Array(fs.readFileSync(path.join(dir, base + '.skel')));
const mockTex = { width: 512, height: 1024, setFilters() {}, setWraps() {}, dispose() {} };
const atlas = new spine.TextureAtlas(atlasText, () => mockTex);
const data = new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(skelBytes);
const skel = new spine.Skeleton(data);

const upd = () => skel.updateWorldTransform(1);   // 1 = reset（None 在 JS 里是 falsy 被拒）

// 单帧绝对包围盒（对应 C# TryGetFrameBounds / SampleFrame）
function frameBounds() {
  let x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18;
  for (const slot of skel.drawOrder) {
    const att = slot.getAttachment();
    if (!att || !(att.worldVerticesLength >= 2)) continue;
    const n = att.worldVerticesLength;
    const buf = new Float32Array(n);
    att.computeWorldVertices(slot, 0, n, buf, 0, 2);
    for (let i = 0; i + 1 < n; i += 2) {
      if (buf[i] < x0) x0 = buf[i];
      if (buf[i] > x1) x1 = buf[i];
      if (buf[i + 1] < y0) y0 = buf[i + 1];
      if (buf[i + 1] > y1) y1 = buf[i + 1];
    }
  }
  return { x0, y0, x1, y1 };
}

function collectAll() {
  const xs = [], ys = [];
  for (const slot of skel.drawOrder) {
    const att = slot.getAttachment();
    if (!att || !(att.worldVerticesLength >= 2)) continue;
    const n = att.worldVerticesLength;
    const buf = new Float32Array(n);
    att.computeWorldVertices(slot, 0, n, buf, 0, 2);
    for (let i = 0; i + 1 < n; i += 2) { xs.push(buf[i]); ys.push(buf[i + 1]); }
  }
  return { xs, ys };
}

const P = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)))];

// ==== ComputeBounds：所有动画 × 49 帧，不重置（与 C# 一致）====
skel.setToSetupPose(); upd();
const frames = [];
for (const anim of data.animations) {
  const dur = anim.duration <= 0 ? 0.1 : anim.duration;
  for (let i = 0; i <= 48; i++) {
    anim.apply(skel, 0, dur * i / 48, false, null, 1, spine.MixBlend.setup, spine.MixDirection.in);
    upd();
    const fb = frameBounds();
    if (fb.x0 <= fb.x1) frames.push(fb);
  }
}
const sx0 = frames.map(f => f.x0).sort((a, b) => a - b);
const sx1 = frames.map(f => f.x1).sort((a, b) => a - b);
const sy0 = frames.map(f => f.y0).sort((a, b) => a - b);
const sy1 = frames.map(f => f.y1).sort((a, b) => a - b);
const abs = { x0: sx0[0], x1: sx1[sx1.length - 1], y0: sy0[0], y1: sy1[sy1.length - 1] };
const q = { x0: P(sx0, 0.1), x1: P(sx1, 0.9), y0: P(sy0, 0.1), y1: P(sy1, 0.9) };
const aw = abs.x1 - abs.x0, ah = abs.y1 - abs.y0, qw = q.x1 - q.x0, qh = q.y1 - q.y0;
const useQ = aw > qw * 2.2 || ah > qh * 2.2;
const B = useQ ? q : abs;
console.log(`== ${base}  动画 ${data.animations.length}  采样帧 ${frames.length}`);
console.log(`绝对框 ${aw.toFixed(0)}x${ah.toFixed(0)}  x[${abs.x0.toFixed(1)},${abs.x1.toFixed(1)}] y[${abs.y0.toFixed(1)},${abs.y1.toFixed(1)}]`);
console.log(`分位框 ${qw.toFixed(0)}x${qh.toFixed(0)}  x[${q.x0.toFixed(1)},${q.x1.toFixed(1)}] y[${q.y0.toFixed(1)},${q.y1.toFixed(1)}]`);
console.log(`2.2 倍判定: ${(aw / qw).toFixed(2)} / ${(ah / qh).toFixed(2)}  →  最终 Bounds = ${useQ ? '分位框' : '绝对框'} ${(B.x1 - B.x0).toFixed(0)}x${(B.y1 - B.y0).toFixed(0)}`);

// ==== ComputeAnchor：idle 12 帧 ====
let anim = data.findAnimation('idle') || data.findAnimation('posture') || data.animations[0];
const axs = [], ays = [];
skel.setToSetupPose(); upd();
{
  const dur = anim.duration <= 0 ? 0.1 : anim.duration;
  for (let i = 0; i < 12; i++) {
    anim.apply(skel, 0, dur * i / 12, false, null, 1, spine.MixBlend.setup, spine.MixDirection.in);
    upd();
    const c = collectAll();
    axs.push(...c.xs); ays.push(...c.ys);
  }
}
const sY = [...ays].sort((a, b) => a - b);
const groundY = sY[Math.floor(sY.length * 0.02)];
const topY = sY[Math.floor(sY.length * 0.98)];
const bodyH = Math.max(1e-3, topY - groundY);
const headCut = topY - bodyH * 0.20;
const headXs = [];
for (let i = 0; i < ays.length; i++) if (ays[i] >= headCut) headXs.push(axs[i]);
const pick = (headXs.length >= 8 ? headXs : axs).sort((a, b) => a - b);
let axisX = pick[Math.floor(pick.length / 2)];
const minX = Math.min(...axs), maxX = Math.max(...axs);
axisX = Math.min(Math.max(axisX, minX + (maxX - minX) * 0.15), minX + (maxX - minX) * 0.85);
console.log(`AnchorX=${axisX.toFixed(1)}  AnchorY=${groundY.toFixed(1)}   (idle 顶点 x[${minX.toFixed(0)},${maxX.toFixed(0)}] y[${groundY.toFixed(0)},${topY.toFixed(0)}])`);

// ==== UpdateView 复现：半宽/半高与 1.5 倍上限 ====
const statHalfW = Math.max(1e-3, Math.max(axisX - B.x0, B.x1 - axisX));
const statHalfH = Math.max(1e-3, Math.max(groundY - B.y0, B.y1 - groundY));
const Scale = 0.17, PadX = 0.25, PadY = 0.12, GroundInset = 12;
console.log(`静态半框 W=${statHalfW.toFixed(1)} H=${statHalfH.toFixed(1)}  → 窗口 ${(statHalfW * 2 * Scale * (1 + PadX)).toFixed(1)} x ${(statHalfH * 2 * Scale * (1 + PadY) + GroundInset).toFixed(1)} DIP`);
console.log('');
console.log('动画            帧needW最大值  相对静态框  1.5倍上限(%.0f)  是否超上限');
const cap = statHalfW * 1.5, capH = statHalfH * 1.5;
const rows = [];
for (const a of data.animations) {
  const dur = a.duration <= 0 ? 0.1 : a.duration;
  let mW = 0, mH = 0, overW = 0, overH = 0, framesN = 49;
  for (let i = 0; i <= 48; i++) {
    a.apply(skel, 0, dur * i / 48, false, null, 1, spine.MixBlend.setup, spine.MixDirection.in);
    upd();
    const fb = frameBounds();
    const needW = Math.max(axisX - fb.x0, fb.x1 - axisX);
    const needH = Math.max(groundY - fb.y0, fb.y1 - groundY);
    mW = Math.max(mW, needW); mH = Math.max(mH, needH);
    if (needW > cap) overW++;
    if (needH > capH) overH++;
  }
  rows.push({ name: a.name, mW, mH, overW, overH, ratio: mW / statHalfW });
}
rows.sort((x, y) => y.mW - x.mW);
for (const r of rows) {
  const flag = r.overW > 0 ? `是 (${r.overW}/49 帧)` : '否';
  console.log(`${r.name.padEnd(14)} ${r.mW.toFixed(0).padStart(8)} ${(r.ratio).toFixed(2).padStart(8)}x   ${cap.toFixed(0).padStart(8)}   ${flag}`);
}
