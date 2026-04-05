export default function GlassCard({
  action,
  as: Component = "section",
  children,
  className = "",
  description,
  eyebrow,
  stagger = 0,
  style,
  title
}) {
  const classes = ["glass-card", "stagger-card", className].filter(Boolean).join(" ");
  const mergedStyle = { "--stagger-index": stagger, ...style };
  const hasHeader = eyebrow || title || description || action;

  return (
    <Component className={classes} style={mergedStyle}>
      {hasHeader ? (
        <div className="glass-card-header">
          <div className="glass-card-copy">
            {eyebrow ? <p className="glass-eyebrow">{eyebrow}</p> : null}
            {title ? <h2 className="glass-title">{title}</h2> : null}
            {description ? <p className="glass-description">{description}</p> : null}
          </div>
          {action ? <div className="glass-card-action">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </Component>
  );
}
