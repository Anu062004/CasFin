export default function GlassButton({
  active = false,
  children,
  className = "",
  fullWidth = false,
  loading = false,
  size = "md",
  variant = "primary",
  ...props
}: any) {
  const classes = [
    "glass-button",
    `is-${variant}`,
    `is-${size}`,
    active ? "is-active" : "",
    fullWidth ? "is-full-width" : "",
    loading ? "is-loading" : "",
    className
  ]
    .filter(Boolean)
    .join(" ");

  const content = loading && typeof children === "string" && !children.endsWith("...") ? `${children}...` : children;

  return (
    <button {...props} className={classes} disabled={props.disabled || loading} type={props.type || "button"}>
      {content}
    </button>
  );
}
