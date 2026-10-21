import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { Modal } from "../../components/UI";

export default function ProductImageDialog({ product, close, saved }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [failedPreview, setFailedPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function choose(event) {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;
    setError("");
    if (selected.size > 5 * 1024 * 1024) { setFile(null); setError("图片不能超过 5MB"); return; }
    if (selected.type && !["image/jpeg", "image/png", "image/webp"].includes(selected.type)) {
      setFile(null); setError("请选择 JPG、PNG 或 WebP 图片"); return;
    }
    setFile(selected);
  }
  async function upload(event) {
    event.preventDefault();
    if (busy || !file) return;
    setBusy(true); setError("");
    try {
      const result = await api.uploadProductImage(product.id, file);
      saved(result, "商品图片已更新");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
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
      {error && <p className="admin-login-error" role="alert">{error}</p>}
      <div className="form-actions">
        {product.image_url && <button type="button" className="secondary-btn" disabled={busy} onClick={remove}>移除图片</button>}
        <button type="button" className="secondary-btn" disabled={busy} onClick={close}>取消</button>
        <button type="submit" className="primary-btn" disabled={busy || !file}>{busy ? "正在处理…" : "保存图片"}</button>
      </div>
    </form>
  </Modal>;
}
