# BkornblumeMascot

一只住在桌面上的 Q 版桌面宠物。透明无边框、始终置顶、随意拖动，单击会播动作，支持多套皮肤切换和全局快捷键。

| | |
|---|---|
| **技术栈** | .NET 10 · Avalonia 11.3 · spine-csharp 4.2 · SkiaSharp · SharpHook |
| **平台** | Windows（完整功能）· macOS / Linux 可运行，窗口特效与开机自启仅 Windows 生效 |

## 下载

到 [Releases](https://github.com/HBrOcean/BkornblumeMascot/releases) 下载 `BkornblumeMascot-win-x64.zip`，解压后双击 `BkornblumeMascot.exe` 即可。

自包含单文件，**不需要另外安装 .NET 运行时**。

## 特性

- 30fps 实时渲染 Spine 动画，透明背景，不占任务栏
- 启动时先播一遍入场动画，再自然转入待机（换皮肤时不播 born）
- 拖动移动、位置记忆；允许拖到屏幕外，接触边缘不回弹
- 在角色身上滚动鼠标滚轮调大小（5%~200%，自动保存）
- 窗口随动作幅度自适应大小，渲染始终不超出窗口
- 单击按配置播放动作（默认随机），播完自动回待机
- 定时随机动作：默认每 20 秒自己动一下，5~180 秒可调、可关；与「点击动作」配置完全解耦
- 皮肤自动扫描 `Assets/characters/`，卡片网格选择、带运行时渲染的缩略图
- 全局快捷键播放指定动作，可视化编辑绑定（两行卡片、动画名下拉、chip 标签、非法格式标红、一键恢复默认）
- 托盘与右键菜单：设置 / 播放动作 / 切换皮肤 / 重置位置 / 隐藏 / 退出
- 单实例保护：二次启动会唤醒已运行的实例，不会开出第二只
- 动作菜单/下拉全部带中文名（至终仪式（unique）…），16 个动画一个不少
- 完整的设置面板，改动即时生效

## 默认快捷键

全部为 `Ctrl + 键`，可在「设置 → 按键」里自由修改，支持 `Ctrl+Shift+A` 这类多修饰组合。

| 快捷键 | 动作 | 快捷键 | 动作 |
|---|---|---|---|
| `Ctrl + Y` | 打开设置面板 | `Ctrl + G` | giddy（开怀） |
| `Ctrl + N` | 关闭设置面板 | `Ctrl + H` | hit（受击） |
| `Ctrl + 1` | skill1（技能一） | `Ctrl + I` | idle（待机） |
| `Ctrl + 2` | skill2（技能二） | `Ctrl + P` | posture（姿态） |
| `Ctrl + D` | die（倒下） | `Ctrl + S` | sleep（睡眠） |
| `Ctrl + Q` | unique（至终仪式） | `Ctrl + B` | born（出场） |
| `Ctrl + F` | freeze（定格） | `Ctrl + V` | victory（胜利） |

> `skill2` / `unique` 在柏林以东模型里各有 2~3 个变体（`skill2_1`、`unique_2`…），每次触发随机挑一个。

> 全局钩子只监听、不拦截。所以在编辑器里按 `Ctrl+S` / `Ctrl+B` 会同时触发编辑器自身的功能，介意的话改成 `Ctrl+Shift+字母`。

## 皮肤

启动时扫描 `Assets/characters/` 下的每个子目录，哪个目录里凑齐了同名的 `.atlas` 和 `.skel`，就算一套可用皮肤。

内置三套（UTTU「柏林以东」系列），列表里排在最前：

| ID | 名称 | 造型 |
|---|---|---|
| 302001 | 柏林以东 · 初始 | 耳机 + 深色风衣 |
| 302002 | 柏林以东 · 雾蓝 | 无耳机 + 深蓝围巾 |
| 302003 | 柏林以东 · 衣着 | 眼镜 + 蓝色蝴蝶结发饰 |

显示名三级兜底：内置名 → 目录里的 `display.txt` → 目录名。资源不全的皮肤会置灰、不可选。

### 添加自己的皮肤

1. 在 `Assets/characters/` 下新建子目录，目录名就是皮肤 ID（例如 `my_pet`）
2. 放入同名文件：`my_pet.atlas`、`my_pet.skel`，以及 atlas 里声明的图集
3. 想要自定义显示名，在目录里放一个 `display.txt`（UTF-8，第一行即名字）
4. 打开设置 → **皮肤** → 点「刷新列表」

资源不齐的皮肤会显示成灰色并标注「资源缺失」，不会让列表变空。

设置面板里的预览图是运行时渲染出来的（图集本身是散件拼图，不能直接当缩略图）。首次渲染后缓存到配置目录，换模型后对不上时点「重建预览图」即可。

## 配置

配置文件：`%AppData%\BkornblumeMascot\config.json`（macOS / Linux 为 `~/.config/BkornblumeMascot/`）

所有选项都能在设置面板里改，一般不需要手动编辑。改完重启生效。

日志同样在这个目录下的 `log.txt`，排查问题先看它。

## 从源码构建

需要 [.NET 10 SDK](https://dotnet.microsoft.com/download)。

```bash
# Windows
build.bat

# macOS / Linux
chmod +x build.sh && ./build.sh

# 或者直接
dotnet run
```

打包成自包含单文件 exe：

```bash
dotnet publish -c Release -r win-x64 -p:PublishSingleFile=true --self-contained true
```

推送到 GitHub 后，Actions 会自动在 `windows-latest` 上构建；打一个 `v*` 标签还会自动发布 Release：

```bash
git tag v0.1.0
git push origin v0.1.0
```

## 常见问题

**桌宠不见了**
按 `Ctrl + Y` 打开设置面板，或点托盘 / 右键菜单里的「重置位置」。窗口允许拖到屏幕外（只要露出一个像素就算还在），只有完全不在任何屏幕上时启动才会自动放回右下角。

**快捷键没反应**
打开 `<AppData>/BkornblumeMascot/log.txt` 看是否有 `[Key] 收到 ...` 记录。没有记录说明按键被系统或其他软件拦截了；有记录但不触发，检查绑定格式是否为 `修饰键 + Vc键名`（如 `Ctrl+Vc1`），设置面板里格式错误会标红。

**换了皮肤，部分快捷键不动了**
不同角色的动画名不一定通用。按键绑定里失效的动作会变红，删掉重新选即可。

**开了鼠标穿透后拖不动了**
穿透模式下点击会落到下层窗口，角色本身收不到鼠标事件。关掉穿透用设置面板或托盘操作。

## 为柏林以东做的适配

渲染与几何逻辑完全沿用 NameDayMascot 那套（逐帧 49 帧采样 + 分位保护、绘制比例与窗口解耦、视框对称扩张/延迟收缩、底边中点锚定、脚底锚点 `AnchorX/AnchorY`），角色换人后做了两件大事和几处微调：

0. **窗口高度按「锚点在底边」算（本轮修正，最直观的一个）**：`_halfH` 是"锚点到最远边"的距离，渲染时锚点（脚底）钉在窗口下沿，角色只往上长，所以窗口高度只需要 `_halfH`，原先跟着宽度一起乘了 2，等于在脚底下预埋了一整份角色高度。实测 Scale 0.17 时窗口 264×456，角色只占下半 190px，上方 50% 全是透明空白（看不见，但挡鼠标、让角色显小显偏）。修正后 264×252，几乎填满。
0.1. **素材保持 uttu 原始文件**：`.skel` / `.atlas` / `.webp` 三件套原样使用，不再把 webp 转 png、也不再改 atlas 首行贴图名（SkiaSharp 的 `SKCodec` 原生支持 webp）。这套模型的 54 个可见附件全是 `MeshAttachment`，UV 烘焙在 `.skel` 里，所以 atlas 的 `rotate` 字段并不影响几何。
0.2. **整体位移补偿（根治 unique_1 / unique_2 出窗）**：用 `node` + `spine-core` 直接读 `.skel` 实测，这套模型**只有 `unique_1` / `unique_2` 存在整体平移**（帧包围盒中心偏移 912 / 749，角色被甩到 x≈-1000），其余动作最大才 93（die），`born` 只有 39。位移挂在 `root` 下面的 `bone` 骨上、`root` 本身恒为 0，所以按 root 补偿是空转。现在按「帧包围盒中心相对静态框中心的偏移」补偿，只抵消超过 70 的部分——阈值正落在 912/749 与 93 之间的断层里，正常动作一动不动。补偿后 `unique_1` 的 needW 从 997 降到 155（静态框刚好 155），播放时窗口一次都不用变。
0.3. **收缩一次到位**：视框收缩原来是逐帧插值（每帧 12%），配合「变化超过 2 DIP 就 resize」等于连续 30 帧都在 `UpdateLayout` + 改 `Position`，在 Windows 上就是肉眼可见的持续抖动。改成延迟 1.2 秒后一次性收回，每个动作最多 1 次扩张 + 1 次收缩；底边中点改用 `double` 计算再 `Math.Round`，消除整数除法在奇偶尺寸间的半像素抖动。
1. **待机兜底为 idle**：柏林以东动画表第一个是 `born`，取第一个会变成循环重播出场。
2. **可点动作池**排除 `idle / born / sleep / die / posture`，点击只播有反馈感的动作。
3. **默认缩放 0.17**：模型本地高约 286（命名日约 325），折算后视觉一致。
4. **动作中文名 + 根名随机变体**：菜单与下拉里 16 个动画一个不少、全部带中文名；快捷键配根名（`unique`）时随机挑 `unique/unique_1/unique_2` 之一，配具体名（`unique_2`）就原样播那一个。
5. **滚轮缩放**：角色身上滚动滚轮调大小，走的是同一套 `ApplySizeKeepingBottom`，不会破坏脚底锚点。
6. **修饰键状态自维护**：X11 下 `RawEvent.Mask` 不可靠，同时监听 KeyPressed/KeyReleased 并与掩码取「或」。
7. **`--dump [皮肤ID]`**：可单独渲染某套皮肤排查，同时打印包围盒与锚点。

## 许可

代码部分为 MIT（见 [LICENSE](LICENSE)）。`Assets/` 下的角色素材不在 MIT 范围内，版权归原权利方所有，仅供个人非商业使用。

- Spine 运行时来自 [esotericsoftware/spine-runtimes](https://github.com/esotericsoftware/spine-runtimes)（spine-csharp 4.2），遵循 Spine Runtime License
- 角色素材来自 UTTU「柏林以东」系列（assetId 302001 / 302002 / 302003），版权归《重返未来：1999》权利方所有
