using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using BkornblumeMascot.Services;
using SkiaSharp;
using Spine;

namespace BkornblumeMascot.Rendering;

/// <summary>
/// 加载一个 Spine Q 版角色（atlas 文本 + .skel 二进制 + 图集图），持有贴图、骨骼与动画状态。
/// 贴图用 SkiaSharp 的 SKImage 承载，供 SpineCanvasRenderer 采样。
/// </summary>
public sealed class SkeletonModel : IDisposable
{
    public Atlas Atlas { get; }
    public SkeletonData Data { get; }
    public Skeleton Skeleton { get; }
    public AnimationState State { get; }

    // 图集页 → SKImage
    private readonly Dictionary<AtlasPage, SKImage> _images = new();
    private bool _disposed;

    /// <summary>模型自然包围盒（Spine 本地坐标，未缩放），用于确定绘制基准。</summary>
    public (float MinX, float MinY, float MaxX, float MaxY) Bounds { get; }

    public SkeletonModel(string atlasPath, string skelPath, float defaultMix = 0.15f)
    {
        var loader = new SkiaTextureLoader(_images);
        string imagesDir = Path.GetDirectoryName(Path.GetFullPath(atlasPath)) ?? ".";

        using (var reader = new StreamReader(atlasPath))
            Atlas = new Atlas(reader, imagesDir, loader);

        using (var fs = File.OpenRead(skelPath))
            Data = new SkeletonBinary(Atlas).ReadSkeletonData(fs);

        Skeleton = new Skeleton(Data);
        var stateData = new AnimationStateData(Data) { DefaultMix = defaultMix };
        State = new AnimationState(stateData);

        Bounds = ComputeBounds();
    }

    /// <summary>取某个区域对应的贴图（RegionAttachment / MeshAttachment 共用）。</summary>
    public SKImage? GetImage(TextureRegion region)
    {
        if (region is AtlasRegion ar && ar.page != null && _images.TryGetValue(ar.page, out var img))
            return img;
        // 兜底：任取一张
        foreach (var kv in _images) return kv.Value;
        return null;
    }

    public float PageWidth(TextureRegion region) =>
        (region is AtlasRegion ar && ar.page != null) ? ar.page.width : region.width;

    public float PageHeight(TextureRegion region) =>
        (region is AtlasRegion ar && ar.page != null) ? ar.page.height : region.height;

    /// <summary>动画名列表（用于设置面板下拉）。</summary>
    public IReadOnlyList<string> AnimationNames
    {
        get
        {
            var list = new List<string>();
            foreach (var a in Data.Animations) list.Add(a.Name);
            return list;
        }
    }

    public bool HasAnimation(string name) => Data.FindAnimation(name) != null;

    /// <summary>track0 是否仍在播放一次性动作（尚未播完、还没回到循环待机）。</summary>
    public bool IsActionPlaying
    {
        get
        {
            var cur = State.GetCurrent(0);
            return cur != null && !cur.Loop && cur.TrackTime < cur.AnimationEnd;
        }
    }

    /// <summary>播放动画；track0 为常规动作轨。</summary>
    public void SetAnimation(int track, string name, bool loop)
    {
        if (string.IsNullOrEmpty(name) || Data.FindAnimation(name) == null) return;
        State.SetAnimation(track, name, loop);
    }

    public void AddAnimation(int track, string name, bool loop, float delay = 0f)
    {
        if (string.IsNullOrEmpty(name) || Data.FindAnimation(name) == null) return;
        State.AddAnimation(track, name, loop, delay);
    }

    /// <summary>推进一帧：时间 → 动画 → 骨骼世界变换。</summary>
    public void Update(float deltaSeconds)
    {
        State.Update(deltaSeconds);
        State.Apply(Skeleton);
        Skeleton.UpdateWorldTransform(Skeleton.Physics.None);
    }

