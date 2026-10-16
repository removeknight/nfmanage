import { Plus, Search } from "lucide-react";
import { matchesSearch } from "../../utils/search";

export default function CustomerPage({
  customers,
  query,
  setQuery,
  openModal,
}) {
  const matches = customers.filter((customer) =>
    matchesSearch(
      `${customer.name} ${customer.phone} ${customer.kind} ${customer.address}`,
      query,
    ),
  );
  return (
    <section className="panel table-panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">CUSTOMER DIRECTORY</span>
          <h2>常用客户</h2>
          <p>维护企业、小店和个人客户信息</p>
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
        <span className="result-count">{matches.length} 位客户</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>客户</th>
              <th>客户类型</th>
              <th>联系电话</th>
              <th>常用地址</th>
              <th>备注</th>
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
                <td>{customer.phone || "—"}</td>
                <td>{customer.address || "—"}</td>
                <td className="muted">{customer.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
