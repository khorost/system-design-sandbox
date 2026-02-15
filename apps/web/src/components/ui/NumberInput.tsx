import { useCallback,useState } from 'react';

interface NumberInputProps {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}

export function NumberInput({ value, onChange, min, max, step, className }: NumberInputProps) {
  const [localValue, setLocalValue] = useState<string>(String(value));
  const [touched, setTouched] = useState(false);

  const isOutOfRange = touched && (
    (min != null && Number(localValue) < min) ||
    (max != null && Number(localValue) > max) ||
    localValue === '' || isNaN(Number(localValue))
  );

  // Sync from parent when value changes externally
  if (!touched && String(value) !== localValue) {
    setLocalValue(String(value));
  }

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setLocalValue(raw);
    setTouched(true);
    const num = Number(raw);
    if (raw !== '' && !isNaN(num) && isFinite(num)) {
      onChange(num);
    }
  }, [onChange]);

  const handleBlur = useCallback(() => {
    let num = Number(localValue);
    if (isNaN(num) || !isFinite(num) || localValue === '') {
      num = min ?? 0;
    }
    if (min != null && num < min) num = min;
    if (max != null && num > max) num = max;
    setLocalValue(String(num));
    setTouched(false);
    onChange(num);
  }, [localValue, min, max, onChange]);

  const rangeTitle = min != null && max != null
    ? `Range: ${min} – ${max}`
    : min != null
      ? `Min: ${min}`
      : max != null
        ? `Max: ${max}`
        : undefined;

  return (
    <input
      type="number"
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      min={min}
      max={max}
      step={step}
      title={rangeTitle}
      className={`${className ?? ''}${isOutOfRange ? ' border-red-500' : ''}`}
    />
  );
}