    /// <summary>
    /// 计算模型包围盒：按「帧」统计所有动画的包围盒，再取各分量的 10%/90% 分位数。
    /// 这样既能覆盖摆幅较大的动作（原版只取首个动画会被裁切），又不会被少数
    /// 位移很大的帧（如出场 born 从画面外飞入、技能冲刺）拖成超宽包围盒 ——
    /// 柏林以东这类模型就是后者，直接取绝对 min/max 会把它压成很小一只并且整体偏移。
    /// </summary>
    private (float, float, float, float) ComputeBounds()
    {
        var frames = new List<(float MinX, float MinY, float MaxX, float MaxY)>(256);

        void AccumulateFrame()
        {
            Skeleton.UpdateWorldTransform(Skeleton.Physics.None);
            float minX = float.MaxValue, minY = float.MaxValue, maxX = float.MinValue, maxY = float.MinValue;
            foreach (var slot in Skeleton.DrawOrder)
            {
                var att = slot.Attachment;
                if (att is VertexAttachment va && va.WorldVerticesLength >= 2)
                {
                    var verts = new float[va.WorldVerticesLength];
                    va.ComputeWorldVertices(slot, verts);
                    for (int i = 0; i + 1 < verts.Length; i += 2)
                    {
                        if (verts[i] < minX) minX = verts[i];
                        if (verts[i] > maxX) maxX = verts[i];
                        if (verts[i + 1] < minY) minY = verts[i + 1];
                        if (verts[i + 1] > maxY) maxY = verts[i + 1];
                    }
                }
            }
            if (minX <= maxX) frames.Add((minX, minY, maxX, maxY));
        }

        foreach (var anim in Data.Animations)
        {
            float dur = anim.Duration <= 0 ? 0.1f : anim.Duration;
            const int steps = 12;
            for (int i = 0; i <= steps; i++)
            {
                anim.Apply(Skeleton, 0f, dur * i / steps, false, null, 1f, MixBlend.Setup, MixDirection.In);
                AccumulateFrame();
            }
        }

        if (frames.Count == 0) AccumulateFrame();

        Skeleton.SetToSetupPose();
        State.Apply(Skeleton);
        Skeleton.UpdateWorldTransform(Skeleton.Physics.None);

        if (frames.Count == 0) return (-100, -100, 100, 100);

        static float P(List<float> a, double q) =>
            a[Math.Clamp((int)Math.Round((a.Count - 1) * q), 0, a.Count - 1)];

        var minXs = frames.Select(f => f.MinX).OrderBy(v => v).ToList();
        var minYs = frames.Select(f => f.MinY).OrderBy(v => v).ToList();
        var maxXs = frames.Select(f => f.MaxX).OrderBy(v => v).ToList();
        var maxYs = frames.Select(f => f.MaxY).OrderBy(v => v).ToList();

        float bx0 = P(minXs, 0.10), by0 = P(minYs, 0.10);
        float bx1 = P(maxXs, 0.90), by1 = P(maxYs, 0.90);

        if (bx0 > bx1 || by0 > by1) return (-100, -100, 100, 100);
        return (bx0, by0, bx1, by1);
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        foreach (var kv in _images) kv.Value?.Dispose();
        _images.Clear();
    }

    private sealed class SkiaTextureLoader : TextureLoader
    {
        private readonly Dictionary<AtlasPage, SKImage> _map;
        public SkiaTextureLoader(Dictionary<AtlasPage, SKImage> map) => _map = map;

        public void Load(AtlasPage page, string path)
        {
            if (!File.Exists(path)) return;

            var bytes = File.ReadAllBytes(path);

            // 统一到 RGBA8888 + Premul。不同平台/后端（Windows GPU、Avalonia 内置 libskia）
            // 默认解码格式不一致（实测 Linux 为 BGRA8888/Premul），显式指定可避免
            // alpha 通道丢失或预乘状态错乱导致的色块。
            using var data = SKData.CreateCopy(bytes);
            using var codec = SKCodec.Create(data);
            if (codec == null) throw new InvalidOperationException("贴图解码失败: " + path);

            var info = new SKImageInfo(codec.Info.Width, codec.Info.Height,
                SKColorType.Rgba8888, SKAlphaType.Premul);

            using var bmp = SKBitmap.Decode(codec, info);
            if (bmp == null) throw new InvalidOperationException("贴图解码为 RGBA8888 失败: " + path);

            // FromPixelCopy 会复制像素，不依赖 bitmap 的生命周期
            var img = SKImage.FromPixelCopy(info, bmp.GetPixels(), bmp.RowBytes);
            if (img == null) throw new InvalidOperationException("贴图创建失败: " + path);

            // 兜底：真无 alpha 的贴图会在透明区画出白/黑色块，这里明确暴露出来
            if (img.AlphaType == SKAlphaType.Opaque)
                Logger.Log($"[贴图] 警告：{Path.GetFileName(path)} 不含 alpha 通道（Opaque），透明区可能出现色块");

            Logger.Log($"[贴图] {Path.GetFileName(path)} {img.Width}x{img.Height} {img.ColorType}/{img.AlphaType}");

            page.rendererObject = img;
            _map[page] = img;
        }

        public void Unload(object texture) { (texture as SKImage)?.Dispose(); }
    }
}
