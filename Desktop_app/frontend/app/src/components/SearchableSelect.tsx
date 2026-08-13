import { useEffect, useRef, useState } from 'react';

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  hasError?: boolean;
}

export default function SearchableSelect({
  value, onChange, options, placeholder, disabled, style, hasError,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const filtered = options.filter(o => o.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="relative" ref={ref} style={{ width: '100%' }}>
      <input
        type="text"
        value={open ? query : value}
        onFocus={() => { if (!disabled) { setOpen(true); setQuery(''); } }}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        placeholder={disabled ? 'Select article first' : (placeholder || 'Select...')}
        className="soleria-input"
        style={{ width: '100%', borderColor: hasError ? 'var(--error)' : undefined, ...style }}
        disabled={disabled}
        autoComplete="off"
      />
      {open && !disabled && (
        <div
          className="absolute z-20 mt-1 rounded-md overflow-auto"
          style={{
            background: 'var(--card-surface)',
            border: '1px solid var(--border-color)',
            maxHeight: 180,
            width: '100%',
            boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
          }}
        >
          {filtered.length === 0 && (
            <div className="px-3 py-2 font-inter" style={{ fontSize: 12, color: 'var(--muted-text)' }}>
              No matches
            </div>
          )}
          {filtered.map(o => (
            <div
              key={o}
              onMouseDown={e => {
                e.preventDefault();
                onChange(o);
                setOpen(false);
                setQuery('');
              }}
              className="px-3 py-2 cursor-pointer font-inter"
              style={{
                fontSize: 13,
                background: o === value ? 'var(--app-bg)' : undefined,
                color: 'var(--primary-text)',
              }}
            >
              {o}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
