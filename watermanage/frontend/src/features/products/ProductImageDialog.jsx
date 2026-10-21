import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { Modal } from "../../components/UI";

export default function ProductImageDialog({ product, close, saved }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [failedPreview, setFailedPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const uploadController = useRef(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => () => uploadController.current?.abort(), []);
  function choose(event) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    setError("");
    if (selected.size > 5 * 1024 * 1024) { event.target.value = ""; setFile(null); setError("图片不能超过 5MB"); return; }
    if (selected.type && !["image/jpeg", "image/png", "image/webp"].includes(selected.type)) {
      event.target.value = ""; setFile(null); setError("请选择 JPG、PNG 或 WebP 图片"); return;
    }
    setFile(selected);
  }
  async function upload(event) {
    event.preventDefault();
    if (busy || !file) return;
    const controller = new AbortController();
    uploadController.current = controller;
    setBusy(true); setUploading(true); setProgress(0); setError("");
    try {
      const result = await api.uploadProductImage(product.id, file, { signal: controller.signal, onProgress: setProgress });
      saved(result, "商品图片已更新");
    } catch (e) { setError(e.message); }
    finally { uploadController.current = null; setBusy(false); setUploading(false); }
  }
  async function remove() {
    if (busy || !window.confirm("移除这张商品图片？商品将恢复显示占位图。")) return;
    setBusy(true); setError("");
    try {
      const result = await api.removeProductImage(product.id);
      saved(result, "商品图片已移除");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  const src = preview || product.image_url;
  return <Modal title="设置商品图片" description={`${product.brand} · ${product.name} · ${product.capacity}`} close={() => !busy && close()}>
    <form className="product-image-form" onSubmit={upload}>
      <div className="product-image-preview">
        {src && src !== failedPreview ? <img src={src} alt={product.name} onError={() => setFailedPreview(src)} /> : <span>暂无可显示图片</span>}
      </div>
      <label className="field"><span>选择商品图片</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={choose} disabled={busy} /></label>
      <p className="muted">支持 JPG、PNG、WebP，最大 5MB。建议使用白底正方形商品照；保存时自动压缩并保留完整商品。</p>
      {file && <p className="muted">待上传：{file.name}</p>}
      {uploading && <div className="product-upload-status" role="status" aria-live="polite">
        <progress value={progress} max="100" aria-label="图片上传进度" />
        <p>{progress < 100 ? `正在上传图片 ${progress}%` : "图片已传输，正在等待服务器保存…"}</p>
        <p className="muted">最多等待 60 秒。停止等待后，仍需刷新列表确认保存结果。</p>
        <button type="button" className="secondary-btn" onClick={() => uploadController.current?.abort()}>停止等待</button>
      </div>}
      {error && <p className="admin-login-error" role="alert">{error}</p>}
      <div className="form-actions">
        {product.image_url && <button type="button" className="secondary-btn" disabled={busy} onClick={remove}>移除图片</button>}
        <button type="button" className="secondary-btn" disabled={busy} onClick={close}>取消</button>
        <button type="submit" className="primary-btn" disabled={busy || !file}>{busy ? uploading ? (progress < 100 ? `上传中 ${progress}%` : "正在保存…") : "正在移除…" : "保存图片"}</button>
      </div>
    </form>
  </Modal>;
}
