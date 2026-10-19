import { useId } from "react";

/**
 * Labelled field with inline error and hint.
 * Use as="select" (children = <option>s) or as="textarea" for other controls.
 */
export default function FormInput({
  label,
  name,
  error,
  hint,
  as = "input",
  required = false,
  optional = false,
  children,
  ...rest
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const Control = as;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={`field${error ? " field-invalid" : ""}`}>
      <label htmlFor={id}>
        {label}
        {optional && <span className="field-optional"> (optional)</span>}
      </label>
      <Control
        id={id}
        name={name}
        className="control"
        required={required}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy}
        {...rest}
      >
        {children}
      </Control>
      {hint && !error && (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
