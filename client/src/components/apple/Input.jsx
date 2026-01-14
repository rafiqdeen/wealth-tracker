import { useState, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { spring } from '../../utils/animations';

export default function Input({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  error,
  helper,
  disabled = false,
  required = false,
  icon,
  suffix,
  className = "",
  inputClassName = "",
  id: providedId,
  ...props
}) {
  const [isFocused, setIsFocused] = useState(false);
  const generatedId = useId();
  const inputId = providedId || generatedId;
  const errorId = `${inputId}-error`;
  const helperId = `${inputId}-helper`;

  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-[13px] font-medium text-[var(--label-secondary)] mb-1.5 uppercase tracking-wide"
        >
          {label}
          {required && <span className="text-[var(--system-red)] ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--label-tertiary)]" aria-hidden="true">
            {icon}
          </div>
        )}
        <motion.input
          id={inputId}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : helper ? helperId : undefined}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          animate={{
            borderColor: error
              ? 'var(--system-red)'
              : isFocused
                ? 'var(--system-blue)'
                : 'var(--separator-opaque)',
          }}
          transition={{ duration: 0.15 }}
          className={`
            w-full
            px-4 py-3
            bg-[var(--bg-primary)]
            border rounded-xl
            text-[17px] text-[var(--label-primary)]
            placeholder:text-[var(--label-tertiary)]
            disabled:opacity-50 disabled:cursor-not-allowed
            outline-none
            transition-shadow duration-150
            focus-visible:ring-2 focus-visible:ring-[var(--system-blue)] focus-visible:ring-offset-1
            ${isFocused ? 'shadow-[0_0_0_3px_rgba(0,122,255,0.15)]' : ''}
            ${icon ? 'pl-11' : ''}
            ${suffix ? 'pr-12' : ''}
            ${inputClassName}
          `}
          {...props}
        />
        {suffix && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--label-secondary)] text-[15px]">
            {suffix}
          </div>
        )}
      </div>
      <AnimatePresence mode="wait">
        {error ? (
          <motion.p
            key="error"
            id={errorId}
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={spring.snappy}
            className="text-[13px] text-[var(--system-red)] mt-1.5"
          >
            {error}
          </motion.p>
        ) : helper ? (
          <motion.p
            key="helper"
            id={helperId}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[13px] text-[var(--label-tertiary)] mt-1.5"
          >
            {helper}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// iOS-style search input
export function SearchInput({
  value,
  onChange,
  placeholder = "Search",
  onClear,
  className = "",
  ...props
}) {
  return (
    <div className={`relative ${className}`}>
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--label-tertiary)]"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="
          w-full
          pl-10 pr-10 py-2.5
          bg-[var(--fill-tertiary)]
          rounded-xl
          text-[17px] text-[var(--label-primary)]
          placeholder:text-[var(--label-tertiary)]
          outline-none
          focus:ring-2 focus:ring-[var(--system-blue)]/30
        "
        {...props}
      />
      {value && onClear && (
        <button
          onClick={onClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 bg-[var(--fill-secondary)] rounded-full flex items-center justify-center"
        >
          <svg className="w-3 h-3 text-[var(--label-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

// iOS-style select/picker
export function Select({
  label,
  value,
  onChange,
  options,
  placeholder = "Select...",
  error,
  required = false,
  className = "",
  id: providedId,
  ...props
}) {
  const [isFocused, setIsFocused] = useState(false);
  const generatedId = useId();
  const selectId = providedId || generatedId;
  const errorId = `${selectId}-error`;

  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={selectId}
          className="block text-[13px] font-medium text-[var(--label-secondary)] mb-1.5 uppercase tracking-wide"
        >
          {label}
          {required && <span className="text-[var(--system-red)] ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        <motion.select
          id={selectId}
          value={value}
          onChange={onChange}
          required={required}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          animate={{
            borderColor: error
              ? 'var(--system-red)'
              : isFocused
                ? 'var(--system-blue)'
                : 'var(--separator-opaque)',
          }}
          className={`
            w-full
            px-4 py-3 pr-10
            bg-[var(--bg-primary)]
            border rounded-xl
            text-[17px] text-[var(--label-primary)]
            outline-none
            appearance-none
            cursor-pointer
            focus-visible:ring-2 focus-visible:ring-[var(--system-blue)] focus-visible:ring-offset-1
            ${!value ? 'text-[var(--label-tertiary)]' : ''}
            ${isFocused ? 'shadow-[0_0_0_3px_rgba(0,122,255,0.15)]' : ''}
          `}
          {...props}
        >
          <option value="" disabled>{placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </motion.select>
        <svg
          className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--label-tertiary)] pointer-events-none"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-[13px] text-[var(--system-red)] mt-1.5">{error}</p>
      )}
    </div>
  );
}
