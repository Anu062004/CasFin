export default function GlassInput({
  as = "input",
  children,
  className = "",
  hint,
  inputClassName = "",
  label,
  ...props
}: any) {
  const Element = as;
  const fieldClassName = ["glass-field", className].filter(Boolean).join(" ");
  const controlClassName = [
    "glass-input",
    as === "textarea" ? "is-textarea" : "",
    as === "select" ? "is-select" : "",
    inputClassName
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <label className={fieldClassName}>
      {label ? <span className="glass-field-label">{label}</span> : null}
      <Element {...props} className={controlClassName}>
        {children}
      </Element>
      {hint ? <span className="glass-field-hint">{hint}</span> : null}
    </label>
  );
}
