import { OTPInput } from './motion/otp-input.jsx'

export default function ReservationField({ name, label, hint, value, onChange, onBlur, error, children, digits, format, ...props }) {
  const id = `reserve-${name}`
  const shared = {
    id,
    name,
    value,
    onChange: event => onChange(name, event.target.value),
    onBlur: () => onBlur(name),
    'aria-invalid': Boolean(error) || undefined,
    'aria-describedby': [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined,
    ...props,
  }

  return <div className="reserve-field">
    <label htmlFor={id}>{label}{name === 'schoolIndex' && <span>Optional</span>}</label>
    {digits
      ? <OTPInput {...shared} length={digits} format={format} error={error} onChange={nextValue => onChange(name, nextValue)} onBlur={() => onBlur(name)} />
      : children
        ? <select {...shared}>{children}</select>
        : <input {...shared} />}
    {hint && <p id={`${id}-hint`} className="reserve-field-hint">{hint}</p>}
    {error && <p id={`${id}-error`} className="reserve-field-error" role="alert">{error}</p>}
  </div>
}
