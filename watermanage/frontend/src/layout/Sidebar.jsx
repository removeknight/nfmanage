import {
  Droplets,
  LayoutDashboard,
  MoreHorizontal,
  Package,
  ScrollText,
  Truck,
  Users,
  ChevronDown,
  Sparkles,
  ArrowUpRight,
  BarChart3,
  Menu,
  Home,
  ShoppingCart,
  Palette,
  ClipboardList,
  Ticket,
  Monitor,
} from "lucide-react";

const navigation = [
  ["概览", LayoutDashboard],
  ["商品库存", Package],
  ["采购记录", ShoppingCart],
  ["客户管理", Users],
  ["电脑订单", Monitor],
  ["小程序订单", ClipboardList],
  ["优惠券管理", Ticket],
  ["隐私与联系", ScrollText],
  ["配送订单", Truck],
  ["操作日志", ScrollText],
  ["销售明细", BarChart3],
];
export default function Sidebar({
  page,
  setPage,
  pending,
  miniPending,
  mobileOpen,
  setMobileOpen,
}) {
  return (
    <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
      <a
        className="brandmark"
        href="#"
        onClick={(event) => event.preventDefault()}
      >
        <span className="brand-icon">
          <Droplets size={22} />
        </span>
        <span>
          <strong>水饮管家</strong>
          <small>WATER MANAGER</small>
        </span>
      </a>
      <div className="store-switch">
        <span className="store-avatar">水</span>
        <span>
          <b>农丰水站</b>
          <small>总店 · 管理后台</small>
        </span>
        <ChevronDown size={15} />
      </div>
      <div className="nav-caption">工作台</div>
      <nav>
        {navigation.map(([label, Icon]) => (
          <button
            key={label}
            className={`nav-item ${page === label ? "active" : ""}`}
            onClick={() => {
              setPage(label);
              setMobileOpen(false);
            }}
          >
            <Icon size={18} />
            <span>{label}</span>
            {label === "配送订单" && pending > 0 && (
              <i className="nav-count">{pending}</i>
            )}
            {label === "小程序订单" && miniPending > 0 && (
              <i className="nav-count">{miniPending}</i>
            )}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="help-card">
          <span className="help-icon">
            <Sparkles size={15} />
          </span>
          <b>每日经营小贴士</b>
          <p>关注库存周转，让每一笔采购都有数。</p>
          <button onClick={() => setPage("操作日志")}>
            查看经营记录 <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="profile">
          <div className="profile-avatar">赵</div>
          <div>
            <b>赵店长</b>
            <small>店铺管理员</small>
          </div>
          <MoreHorizontal size={19} />
        </div>
      </div>
    </aside>
  );
}
export function Topbar({
  page,
  mobileOpen,
  setMobileOpen,
  setPage,
  theme,
  setTheme,
}) {
  return (
    <header className="topbar">
      <button
        className="mobile-menu icon-button"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        <Menu />
      </button>
      <div className="crumb">
        <button
          className="crumb-home"
          onClick={() => setPage("概览")}
          aria-label="返回首页"
          title="返回首页"
        >
          <Home size={17} />
        </button>
        <b>/</b>
        <strong>{page}</strong>
      </div>
      <div className="top-actions">
        <div className="today-label">
          {new Intl.DateTimeFormat("zh-CN", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          }).format(new Date())}
        </div>
        <label className="theme-picker" title="切换整站颜色模式">
          <Palette size={16} />
          <select
            aria-label="整站颜色模式"
            value={theme}
            onChange={(event) => setTheme(event.target.value)}
          >
            <option value="ocean">海蓝</option>
            <option value="forest">森林绿</option>
            <option value="plum">紫藤</option>
          </select>
        </label>
        <button className="icon-button bell" aria-label="通知">
          <span>♧</span>
          <i />
        </button>
        <div className="user-mini">
          <div className="profile-avatar">赵</div>
          <ChevronDown size={14} />
        </div>
      </div>
    </header>
  );
}
