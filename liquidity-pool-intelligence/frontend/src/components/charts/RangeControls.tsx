import { useState, useEffect } from 'react';
import clsx from 'clsx';
import { Target, Shield, Zap, Crosshair } from 'lucide-react';

interface RangePreset {
  type: 'DEFENSIVE' | 'OPTIMIZED' | 'AGGRESSIVE';
  lower: number;
  upper: number;
  label: string;
  description: string;
}

interface RangeControlsProps {
  // Valores atuais
  currentPrice: number;
  rangeLower: number;
  rangeUpper: number;

  // Presets calculados
  presets: RangePreset[];

  // Callbacks
  onRangeChange: (lower: number, upper: number) => void;
  onPresetSelect: (type: 'DEFENSIVE' | 'OPTIMIZED' | 'AGGRESSIVE') => void;

  // Status
  disabled?: boolean;
}

export default function RangeControls({
  currentPrice,
  rangeLower,
  rangeUpper,
  presets,
  onRangeChange,
  onPresetSelect,
  disabled = false,
}: RangeControlsProps) {
  const [lowerInput, setLowerInput] = useState(rangeLower.toString());
  const [upperInput, setUpperInput] = useState(rangeUpper.toString());

  // Sincroniza inputs com props
  useEffect(() => {
    setLowerInput(rangeLower.toPrecision(6));
    setUpperInput(rangeUpper.toPrecision(6));
  }, [rangeLower, rangeUpper]);

  // Handler para mudança de input
  const handleInputChange = (type: 'lower' | 'upper', value: string) => {
    if (type === 'lower') {
      setLowerInput(value);
    } else {
      setUpperInput(value);
    }
  };

  // Handler para blur (quando sai do input)
  const handleInputBlur = (type: 'lower' | 'upper') => {
    const value = parseFloat(type === 'lower' ? lowerInput : upperInput);
    if (isNaN(value)) return;

    if (type === 'lower') {
      const newLower = Math.min(value, rangeUpper * 0.99);
      onRangeChange(newLower, rangeUpper);
    } else {
      const newUpper = Math.max(value, rangeLower * 1.01);
      onRangeChange(rangeLower, newUpper);
    }
  };

  // Calcula largura do range
  const rangeWidth = ((rangeUpper - rangeLower) / currentPrice) * 100;

  // Ícone por tipo de preset
  const presetIcons = {
    DEFENSIVE: Shield,
    OPTIMIZED: Target,
    AGGRESSIVE: Zap,
  };

  // Cores por tipo
  const presetColors = {
    DEFENSIVE: 'text-success-400 border-success-500/50 hover:border-success-500',
    OPTIMIZED: 'text-primary-400 border-primary-500/50 hover:border-primary-500',
    AGGRESSIVE: 'text-warning-400 border-warning-500/50 hover:border-warning-500',
  };

  return (
    <div className="space-y-4">
      {/* Presets */}
      <div>
        <label className="block text-sm font-medium text-dark-300 mb-2">
          Presets de Range
        </label>
        <div className="grid grid-cols-3 gap-2">
          {presets.map((preset) => {
            const Icon = presetIcons[preset.type];
            const isActive =
              Math.abs(rangeLower - preset.lower) < 0.0001 &&
              Math.abs(rangeUpper - preset.upper) < 0.0001;

            return (
              <button
                key={preset.type}
                onClick={() => onPresetSelect(preset.type)}
                disabled={disabled}
                className={clsx(
                  'p-3 rounded-lg border-2 transition-all text-left',
                  isActive
                    ? 'bg-dark-700 border-primary-500'
                    : `bg-dark-800 ${presetColors[preset.type]}`,
                  disabled && 'opacity-50 cursor-not-allowed'
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="w-4 h-4" />
                  <span className="font-medium text-sm">{preset.label}</span>
                </div>
                <p className="text-xs text-dark-400">{preset.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Inputs de preço */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-dark-300 mb-1">
            Preço Mínimo
          </label>
          <input
            type="text"
            value={lowerInput}
            onChange={(e) => handleInputChange('lower', e.target.value)}
            onBlur={() => handleInputBlur('lower')}
            onKeyDown={(e) => e.key === 'Enter' && handleInputBlur('lower')}
            disabled={disabled}
            className="input"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-dark-300 mb-1">
            Preço Máximo
          </label>
          <input
            type="text"
            value={upperInput}
            onChange={(e) => handleInputChange('upper', e.target.value)}
            onBlur={() => handleInputBlur('upper')}
            onKeyDown={(e) => e.key === 'Enter' && handleInputBlur('upper')}
            disabled={disabled}
            className="input"
          />
        </div>
      </div>

      {/* Botão centralizar */}
      <button
        onClick={() => {
          const halfWidth = (rangeUpper - rangeLower) / 2;
          onRangeChange(currentPrice - halfWidth, currentPrice + halfWidth);
        }}
        disabled={disabled}
        className="btn btn-secondary w-full flex items-center justify-center gap-2"
      >
        <Crosshair className="w-4 h-4" />
        Centralizar no Preço Atual
      </button>

      {/* Info do range */}
      <div className="bg-dark-800 rounded-lg p-3 text-sm">
        <div className="flex justify-between mb-1">
          <span className="text-dark-400">Largura do Range:</span>
          <span className="font-medium">±{(rangeWidth / 2).toFixed(1)}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-dark-400">Preço Atual:</span>
          <span className="font-medium">{currentPrice.toPrecision(6)}</span>
        </div>
      </div>
    </div>
  );
}
