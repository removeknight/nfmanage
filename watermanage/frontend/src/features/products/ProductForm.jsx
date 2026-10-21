import { useMemo, useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { Field } from "../../components/UI";

export default function ProductForm({ busy, cancel, submit, products = [] }) {
  const brands = useMemo(
    () =>
      [
        ...new Set(products.map((product) => product.brand).filter(Boolean)),
      ].sort((a, b) => a.localeCompare(b, "zh-CN")),
    [products],
  );
  const [brand, setBrand] = useState("");
  const [brandOpen, setBrandOpen] = useState(false);
  const [showAllBrands, setShowAllBrands] = useState(false);
  const options =
    showAllBrands || !brand.trim()
      ? brands
      : brands.filter((item) =>
          item.toLowerCase().includes(brand.trim().toLowerCase()),
        );
  return (
    <form onSubmit={submit} className="form-grid">
      <Field
        label="商品名称"
        name="name"
        placeholder="例如 饮用天然水"
        required
      />
      <label className="field brand-picker">
        <span>品牌</span>
        <div className="brand-input-wrap">
          <input
            name="brand"
            value={brand}
            onChange={(event) => {
              setBrand(event.target.value);
              setShowAllBrands(false);
              setBrandOpen(true);
            }}
            onFocus={() => {
              setBrandOpen(true);
              setShowAllBrands(false);
            }}
            onBlur={() => setTimeout(() => setBrandOpen(false), 140)}
            placeholder="选择已有品牌或输入新品牌"
            autoComplete="off"
            required
          />
          <button
            type="button"
            aria-label="展开全部品牌"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setShowAllBrands((current) => !current);
              setBrandOpen(true);
            }}
          >
            <ChevronDown size={17} />
          </button>
        </div>
        {brandOpen && (
          <div className="brand-options">
            {options.map((option) => (
              <button
                type="button"
                key={option}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setBrand(option);
                  setBrandOpen(false);
                  setShowAllBrands(false);
                }}
              >
                {option}
              </button>
            ))}
            {!options.length && <p>没有匹配品牌，可直接使用“{brand}”新增。</p>}
            {brand && !showAllBrands && (
              <button
                type="button"
                className="brand-show-all"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setShowAllBrands(true)}
              >
                显示全部品牌
              </button>
            )}
          </div>
        )}
      </label>
      <Field
        label="品类"
        name="category"
        options={["桶装水", "瓶装水", "罐装饮料", "大桶水", "其他"]}
        required
      />
      <Field
        label="容量规格"
        name="capacity"
        placeholder="例如 550ml / 18.9L"
        required
      />
      <Field
        label="包装形态"
        name="package_type"
        options={["瓶", "桶", "罐", "箱"]}
        required
      />
      <label className="field">
        <span>识别颜色</span>
        <div className="color-field">
          <input type="color" name="color" defaultValue="#348bd2" />
          <small>用颜色快速区分同规格商品</small>
        </div>
      </label>
      <Field label="初始库存" name="stock" type="number" defaultValue="0" />
      <Field
        label="库存警戒线"
        name="warning_stock"
        type="number"
        defaultValue="20"
      />
      <Field
        label="采购均价（元）"
        name="average_cost"
        type="number"
        step="0.01"
        defaultValue="0"
      />
      <Field
        label="销售单价（元）"
        name="sell_price"
        type="number"
        step="0.01"
        defaultValue="0"
      />
      <Field label="录入人" name="operator" defaultValue="管理员" required />
      <div className="form-note">
        <Sparkles size={15} />
        保存商品后，可在商品列表点击“设置图片”上传真实照片；未设置时显示示意图。
      </div>
      <div className="form-actions">
        <button type="button" className="secondary-btn" onClick={cancel}>
          取消
        </button>
        <button className="primary-btn" disabled={busy}>
          {busy ? "保存中…" : "保存商品"}
        </button>
      </div>
    </form>
  );
}
