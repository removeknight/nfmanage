import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { matchesSearch } from "../../utils/search";
import { Modal } from "../../components/UI";

const roleLabels = { customer: "普通客户", staff: "店员", deputy: "副店长", owner: "店主" };

export default function CustomerPage({
  customers,
  query,
  setQuery,
  openModal,
  account,
  saveMerchantRole,
}) {
  const [source, setSource] = useState("");
  const [editing, setEditing] = useState(null);
  const [role, setRole] = useState("staff");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  function canManage(customer) {
    return customer.merchant_eligible && customer.id !== account.id &&
      customer.merchant_role !== "owner" &&
      (account.role === "owner" || (account.role === "deputy" && customer.merchant_role !== "deputy"));
  }
  function edit(customer) {
    setEditing(customer);
    setRole(customer.merchant_role === "customer" ? "staff" : customer.merchant_role);
    setError("");
  }
  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError("");
    try {
      await saveMerchantRole(editing.id, role);
      setEditing(null);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }
  const matches = customers.filter((customer) => (!source || customer.source === source) &&
    matchesSearch(
      `${customer.name} ${customer.phone} ${customer.kind} ${customer.address}`,
      query,
    ),
  );
  return (
    <><section className="panel table-panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">CUSTOMER DIRECTORY</span>
          <h2>常用客户</h2>
          <p>在已绑定的小程序客户中设置商家身份；{account.role === "owner" ? "可授权副店长和店员" : "可授权或停用店员"}</p>
        </div>
        <button className="primary-btn" onClick={() => openModal("customer")}>
          <Plus size={17} />
          新增客户
        </button>
      </div>
      <div className="table-tools">
        <label className="searchbox">
          <Search size={16} />
          <input
            placeholder="搜索客户名称或联系电话"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select className="period-select" aria-label="客户来源" value={source} onChange={event => setSource(event.target.value)}><option value="">全部客户来源</option><option value="offline">线下电脑录入</option><option value="mini">小程序</option></select>
        <span className="result-count">{matches.length} 位客户</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>客户</th>
              <th>客户类型</th>
              <th>客户来源</th>
              <th>联系电话</th>
              <th>常用地址</th>
              <th>备注</th>
              <th>商家身份</th>
              <th>权限管理</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((customer) => (
              <tr key={customer.id}>
                <td>
                  <div className="customer-name">
                    <span>{customer.name.slice(0, 1)}</span>
                    <b>{customer.name}</b>
                  </div>
                </td>
                <td>
                  <span className={`kind-chip ${customer.kind}`}>
                    {customer.kind}
                  </span>
                </td>
                <td>{customer.source_label || "线下电脑录入"}</td>
                <td>{customer.phone || "—"}</td>
                <td>{customer.address || "—"}</td>
                <td className="muted">{customer.note || "—"}</td>
                <td>{customer.merchant_role_label || "普通客户"}</td>
                <td>{canManage(customer) ? <button type="button" className="secondary-btn" onClick={() => edit(customer)}>设置权限</button> :
                  <span className="muted">{customer.id === account.id ? "当前账号" : customer.merchant_role === "owner" ? "店主" : customer.source !== "mini" ? "仅小程序客户可授权" : !customer.merchant_eligible ? "非当前小程序账号" : "无权调整"}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
    {editing && <Modal title="设置商家权限" description="授权后，该客户的小程序将显示商家工作台。" close={() => !saving && setEditing(null)}>
      <form onSubmit={submit} className="merchant-role-form">
        <p>{editing.name} · {editing.phone || "未填写手机"}</p>
        <p className="muted">当前身份：{roleLabels[editing.merchant_role] || "普通客户"}</p>
        <label className="field"><span>授权类型</span><select value={role} onChange={e => setRole(e.target.value)} disabled={saving}>
          <option value="staff">店员</option>
          {account.role === "owner" && <option value="deputy">副店长</option>}
          <option value="customer">普通客户（停用商家权限）</option>
        </select></label>
        <p className="muted">{role === "deputy" ? "可登录电脑后台，处理全部经营业务，并授权或停用店员；不能调整店主或副店长。" : role === "staff" ? "可在小程序查单、核销提货和查看库存。" : "保留客户资料和订单，移除商家工作台访问权限。"}</p>
        {error && <p className="admin-login-error" role="alert">{error}</p>}
        <div className="form-actions"><button type="button" className="secondary-btn" disabled={saving} onClick={() => setEditing(null)}>取消</button><button type="submit" className="primary-btn" disabled={saving}>{saving ? "正在保存…" : "确认保存"}</button></div>
      </form>
    </Modal>}</>
  );
}
