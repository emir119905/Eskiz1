const TRY_SYMBOL_EXCEPTIONS = new Set([
  'KOZAY',
  'KOZAL',
  'KOZAA'
])

export function getSymbol(asset) {
  if (!asset) return ''
  if (typeof asset === 'string') return asset.toUpperCase()
  return String(asset.symbol || asset.ticker || '').toUpperCase()
}

export function getCurrencySymbol(asset) {
  const symbol = getSymbol(asset)

  const rawCurrency = typeof asset === 'object'
    ? String(asset.currency || asset.currencyCode || asset.currencySymbol || '').toUpperCase()
    : ''

  const rawMarket = typeof asset === 'object'
    ? String(asset.market || asset.exchange || asset.borsa || '').toUpperCase()
    : ''

  if (['TRY', 'TL', '₺'].includes(rawCurrency)) return '₺'
  if (['USD', '$'].includes(rawCurrency)) return '$'

  if (['BIST', 'XIST', 'BORSA ISTANBUL', 'BORSA İSTANBUL', 'ISTANBUL'].includes(rawMarket)) {
    return '₺'
  }

  if (symbol.endsWith('.IS')) return '₺'
  if (TRY_SYMBOL_EXCEPTIONS.has(symbol)) return '₺'

  return '$'
}

export function pct(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return '-'
  return `${Number(value).toFixed(digits)}%`
}

export function num(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return '-'

  return Number(value).toLocaleString('tr-TR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })
}

export function money(value, asset) {
  if (value == null || Number.isNaN(Number(value))) return '-'

  const currency = getCurrencySymbol(asset)

  return `${Number(value).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} ${currency}`
}

export function formatTooltipValue(value, mode, asset) {
  if (value == null || Number.isNaN(Number(value))) return '-'

  if (['percent', 'returns', 'return', 'error'].includes(mode)) {
    return pct(value, 2)
  }

  if (mode === 'normalized') {
    return `${num(value, 2)} endeks`
  }

  return money(value, asset)
}

export function getBiasLabel(tradeBias) {
  if (tradeBias === 'LONG_CANDIDATE') return 'Long Adayı'
  if (tradeBias === 'RISK_OFF_OR_SHORT_CANDIDATE') return 'Risk-Off / Korunma'
  return 'Düşük Güven / İşlem Yok'
}

export function getBiasColor(tradeBias) {
  if (tradeBias === 'LONG_CANDIDATE') return '#10b981'
  if (tradeBias === 'RISK_OFF_OR_SHORT_CANDIDATE') return '#ef4444'
  return '#f59e0b'
}