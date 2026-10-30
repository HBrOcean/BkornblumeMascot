# BkornblumeMascot（C# 版）

一只住在桌面上的 **柏林以东** Q 版角色。透明无边框、置顶、可拖动，单击会动，**支持三套皮肤切换**，还能用全局快捷键播放动作。

C# 全量实现（结构、功能与 [NameDayMascot](https://github.com/HBrOcean/NameDayMascot) 完全对齐）。

- **技术栈**：Avalonia 11.3（跨平台 UI）+ spine-csharp 4.2（Spine 运行时）+ SkiaSharp（渲染）+ SharpHook（全局按键）
- **目标框架**：.NET 10
- **平台**：Windows / macOS / Linux

## 功能

- 透明置顶桌宠窗口，30fps 实时渲染 Spine Q 版动画
- **启动入场**：先完整播一遍 `born`，再回到默认待机
- 拖动移动、位置记忆、屏幕边缘吸附
- 单击触发动作，播完自动回待机（可关闭「动作锁定」以允许打断）
- 三套皮肤即时切换
- 设置面板（桌宠 / 按键 / 关于）
- 托盘图标：显示隐藏、快速动作、设置、退出
- 单实例保护
- 文件日志：`<AppData>/BkornblumeMascot/log.txt`

## 默认快捷键

全部为 `Ctrl + 键`，互不冲突。可在「设置 → 按键」里自由修改（支持 `Ctrl+Shift+A` 这类多修饰组合）。

| 快捷键        | 效果         |
|------------|------------|
| `Ctrl + Y` | 打开设置面板     |
| `Ctrl + N` | 关闭设置面板     |
| `Ctrl + 1` | skill1     |
| `Ctrl + 2` | skill2     |
| `Ctrl + D` | die        |
| `Ctrl + Q` | unique     |
| `Ctrl + B` | born       |
| `Ctrl + G` | giddy      |
| `Ctrl + H` | hit        |
| `Ctrl + I` | idle       |
| `Ctrl + P` | posture    |
| `Ctrl + S` | sleep      |
| `Ctrl + F` | freeze     |
| `Ctrl + V` | victory    |

> 说明：全局钩子只监听、不拦截，所以在编辑器里按 `Ctrl+S` / `Ctrl+B` 等会同时触发编辑器自身的功能。介意的话可以改成 `Ctrl+Shift+字母`。

## 三套皮肤

`Assets/characters/` 下内置三套（来自 UTTU「柏林以东」系列）：

| ID     | 名称        | 造型            |
|--------|-----------|---------------|
| 302001 | 柏林以东 · 初始 | 耳机 + 深色风衣     |
| 302002 | 柏林以东 · 雾蓝 | 无耳机 + 深蓝围巾    |
| 302003 | 柏林以东 · 衣着 | 眼镜 + 蓝色蝴蝶结发饰 |

每套含同名的 `.atlas` / `.skel` / `.png`（PNG 透明底图集，由 UTTU 的 `.webp` 图集转码而来），加载时统一解码为 `RGBA8888 + Premul`，避免不同平台默认格式差异导致的花屏。

## 目录结构

```
BkornblumeMascot/
├── BkornblumeMascot.csproj
├── Program.cs                  # 入口（单实例 + 诊断 --dump [皮肤ID]）
├── App.cs                      # 编排：皮肤加载/切换、全局按键、托盘
├── Diagnostics.cs              # --dump 诊断渲染
├── Config/AppConfig.cs         # 配置模型 + JSON 持久化 + 默认快捷键
├── Rendering/
│   ├── SkeletonModel.cs        # atlas+skel 加载、贴图解码、动画状态、包围盒
│   ├── SpineCanvasRenderer.cs  # Spine → Skia 三角网格绘制
│   └── PetRenderControl.cs     # CPU 光栅 + WriteableBitmap 零拷贝显示
├── Views/
│   ├── PetWindow.cs            # 桌宠主窗口（拖动/吸附/入场/换皮肤）
│   └── SettingsWindow.cs       # 设置面板
├── Services/
│   ├── KeyHookService.cs       # 全局键盘钩子（含修饰键）
│   ├── TrayService.cs          # 托盘 + 原生菜单
│   ├── AutoStartService.cs     # 开机自启
│   ├── AppIcons.cs             # 窗口图标加载
│   └── Logger.cs               # 文件日志
├── Spine/                      # spine-csharp 4.2 运行时
└── Assets/
    ├── characters/{302001,302002,302003}/   # 三套模型（atlas/skel/png）
    └── icons/
        ├── app.png             # 窗口图标（角色头像）
        ├── app.ico             # exe 图标（多尺寸）
        └── tray.png            # 托盘图标
```

## 构建

需要 .NET 10 SDK。

```
# Windows
build.bat

# macOS / Linux
chmod +x build.sh && ./build.sh

# 或手动
dotnet build -c Release
dotnet run
```

发布单文件：

```
dotnet publish -c Release -r win-x64 -p:PublishSingleFile=true --self-contained
```

> 发布后会得到 `BkornblumeMascot.exe`（约 100MB，自带运行时）+ 同目录的 `Assets/` 文件夹，两者要放在一起。

## 相对 NameDayMascot 的改动

角色换成柏林以东需要两处适配，其余代码保持一致：

1. **包围盒改为按帧分位数估计**（`Rendering/SkeletonModel.cs`）
   柏林以东的部分动画（出场 `born`、`posture`）会让骨架整体位移很远，按原来的「所有动画取绝对 min/max」会得到 1200+ 单位的超宽包围盒，桌宠被压成很小一只且整体偏到一侧。改为先算每一帧的包围盒、再取各分量的 10%/90% 分位数，位移大的少数帧自然被排除。
2. **`--dump` 支持指定皮肤**：`BkornblumeMascot --dump 302003` 可直接渲染第三套皮肤用于排查。

另外默认快捷键补上了这套模型多出来的 `freeze`（`Ctrl+F`）与 `victory`（`Ctrl+V`）。

## 排查

- 桌宠不出现：看 `<AppData>/BkornblumeMascot/log.txt`
- 诊断渲染：`BkornblumeMascot --dump [皮肤ID]` 会渲染一帧到系统临时目录并打印附件信息
- 透明背景变白方块：Linux 下需要桌面合成器（compositor），纯 Xvfb 无合成器时窗口会显示为白色底，属环境限制

## 推送到 GitHub

双击 `push.bat`（Windows）即可。脚本会依次检查 git 环境、初始化仓库、设置 remote、提交并推送。

首次使用需先配置身份：

```
git config --global user.name "HBrOcean"
git config --global user.email "your-email@example.com"
```

目标仓库：<https://github.com/HBrOcean/BkornblumeMascot>

## 许可

代码部分为 MIT（见 `LICENSE`）。`Assets/` 下的角色素材不属于 MIT 范围，版权归原权利方（深蓝互动 / Bluepoch）所有，仅供个人非商业使用。

- Spine 运行时来自 [esotericsoftware/spine-runtimes](https://github.com/esotericsoftware/spine-runtimes)（spine-csharp 4.2），遵循 Spine Runtime License
- 模型素材来自 UTTU（uttu.merui.net）「柏林以东」资源，assetId 302001 / 302002 / 302003
