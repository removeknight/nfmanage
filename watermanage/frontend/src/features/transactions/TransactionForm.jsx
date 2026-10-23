import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { Field } from "../../components/UI";
import { matchesSearch } from "../../utils/search";

export default function TransactionForm({
  mode,
  products,
  customers,
  busy,
  cancel,
  submit,
  resetVersion = 0,
}) {
  const isPurchase = mode.startsWith("purchase");
  const computerOnly = mode === "computer-sale";
  const isSale = mode === "sale" || computerOnly;
  const isAdjustment = mode.startsWith("adjust-");
  const presetId = Number(mode.split("-")[1]) || 0;
  const fixedProduct = Boolean(presetId);
  const [selectedId, setSelectedId] = useState(presetId);
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [createDelivery, setCreateDelivery] = useState(!computerOnly);
  const formRef = useRef(null);
  const lastReset = useRef(resetVersion);
  const selected = products.find((product) => product.id === selectedId);
  const filtered = useMemo(() => {
    return products
      .filter((product) =>
        matchesSearch(
          `${product.name} ${product.brand} ${product.capacity} ${product.category} ${product.package_type}`,
          query,
        ),
      )
      .slice(0, 16);
  }, [products, query]);
  const title = isPurchase
    ? "采购入库"
    : isSale
      ? computerOnly ? "新建电脑订单" : "新建销售单"
      : "调整销售单价";
  function chooseProduct(product) {
    setSelectedId(product.id);
    setQuery(`${product.brand} ${product.name} · ${product.capacity}`);
    setPickerOpen(false);
  }
  useEffect(() => {
    if (isSale && selected) {
      const field = document.querySelector('[name="unit_price"]');
      if (field) field.value = selected.sell_price;
    }
  }, [isSale, selectedId]);
  useEffect(() => {
    if (!resetVersion || resetVersion === lastReset.current) return;
    formRef.current?.reset();
    setSelectedId(presetId);
    setQuery("");
    setPickerOpen(false);
    setCreateDelivery(!computerOnly);
    lastReset.current = resetVersion;
  }, [resetVersion, presetId, computerOnly]);
  return (
    <form ref={formRef} onSubmit={submit} className="form-grid">
      {fixedProduct ? (
        <div className="field full">
          <span>当前商品</span>
          <input
            type="hidden"
            name="product_id"
            value={selectedId || ""}
            required
          />
          {selected ? (
            <div className="selected-product current-product">
              <b>
                {selected.brand} {selected.name}
              </b>
              <span>
                {selected.category} · {selected.capacity} ·{" "}
                {selected.package_type} · 库存 {selected.stock} 件
              </span>
            </div>
          ) : (
            <p className="inline-warning">该商品已下架，请先重新上架。</p>
          )}
        </div>
      ) : (
        <label className="field full product-picker">
          <span>搜索并选择商品</span>
          <div className="searchbox picker-search">
            <Search size={17} />
            <input
              value={query}
              onFocus={() => setPickerOpen(true)}
              onBlur={() => setTimeout(() => setPickerOpen(false), 140)}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelectedId(0);
                setPickerOpen(true);
              }}
              placeholder="搜索名称、品牌、容量、品类或包装"
              aria-label="搜索商品"
              autoComplete="off"
            />
          </div>
          <input
            type="hidden"
            name="product_id"
            value={selectedId || ""}
            required
          />
          {selected && (
            <div className="selected-product current-product">
              <b>
                {selected.brand} {selected.name}
              </b>
              <span>
                {selected.capacity} · 库存 {selected.stock} 件
              </span>
            </div>
          )}
          {pickerOpen && (
            <div className="product-results">
              {filtered.map((product) => (
                <button
                  type="button"
                  key={product.id}
                  className={`product-result ${selectedId === product.id ? "selected" : ""}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseProduct(product)}
                >
                  <span>
                    <b>
                      {product.brand} {product.name}
                    </b>
                    <small>
                      {product.category} · {product.capacity} ·{" "}
                      {product.package_type}
                    </small>
                  </span>
                  <small>库存 {product.stock}</small>
                </button>
              ))}
              {!filtered.length && (
                <p className="picker-empty">没有找到匹配商品</p>
              )}
            </div>
          )}
        </label>
      )}
      {isSale && (
        <label className="field">
          <span>客户</span>
          <select name="customer_id" required defaultValue="">
            <option value="" disabled>
              请选择常用客户
            </option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name} · {customer.kind} · {customer.source_label || "线下电脑录入"}
              </option>
            ))}
          </select>
        </label>
      )}
      {isAdjustment ? (
        <Field
          label="新销售单价（元）"
          name="unit_price"
          type="number"
          min="0"
          step="0.01"
          required
        />
      ) : (
        <>
          <Field
            label="数量"
            name="quantity"
            type="number"
            min="1"
            step="1"
            required
          />
          <Field
            label={isPurchase ? "进货单价（元）" : "销售单价（元）"}
            name="unit_price"
            type="number"
            min="0"
            step="0.01"
            defaultValue={isSale && selected ? selected.sell_price : undefined}
            required
          />
        </>
      )}
      <label className="field">
        <span>经办人</span>
        <input name="operator" defaultValue="管理员" required />
      </label>
      {isSale && !computerOnly && (
        <label className="field full checkbox-field">
          <input
            type="checkbox"
            name="create_delivery"
            checked={createDelivery}
            onChange={(event) => setCreateDelivery(event.target.checked)}
          />
          <span>生成配送任务</span>
        </label>
      )}
      {isSale && createDelivery && (
        <label className="field full">
          <span>配送地址</span>
          <input name="address" placeholder="留空时使用客户常用地址" />
        </label>
      )}
      <label className="field full">
        <span>备注</span>
        <input
          name="note"
          placeholder={isPurchase ? "供应商或采购说明" : "可选"}
        />
      </label>
      <div className="form-note">
        <Sparkles size={15} />
        {isPurchase
          ? "采购后自动重算库存加权均价并记录库存变动前后值。"
          : isSale
            ? createDelivery ? "开单即按本单金额登记已收款、扣减库存并生成配送任务，请确认已完成线下收款。" : "开单即按本单金额登记已收款并扣减库存，无需另行填写收款金额。"
            : "调价信息会保存原价、新价格、商品和操作人。"}
      </div>
      <div className="form-actions">
        <button type="button" className="secondary-btn" onClick={cancel}>
          取消
        </button>
        <button className="primary-btn" disabled={busy || !selectedId}>
          {busy ? "提交中…" : title}
        </button>
      </div>
    </form>
  );
}
