function safeNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function getModelTone(signal) {
  const bias = String(signal?.tradeBias || '')

  if (bias === 'LONG_CANDIDATE') return 'positive'
  if (bias === 'RISK_OFF_OR_SHORT_CANDIDATE') return 'negative'
  return 'neutral'
}

export function getBehaviorTone(behaviorSignal) {
  const bias = behaviorSignal?.directionBias

  if (bias === 'up') return 'up'
  if (bias === 'down') return 'down'
  return 'neutral'
}

export function getZetaTone(zetaItem) {
  if (!zetaItem?.scenario) return 'unknown'

  switch (zetaItem.scenario) {
    case 'MOMENTUM_LONG':
      return 'momentum'
    case 'DIP_REBOUND_WATCH':
      return 'dip'
    case 'DOWNSIDE_RISK':
      return 'downside'
    case 'RISK_WATCH':
      return 'risk_watch'
    case 'NEUTRAL':
      return 'neutral'
    default:
      return 'unknown'
  }
}

const MODEL_LABELS = {
  positive: 'Pozitif senaryo',
  negative: 'Aşağı risk',
  neutral: 'Bekle-gör'
}

const BEHAVIOR_LABELS = {
  up: 'Yukarı eğilim',
  down: 'Aşağı baskı',
  neutral: 'Net yön yok'
}

const ZETA_LABELS = {
  momentum: 'Güçlü gidiş',
  dip: 'Toparlanma izleniyor',
  downside: 'Aşağı yönlü risk',
  risk_watch: 'Dikkatli izlenmeli',
  neutral: 'Net senaryo yok',
  unknown: 'Radar listesinde değil'
}

function countAlignment(modelTone, behaviorTone, zetaTone) {
  const tones = [modelTone, behaviorTone]

  if (zetaTone !== 'unknown') {
    tones.push(zetaTone)
  }

  const bullish = tones.filter(t =>
    t === 'positive' || t === 'up' || t === 'momentum' || t === 'dip'
  ).length

  const bearish = tones.filter(t =>
    t === 'negative' || t === 'down' || t === 'downside' || t === 'risk_watch'
  ).length

  const neutral = tones.filter(t =>
    t === 'neutral' || t === 'unknown'
  ).length

  if (bullish >= 2 && bearish === 0) {
    return 'aligned'
  }

  if (bearish >= 2 && bullish === 0) {
    return 'aligned'
  }

  if (bullish > 0 && bearish > 0) {
    return 'conflicting'
  }

  if (neutral === tones.length) {
    return 'mixed'
  }

  return 'mixed'
}

function computeOpportunityRisk(modelTone, behaviorTone, zetaTone, behaviorSignal) {
  let opportunity = 0
  let risk = 0

  if (modelTone === 'positive') opportunity += 2
  if (modelTone === 'negative') risk += 2

  if (behaviorTone === 'up') opportunity += 2
  if (behaviorTone === 'down') risk += 2

  if (zetaTone === 'momentum') opportunity += 3
  if (zetaTone === 'dip') opportunity += 1
  if (zetaTone === 'downside') risk += 3
  if (zetaTone === 'risk_watch') risk += 2

  if (safeNumber(behaviorSignal?.flatRisk) >= 75) risk += 1
  if (behaviorSignal?.actionable) opportunity += 1

  return { opportunity, risk }
}

function levelFromScore(score) {
  if (score >= 5) return 'Yüksek'
  if (score >= 2) return 'Orta'
  return 'Düşük'
}

function buildHeadline(modelTone, behaviorTone, zetaTone, alignment) {
  if (
    modelTone === 'positive' &&
    zetaTone === 'momentum' &&
    behaviorTone === 'up'
  ) {
    return 'Güçlü izlenebilir senaryo'
  }

  if (modelTone === 'positive' && zetaTone === 'risk_watch') {
    return 'Çelişkili sinyal, dikkatli yorumla'
  }

  if (
    (modelTone === 'neutral' || modelTone === 'negative') &&
    zetaTone === 'downside'
  ) {
    return 'Risk öne çıkıyor'
  }

  if (modelTone === 'neutral' && zetaTone === 'dip') {
    return 'İzleme adayı, henüz net sinyal değil'
  }

  if (
    modelTone === 'negative' &&
    behaviorTone === 'down' &&
    (zetaTone === 'downside' || zetaTone === 'risk_watch')
  ) {
    return 'Belirgin risk uyarısı'
  }

  if (modelTone === 'positive' && zetaTone === 'momentum' && behaviorTone !== 'up') {
    return 'Potansiyel var, davranış henüz tam desteklemiyor'
  }

  if (alignment === 'conflicting') {
    return 'Katmanlar birbiriyle çelişiyor'
  }

  if (
    modelTone === 'neutral' &&
    behaviorTone === 'neutral' &&
    (zetaTone === 'neutral' || zetaTone === 'unknown')
  ) {
    return 'Bekle-gör daha sağlıklı'
  }

  if (modelTone === 'positive' && behaviorTone === 'up') {
    return 'Olumlu senaryo izlenebilir'
  }

  if (modelTone === 'negative' || behaviorTone === 'down' || zetaTone === 'downside') {
    return 'Temkinli okuma gerekli'
  }

  return 'Karışık sinyal ortamı'
}

