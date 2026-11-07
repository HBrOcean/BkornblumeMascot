# 用 node 直接读 .skel 做几何验证

桌宠"角色出窗 / 窗口抖动"的排查，最后是靠这几个脚本定案的 —— 它们用 `@esotericsoftware/spine-core`
直接读 `.skel`，在 JS 里复现 C# 侧 `ComputeBounds` / `ComputeAnchor` / `TryGetFrameBounds` /
`UpdateView` 的全部算法，等于不用启动 GUI 就能看到真实数据。

## 用法

```bash
npm install @esotericsoftware/spine-core@4.2.36
node probe2.js          # 静态框 / 锚点 / 每动画的 needW 与 1.5 倍上限
node probe4.js          # 每动画的「帧包围盒中心偏移」峰值 + 阈值补偿后的 needW
node probe5.js          # 模拟 20 秒播放时序，统计窗口 resize 次数
```

脚本默认读 `Assets/characters/302001`，改脚本顶部的路径可以测另外两套皮肤。

## 关键结论（302001）

```
静态绝对框 1231x354   分位框 263x286   ← 4.68 倍，分位保护生效
AnchorX = -6.7   AnchorY = 11.0

动画          帧包围盒中心最大偏移     说明
unique_1      912                 整体平移（角色被甩到 x≈-1000）
unique_2      749                 同上
die            93
skill2_1       64
unique         46
born           39
其余          ≤36
```

- 位移挂在 `root` 的子骨骼 `bone` 上，`root` 本身恒为 0 —— 所以"补偿 root 位移"是空转。
- `unique_1` 补偿后 needW 997 → 155（静态框刚好 155），播放时窗口一次都不需要变大。
- 20 秒时序模拟：窗口 resize 从 60+ 次降到 6 次，且都集中在动作起手 150ms 内。
