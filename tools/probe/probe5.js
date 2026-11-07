// 模拟播放时序，统计窗口 resize 次数（验证"震动"是否真的消失）
const fs = require('fs'), path = require('path');
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
// 静态框/锚点（probe2 实测值）
const B = { x0: -114.8, y0: -7.6, x1: 148.6, y1: 278.7 };
const AX = -6.7, AY = 11.0;
const statHalfW = Math.max(AX - B.x0, B.x1 - AX);
const statHalfH = Math.max(AY - B.y0, B.y1 - AY);
const Scale = 0.17, PadX = 0.25, PadY = 0.12, GroundInset = 12;
const desired = (hw, hh) => [hw * 2 * Scale * (1 + PadX), hh * 2 * Scale * (1 + PadY) + GroundInset];

let halfW = statHalfW, halfH = statHalfH, lastGrow = 0;
const DT = 0.033, SHRINK_DELAY = 1.2, THRESH = 70;

// 时间线：[起点, 动画名]
const timeline = [['idle', 0, 6], ['unique_1', 6, 10.2], ['idle', 10.2, 14], ['die', 14, 15.5], ['idle', 15.5, 20]];

let resizes = [];
let curWin = desired(halfW, halfH);
let lastTick = -1;
let maxNeed = 0;

for (let t = 0; t < 20; t += DT) {
  // 当前动画 + 时间
  const seg = timeline.find(s => t >= s[1] && t < s[2]) || timeline[timeline.length - 1];
  const anim = data.findAnimation(seg[0]);
  const lt = t - seg[1];
  skel.setToSetupPose();
  anim.apply(skel, 0, lt % Math.max(0.1, anim.duration), false, null, 1, spine.MixBlend.setup, spine.MixDirection.in);
  upd();
  const f = fb();

  // DriftOffset
  const cx = (f.x0 + f.x1) / 2 - (B.x0 + B.x1) / 2;
  const cy = (f.y0 + f.y1) / 2 - (B.y0 + B.y1) / 2;
  const dx = Math.abs(cx) > THRESH ? cx - Math.sign(cx) * THRESH : 0;
  const dy = Math.abs(cy) > THRESH ? cy - Math.sign(cy) * THRESH : 0;

  // UpdateView
  let targetW = statHalfW, targetH = statHalfH;
  const needW = Math.max(AX - (f.x0 - dx), (f.x1 - dx) - AX);
  const needH = Math.max(AY - (f.y0 - dy), (f.y1 - dy) - AY);
  maxNeed = Math.max(maxNeed, needW);
  if (needW > targetW) targetW = needW;
  if (needH > targetH) targetH = needH;
  targetW = Math.min(targetW, statHalfW * 1.5);
  targetH = Math.min(targetH, statHalfH * 1.5);
  targetW = Math.max(targetW, statHalfW);
  targetH = Math.max(targetH, statHalfH);

  if (targetW > halfW) { halfW = targetW; lastGrow = t; }
  else if (t - lastGrow > SHRINK_DELAY) { halfW = targetW; lastGrow = t; }
  if (targetH > halfH) { halfH = targetH; lastGrow = t; }
  else if (t - lastGrow > SHRINK_DELAY) { halfH = targetH; lastGrow = t; }

  // OnSizeTick（50ms 一次，变化 > 2 DIP 才 resize）
  if (t - lastTick >= 0.05) {
    lastTick = t;
    const w = desired(halfW, halfH);
    if (Math.abs(w[0] - curWin[0]) >= 2 || Math.abs(w[1] - curWin[1]) >= 2) {
      resizes.push({ t: +t.toFixed(2), from: curWin.map(v => +v.toFixed(1)), to: w.map(v => +v.toFixed(1)), anim: seg[0] });
      curWin = w;
    }
  }
}

console.log(`maxNeedW=${maxNeed.toFixed(0)}（静态 155，上限 233）`);
console.log(`20 秒内窗口 resize 次数：${resizes.length}`);
for (const r of resizes) console.log(`  t=${r.t}s [${r.anim}] ${r.from[0]}x${r.from[1]} → ${r.to[0]}x${r.to[1]} DIP`);
console.log(`\n对比：若视框收缩用逐帧插值（每帧 12%），预计 resize 次数 ≈ 60+`);
