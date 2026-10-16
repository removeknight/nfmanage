import { ArrowDownToLine, ArrowUpFromLine, TrendingUp } from "lucide-react";
import { actionLabels, formatDate, money } from "./UI";

export default function Activity({ rows }) {
  if (!rows.length)
    return (
      <div className="empty-state">
        <span>◷</span>
        <b>今天还没有新动态</b>
        <small>完成一笔采购或销售，经营记录会显示在这里。</small>
      </div>
    );
  return (
    <div className="activity-list">
      {rows.map((row) => {
        const Icon =
          row.kind === "purchase"
            ? ArrowDownToLine
            : row.kind === "sale"
              ? ArrowUpFromLine
              : TrendingUp;
        return (
          <div className="activity-row" key={row.id}>
            <span className={`activity-icon ${row.kind}`}>
              <Icon size={16} />
            </span>
            <div className="activity-copy">
              <b>
                {actionLabels[row.kind] || row.kind}{" "}
                <small>
                  {row.product?.brand} {row.product?.name}
                </small>
              </b>
              <span>
                {row.kind === "adjustment"
                  ? `单价调整至 ${money(row.unit_price)}`
                  : `${row.quantity} 件 · ${money(row.total)}`}
              </span>
            </div>
            <time>{formatDate(row.created_at)}</time>
          </div>
        );
      })}
    </div>
  );
}
