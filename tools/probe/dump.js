// 导出每帧的顶点/UV/三角/颜色，供 Python 按 C# 的绘制变换光栅化
const fs = require('fs');
const path = require('path');
const spine = require('@esotericsoftware/spine-core');

const dir = '/sandbox/workspace/BkornblumeMascot/Assets/characters/302001';
const base = '302001';
const atlasText = fs.readFileSync(path.join(dir, base + '.atlas'), 'utf8');
const skelBytes = new Uint8Array(fs.readFileSync(path.join(dir, base + '.skel')));
const mockTex = { width: 512, height: 1024, setFilters() {}, setWraps() {}, dispose() {} };
const data = new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(new spine.TextureAtlas(atlasText, () => mockTex))).readSkeletonData(skelBytes);
const skel = new spine.Skeleton(data);
const upd = () => skel.updateWorldTransform(1);

const BLEND = { 0: 'normal', 1: 'additive', 2: 'multiply', 3: 'screen' };

function dumpFrame() {
  const out = [];
  for (const slot of skel.drawOrder) {
    const att = slot.getAttachment();
    if (!att || !(att.worldVerticesLength >= 6)) continue;
    const n = att.worldVerticesLength;
    const pos = new Float32Array(n);
    att.computeWorldVertices(slot, 0, n, pos, 0, 2);
    const uvs = att.uvs;
    const tris = att.triangles;
    if (!uvs || !tris) continue;
    const a = slot.color.a * (att.color ? att.color.a : 1);
    out.push({
      name: slot.data.name,
      blend: BLEND[slot.data.blendMode] || 'normal',
      pos: Array.from(pos),
      uv: Array.from(uvs),
      tris: Array.from(tris),
      alpha: a,
    });
  }
  return out;
}

const shots = [];
for (const [anim, t] of [['idle', 0.5], ['unique_1', 1.2], ['unique_2', 0.5], ['born', 1.0], ['die', 0.8]]) {
  const a = data.findAnimation(anim);
  skel.setToSetupPose();
  a.apply(skel, 0, t, false, null, 1, spine.MixBlend.setup, spine.MixDirection.in);
  upd();
  shots.push({ anim, t, slots: dumpFrame() });
}

// 静态框 / 锚点（复现 C# 算法，全动画 49 帧）
const frames = [];
skel.setToSetupPose(); upd();
for (const a of data.animations) {
  const dur = a.duration <= 0 ? 0.1 : a.duration;
  for (let i = 0; i <= 48; i++) {
    a.apply(skel, 0, dur * i / 48, false, null, 1, spine.MixBlend.setup, spine.MixDirection.in);
    upd();
    const s = dumpFrame();
    let x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18;
    for (const sl of s) for (let i = 0; i + 1 < sl.pos.length; i += 2) {
      if (sl.pos[i] < x0) x0 = sl.pos[i]; if (sl.pos[i] > x1) x1 = sl.pos[i];
      if (sl.pos[i + 1] < y0) y0 = sl.pos[i + 1]; if (sl.pos[i + 1] > y1) y1 = sl.pos[i + 1];
    }
    if (x0 <= x1) frames.push([x0, y0, x1, y1]);
  }
}
const P = (arr, p) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(arr.length * p)))];
const s0 = frames.map(f => f[0]).sort((a, b) => a - b), s1 = frames.map(f => f[2]).sort((a, b) => a - b);
const t0 = frames.map(f => f[1]).sort((a, b) => a - b), t1 = frames.map(f => f[3]).sort((a, b) => a - b);
const B = { x0: P(s0, .1), y0: P(t0, .1), x1: P(s1, .9), y1: P(t1, .9) };

// 锚点
const axs = [], ays = [];
{
  const a = data.findAnimation('idle');
  skel.setToSetupPose(); upd();
  for (let i = 0; i < 12; i++) {
    a.apply(skel, 0, a.duration * i / 12, false, null, 1, spine.MixBlend.setup, spine.MixDirection.in);
    upd();
    for (const sl of dumpFrame()) for (let i2 = 0; i2 + 1 < sl.pos.length; i2 += 2) { axs.push(sl.pos[i2]); ays.push(sl.pos[i2 + 1]); }
  }
}
const sY = [...ays].sort((a, b) => a - b);
const groundY = sY[Math.floor(sY.length * 0.02)], topY = sY[Math.floor(sY.length * 0.98)];
const headCut = topY - (topY - groundY) * 0.2;
const headXs = [];
for (let i = 0; i < ays.length; i++) if (ays[i] >= headCut) headXs.push(axs[i]);
const pick = (headXs.length >= 8 ? headXs : axs).sort((a, b) => a - b);
const mn = Math.min(...axs), mx = Math.max(...axs);
let AX = pick[Math.floor(pick.length / 2)];
AX = Math.min(Math.max(AX, mn + (mx - mn) * 0.15), mn + (mx - mn) * 0.85);

fs.writeFileSync('/sandbox/workspace/spineprobe/frames.json', JSON.stringify({ bounds: B, anchor: { x: AX, y: groundY }, shots }));
console.log('bounds', B, 'anchor', AX.toFixed(1), groundY.toFixed(1), 'shots', shots.length);
