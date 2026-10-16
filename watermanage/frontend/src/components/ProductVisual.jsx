export default function ProductVisual({ item, size = "normal" }) {
  const type = (item.package_type || "瓶").includes("桶")
    ? "桶"
    : (item.package_type || "瓶").includes("罐")
      ? "罐"
      : "瓶";
  if (item.image_url)
    return (
      <div className={`product-visual photo ${size}`}>
        <img
          src={item.image_url}
          alt={`${item.brand} ${item.capacity}`}
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      </div>
    );
  return (
    <div
      className={`product-visual ${size} ${type}`}
      style={{ "--tone": item.color || "#328bd2" }}
      aria-label={`${item.brand} ${item.capacity}`}
    >
      <i className="cap" />
      <i className="neck" />
      <i className="body">
        <b>{item.brand?.slice(0, 3)}</b>
        <small>{item.capacity}</small>
      </i>
      <span className="shine" />
    </div>
  );
}
