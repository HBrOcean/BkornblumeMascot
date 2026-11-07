"""按 C# PetRenderControl 的绘制变换离线光栅化，检查角色是否真的落在窗口内。
变换链（C# 原样）：
  translate(pw/2, groundPx) → scale(s, -s) → translate(-ax, -ay) → translate(-drift)
  其中 groundPx = ph - GroundInset*scaling
"""
import json, numpy as np
from PIL import Image, ImageDraw

SCALE = 0.17
PADX, PADY = 0.25, 0.12
GROUND_INSET = 12
DRIFT_THRESH = 70

d = json.load(open('/sandbox/workspace/spineprobe/frames.json'))
B = d['bounds']; AX = d['anchor']['x']; AY = d['anchor']['y']
tex = Image.open('/sandbox/workspace/assets_raw/302001.webp').convert('RGBA')
TW, TH = tex.size

statHalfW = max(AX - B['x0'], B['x1'] - AX)
statHalfH = max(AY - B['y0'], B['y1'] - AY)
statCx = (B['x0'] + B['x1']) / 2
statCy = (B['y0'] + B['y1']) / 2


def solve_affine(dst, src):
    """求 (x,y)->(u,v) 的 6 参数仿射：u=a*x+b*y+c, v=d*x+e*y+f"""
    A = np.array([[dst[0][0], dst[0][1], 1], [dst[1][0], dst[1][1], 1], [dst[2][0], dst[2][1], 1]], float)
    bu = np.array([src[0][0], src[1][0], src[2][0]], float)
    bv = np.array([src[0][1], src[1][1], src[2][1]], float)
    au = np.linalg.solve(A, bu)
    av = np.linalg.solve(A, bv)
    return (au[0], au[1], au[2], av[0], av[1], av[2])


def draw_tri(target, dst3, src3, alpha):
    x0 = max(0, int(np.floor(min(p[0] for p in dst3))))
    y0 = max(0, int(np.floor(min(p[1] for p in dst3))))
    x1 = min(target.width, int(np.ceil(max(p[0] for p in dst3))) + 1)
    y1 = min(target.height, int(np.ceil(max(p[1] for p in dst3))) + 1)
    if x1 <= x0 or y1 <= y0:
        return
    local = [(p[0] - x0, p[1] - y0) for p in dst3]
    M = solve_affine(local, src3)
    warped = tex.transform((x1 - x0, y1 - y0), Image.AFFINE, M, resample=Image.BILINEAR)
    mask = Image.new('L', (x1 - x0, y1 - y0), 0)
    ImageDraw.Draw(mask).polygon(local, fill=int(255 * max(0.0, min(1.0, alpha))))
    target.paste(warped, (x0, y0), mask)


def render(shot, scaling, height_mode, with_drift, label):
    # 帧包围盒 + drift
    xs, ys = [], []
    for sl in shot['slots']:
        p = sl['pos']
        xs += p[0::2]; ys += p[1::2]
    fx0, fx1, fy0, fy1 = min(xs), max(xs), min(ys), max(ys)
    cx, cy = (fx0 + fx1) / 2 - statCx, (fy0 + fy1) / 2 - statCy
    dx = (cx - np.sign(cx) * DRIFT_THRESH) if abs(cx) > DRIFT_THRESH else 0
    dy = (cy - np.sign(cy) * DRIFT_THRESH) if abs(cy) > DRIFT_THRESH else 0
    if not with_drift:
        dx = dy = 0

    # 视框（用 drift 补偿后的位置）
    needW = max(AX - (fx0 - dx), (fx1 - dx) - AX)
    needH = max(AY - (fy0 - dy), (fy1 - dy) - AY)
    halfW = max(statHalfW, min(needW, statHalfW * 1.5))
    halfH = max(statHalfH, min(needH, statHalfH * 1.5))

    wDip = halfW * 2 * SCALE * (1 + PADX)
    if height_mode == 'symmetric':
        hDip = halfH * 2 * SCALE * (1 + PADY) + GROUND_INSET
    else:  # anchored（锚点在底部 → 只需要一半高度）
        hDip = halfH * SCALE * (1 + PADY) + GROUND_INSET

    pw, ph = int(np.ceil(wDip * scaling)), int(np.ceil(hDip * scaling))
    s = SCALE * scaling
    groundPx = ph - GROUND_INSET * scaling

    canvas = Image.new('RGBA', (pw, ph), (36, 36, 44, 255))
    # 画窗口边界参考线（角色应完全落在框内）
    for sl in shot['slots']:
        pos, uv, tris = sl['pos'], sl['uv'], sl['tris']
        alpha = sl['alpha']
        ntri = len(tris) // 3
        for k in range(ntri):
            idx = [tris[k * 3], tris[k * 3 + 1], tris[k * 3 + 2]]
            dst3, src3 = [], []
            for i in idx:
                wx, wy = pos[i * 2], pos[i * 2 + 1]
                dst3.append((pw / 2 + s * (wx - AX - dx), groundPx - s * (wy - AY - dy)))
                src3.append((uv[i * 2] * TW, uv[i * 2 + 1] * TH))
            draw_tri(canvas, dst3, src3, alpha)

    # 统计越界像素
    arr = np.array(canvas.convert('RGBA'))
    bg = np.array([36, 36, 44, 255])
    diff = np.any(arr[:, :, :3] != bg[:3], axis=2)
    ys_i, xs_i = np.nonzero(diff)
    over = 0
    if len(xs_i):
        over = int(((xs_i < 0) | (xs_i >= pw) | (ys_i < 0) | (ys_i >= ph)).sum())
        # 内容本身的边界框
        bb = (int(xs_i.min()), int(ys_i.min()), int(xs_i.max()), int(ys_i.max()))
    else:
        bb = None
    canvas.save(f'/sandbox/workspace/wout_{label}.png')
    return dict(win=(pw, ph), content_bb=bb, over=over,
                needW=round(needW), needH=round(needH),
                drift=(round(dx), round(dy)), scroll=shot['anim'])


print(f"静态半框 W={statHalfW:.1f} H={statHalfH:.1f}  锚点=({AX:.1f},{AY:.1f})")
print(f"{'动画':10} {'窗口(px)':12} {'内容bbox':22} {'needW':>6} {'drift':>10}")
for mode in ['symmetric', 'anchored']:
    print(f"\n== 窗口高度算法: {mode}")
    for shot in d['shots']:
        r = render(shot, 4, mode, True, f"{shot['anim']}_{mode}")
        fit = 'OK' if r['content_bb'] and r['content_bb'][0] >= 0 and r['content_bb'][1] >= 0 and \
              r['content_bb'][2] < r['win'][0] and r['content_bb'][3] < r['win'][1] else '超出!'
        print(f"{shot['anim']:10} {str(r['win']):12} {str(r['content_bb']):22} {r['needW']:>6} {str(r['drift']):>10}  {fit}")