function buildSummary(modelTone, behaviorTone, zetaTone, headline, behaviorSignal) {
  const modelText = MODEL_LABELS[modelTone]
  const behaviorText = BEHAVIOR_LABELS[behaviorTone]
  const zetaText = ZETA_LABELS[zetaTone]

  const notes = []

  if (headline === 'Güçlü izlenebilir senaryo') {
    return {
      summary:
        'Ana model, son fiyat davranışı ve Zeta senaryosu aynı yönde konuşuyor. Bu hisse güçlü izlenebilir bir senaryo sunuyor; yine de tek başına yatırım kararı sayılmamalıdır.',
      notes: [
        'Üç katman birbirini destekliyor.',
        'Davranış katmanı yukarı eğilimi onaylıyor.'
      ]
    }
  }

  if (headline === 'Çelişkili sinyal, dikkatli yorumla') {
    return {
      summary:
        'Ana model olumlu görünse de Zeta bu hissede dikkatli izlenmesi gereken bir yapı işaret ediyor. Sonuçları birlikte okumak gerekir; aceleci yorum yapmayın.',
      notes: [
        'Model ile Zeta senaryosu aynı hizada değil.',
        'Risk uyarısı ile olumlu okuma bir arada.'
      ]
    }
  }

  if (headline === 'Risk öne çıkıyor') {
    return {
      summary:
        'Zeta aşağı yönlü risk senaryosunu öne çıkarıyor. Ana model zayıf veya temkinli kalıyorsa bu okuma birbirini destekler; temkinli yaklaşım daha sağlıklıdır.',
      notes: [
        'Aşağı risk senaryosu baskın.',
        'Olumlu senaryo desteği sınırlı.'
      ]
    }
  }

  if (headline === 'İzleme adayı, henüz net sinyal değil') {
    return {
      summary:
        'Zeta toparlanma ihtimalini izlenebilir buluyor; ancak ana model henüz net bir yön vermiyor. Bu hisse takip listesi adayı olabilir, güçlü sinyal sayılmamalıdır.',
      notes: [
        'Toparlanma senaryosu var, ana model nötr.',
        'Erken yorum yerine izleme daha uygun.'
      ]
    }
  }

  if (headline === 'Belirgin risk uyarısı') {
    return {
      summary:
        'Ana model, fiyat davranışı ve Zeta senaryosu risk tarafında birleşiyor. Bu okuma fırsattan çok temkin ve uzak durma sinyali olarak değerlendirilmelidir.',
      notes: [
        'Birden fazla katman risk uyarısı veriyor.',
        'Olumlu senaryo desteği zayıf.'
      ]
    }
  }

  if (headline === 'Bekle-gör daha sağlıklı') {
    return {
      summary:
        'Ana model, davranış katmanı ve Zeta senaryosu net bir yön oluşturmuyor. Bu durumda bekle-gör yaklaşımı daha tutarlı bir karar destek özeti sunar.',
      notes: [
        'Katmanlar nötr veya belirsiz.',
        'Net senaryo henüz oluşmamış.'
      ]
    }
  }

  notes.push(`Ana model: ${modelText}.`)
  notes.push(`Davranış: ${behaviorText}.`)
  notes.push(`Zeta: ${zetaText}.`)

  if (safeNumber(behaviorSignal?.flatRisk) >= 75) {
    notes.push('Net yön belirsizliği yüksek.')
  }

  return {
    summary:
      `Ana model ${modelText.toLowerCase()}, davranış katmanı ${behaviorText.toLowerCase()} ve Zeta ${zetaText.toLowerCase()} diyor. Bu üç okuma birlikte değerlendirildiğinde ${headline.toLowerCase()} sonucu oluşuyor.`,
    notes
  }
}

export function buildFusionSummary({
  signal,
  behaviorSignal,
  zetaItem,
  behaviorLoading = false,
  zetaLoading = false
}) {
  if (!signal) {
    return {
      ready: false,
      loading: false,
      headline: 'Karar özeti hazır değil',
      summary: 'Ana model sonucu olmadan birleşik okuma üretilemez.',
      alignment: 'mixed',
      alignmentLabel: 'Bekleniyor',
      opportunityLevel: '-',
      riskLevel: '-',
      notes: [],
      layers: null
    }
  }

  if (behaviorLoading || zetaLoading) {
    return {
      ready: false,
      loading: true,
      headline: 'Karar özeti hazırlanıyor',
      summary: 'Ana model, davranış sinyali ve Zeta senaryosu birlikte okunuyor.',
      alignment: 'mixed',
      alignmentLabel: 'Hesaplanıyor',
      opportunityLevel: '-',
      riskLevel: '-',
      notes: [],
      layers: null
    }
  }

  const modelTone = getModelTone(signal)
  const behaviorTone = behaviorSignal ? getBehaviorTone(behaviorSignal) : 'neutral'
  const zetaTone = getZetaTone(zetaItem)
  const alignment = countAlignment(modelTone, behaviorTone, zetaTone)
  const { opportunity, risk } = computeOpportunityRisk(
    modelTone,
    behaviorTone,
    zetaTone,
    behaviorSignal
  )

  const headline = buildHeadline(modelTone, behaviorTone, zetaTone, alignment)
  const { summary, notes } = buildSummary(
    modelTone,
    behaviorTone,
    zetaTone,
    headline,
    behaviorSignal
  )

  const alignmentLabel =
    alignment === 'aligned'
      ? 'Uyumlu'
      : alignment === 'conflicting'
        ? 'Çelişkili'
        : 'Karışık'

  return {
    ready: true,
    loading: false,
    headline,
    summary,
    alignment,
    alignmentLabel,
    opportunityLevel: levelFromScore(opportunity),
    riskLevel: levelFromScore(risk),
    notes,
    layers: {
      model: MODEL_LABELS[modelTone],
      behavior: behaviorSignal ? BEHAVIOR_LABELS[behaviorTone] : 'Henüz okunmadı',
      zeta: ZETA_LABELS[zetaTone]
    }
  }
}
