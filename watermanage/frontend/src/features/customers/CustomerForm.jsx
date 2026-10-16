import { Field } from "../../components/UI";

export default function CustomerForm({ busy, cancel, submit }) {
  return (
    <form onSubmit={submit} className="form-grid">
      <Field
        label="客户名称"
        name="name"
        placeholder="输入客户或单位名称"
        required
      />
      <Field
        label="客户类型"
        name="kind"
        options={["企业", "小店", "个人"]}
        required
      />
      <Field label="联系电话" name="phone" placeholder="手机号或座机" />
      <label className="field full">
        <span>常用配送地址</span>
        <input name="address" placeholder="街道、楼栋及门牌号" />
      </label>
      <label className="field full">
        <span>备注</span>
        <textarea name="note" rows="2" placeholder="送货时间、对账方式等" />
      </label>
      <div className="form-actions">
        <button type="button" className="secondary-btn" onClick={cancel}>
          取消
        </button>
        <button className="primary-btn" disabled={busy}>
          {busy ? "保存中…" : "保存客户"}
        </button>
      </div>
    </form>
  );
}
