import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { formatDate, Modal } from '../../components/UI';
import { useAutoRefresh } from '../../utils/useAutoRefresh';

export default function PrivacyPage() {
  const [config, setConfig] = useState(null);
  const [operator, setOperator] = useState('');
  const [phone, setPhone] = useState('');
  const [consents, setConsents] = useState([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(null);
  const refreshConsents = useCallback(async () => setConsents(await api.legalConsents()), []);
  useAutoRefresh(refreshConsents);
  useEffect(() => {
    let current = true;
    Promise.all([api.privacySettings(), api.legalConsents()]).then(([value, rows]) => {
      if (!current) return;
      setConfig(value); setOperator(value.operator_name); setPhone(value.contact_phone); setConsents(rows);
    }).catch(error => current && setMessage(error.message)).finally(() => current && setLoading(false));
    return () => { current = false; };
  }, []);
  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const value = await api.savePrivacySettings({ operator_name: operator.trim(), contact_phone: phone.trim() });
      setConfig(value); setOperator(value.operator_name); setPhone(value.contact_phone);
      setMessage('设置已保存。协议内容变化后版本自动更新，微信绑定时确认当前版本，修改资料和结算不重复勾选。');
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  async function showArchive(kind, version) {
    try { setPreview(await api.legalDocument(kind, version)); }
    catch (error) { setMessage(error.message); }
  }
  return <div className="privacy-admin">
    {message && <div className="coupon-message" role="status">{message}</div>}
    <section className="panel coupon-section"><h2>商家联系与隐私指引</h2>
      <p className="muted">请填写营业执照上的真实经营主体全称。名称和电话会公开显示在小程序协议中，联系方式同时用于受理个人信息更正、删除及注销需求。</p>
      {config ? <form className="coupon-form" onSubmit={save}>
        <label className="privacy-operator">经营主体全称<input value={operator} onChange={event => setOperator(event.target.value)} maxLength={120} required disabled={busy} /></label>
        <label>联系商家电话<input type="tel" value={phone} onChange={event => setPhone(event.target.value)} minLength={5} maxLength={40} required disabled={busy} /></label>
        <button className="primary-btn" disabled={busy}>{busy ? '正在保存…' : '保存并更新指引'}</button>
      </form> : <p>{loading ? '正在加载设置…' : '设置加载失败，请重新进入此页面或检查服务连接。'}</p>}
      {config && <div className="privacy-preview-actions"><button type="button" className="secondary-btn" onClick={() => setPreview(config.privacy)}>查看当前隐私指引</button><button type="button" className="secondary-btn" onClick={() => setPreview(config.terms)}>查看当前服务协议</button></div>}
      <p className="muted">协议统一在微信绑定时确认。地址为选填，主动填写并保存即可；不填写仍可绑定和下单。当前仅支持到店提货。</p>
    </section>
    <section className="panel table-panel"><div className="panel-heading"><div><h2>绑定协议与地址变更记录</h2><p>最近 100 条 · 绑定协议确认与地址保存操作分别记录，查看当时指引存档</p></div><button className="secondary-btn" onClick={() => refreshConsents().catch(error => setMessage(error.message))}>刷新</button></div>
      <div className="table-scroll"><table><thead><tr><th>用户</th><th>记录时间</th><th>场景</th><th>选填地址</th><th>协议／指引存档</th></tr></thead><tbody>{consents.map(row => <tr key={row.id}>
        <td>{row.customer_name}<small className="block muted">客户编号 {row.customer_id}</small></td><td>{formatDate(row.accepted_at)}</td><td>{row.source === 'bind' ? '微信绑定确认' : row.source === 'address' ? '主动保存／清空地址' : '资料页确认（历史）'}</td><td>{row.address_allowed ? '用户填写并保存' : '未填写／已清空'}</td>
        <td>{row.privacy_version && <button type="button" className="row-action" onClick={() => showArchive('privacy', row.privacy_version)}>隐私指引</button>}{row.terms_version && <button type="button" className="row-action" onClick={() => showArchive('terms', row.terms_version)}>服务协议</button>}</td>
      </tr>)}</tbody></table>{!consents.length && <p className="coupon-section muted">暂无确认记录；旧账号不会自动视为已同意</p>}</div>
    </section>
    {preview && <Modal title={preview.title} description={`版本：${preview.version}`} close={() => setPreview(null)}><div className="privacy-document">{preview.sections.map(section => <section key={section.heading}><h3>{section.heading}</h3><p>{section.text}</p></section>)}</div></Modal>}
  </div>;
}
