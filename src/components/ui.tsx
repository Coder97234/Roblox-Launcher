import type { ReactNode } from 'react';
import { AlertIcon, CheckIcon } from './Icons';

type Tone = 'ok' | 'warn' | 'danger' | 'muted' | 'accent';

export function StatusDot({ tone }: { tone: Tone }) {
  return <span className={`status-dot status-dot--${tone}`} aria-hidden="true" />;
}

export function StatusPill({
  tone,
  children,
  icon,
}: {
  tone: Tone;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <span className={`pill pill--${tone}`}>
      {icon ?? <StatusDot tone={tone} />}
      {children}
    </span>
  );
}

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className = '',
  glow = false,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <section className={`panel ${glow ? 'panel--glow' : ''} ${className}`}>
      {(title || actions) && (
        <header className="panel__head">
          <div>
            {title && <h2 className="panel__title">{title}</h2>}
            {subtitle && <p className="panel__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="panel__actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Button({
  children,
  onClick,
  variant = 'secondary',
  size = 'md',
  disabled,
  type = 'button',
  title,
  icon,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  type?: 'button' | 'submit';
  title?: string;
  icon?: ReactNode;
}) {
  return (
    <button
      type={type}
      className={`btn btn--${variant} btn--${size}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {icon && <span className="btn__icon">{icon}</span>}
      {children}
    </button>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`field field--row ${disabled ? 'field--disabled' : ''}`}>
      <span className="field__text">
        <span className="field__label">{label}</span>
        {description && <span className="field__description">{description}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={label}
      />
    </label>
  );
}

export function Select({
  label,
  description,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`field field--row ${disabled ? 'field--disabled' : ''}`}>
      <span className="field__text">
        <span className="field__label">{label}</span>
        {description && <span className="field__description">{description}</span>}
      </span>
      <select
        className="select"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TextField({
  label,
  description,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="field field--column">
      <span className="field__label">{label}</span>
      {description && <span className="field__description">{description}</span>}
      <input
        className="input"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function ErrorNotice({
  error,
  onDismiss,
}: {
  error: { what: string; why: string; next: string; code?: string };
  onDismiss?: () => void;
}) {
  return (
    <div className="notice notice--danger" role="alert">
      <span className="notice__icon">
        <AlertIcon size={18} />
      </span>
      <div className="notice__body">
        <p className="notice__what">{error.what}</p>
        <dl className="notice__detail">
          <div>
            <dt>Why</dt>
            <dd>{error.why}</dd>
          </div>
          <div>
            <dt>Next</dt>
            <dd>{error.next}</dd>
          </div>
        </dl>
        {error.code && <p className="notice__code">Reference {error.code}</p>}
      </div>
      {onDismiss && (
        <button className="notice__close" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty__mark">
        <CheckIcon size={20} />
      </span>
      <p className="empty__title">{title}</p>
      <p className="empty__description">{description}</p>
      {children}
    </div>
  );
}

export function KeyValue({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <div className="kv">
      <span className="kv__label">{label}</span>
      <span className={`kv__value ${tone ? `kv__value--${tone}` : ''}`}>{value}</span>
      {hint && <span className="kv__hint">{hint}</span>}
    </div>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-hidden="true" />;
}
