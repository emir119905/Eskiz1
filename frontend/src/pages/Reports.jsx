import { useMemo, useState } from 'react'

const BLUE = '#3b82f6'
const GREEN = '#10b981'
const YELLOW = '#f59e0b'
const RED = '#ef4444'
const PURPLE = '#8b5cf6'
const GRAY = '#6b7280'

const PROJECT_NAME = 'Pusula AI'
const CURRENT_VERSION = 'v11.3'
const NEXT_VERSION = 'v12 Directional Engine'

export default function Reports() {
  const [message, setMessage] = useState('')

  const reportText = useMemo(() => buildReportText(), [])
  const presentationText = useMemo(() => buildPresentationText(), [])

  async function copyText(text, successMessage) {
    try {
      await navigator.clipboard.writeText(text)
      setMessage(successMessage)
    } catch {
      setMessage('❌ Metin panoya kopyalanamadı.')
    }
  }

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
      <Header />

      {message && (
        <div style={{
          background: '#111827',
          border: '1px solid #1f2937',
          borderRadius: '14px',
          padding: '13px 16px',
          marginBottom: '20px',
          color: '#d1d5db',
          boxShadow: '0 14px 32px rgba(0,0,0,0.18)'
        }}>
          {message}
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(160px, 1fr))',
        gap: '14px',
        marginBottom: '22px'
      }}>
        <StatCard
          label="Proje Adı"
          value={PROJECT_NAME}
          color={BLUE}
          icon="🧭"
        />

        <StatCard
          label="Stabil Sürüm"
          value={CURRENT_VERSION}
          color={GREEN}
          icon="✅"
        />

        <StatCard
          label="Sonraki Hedef"
          value="v12"
          color={PURPLE}
          icon="🧪"
        />

        <StatCard
          label="Kapsam"
          value="39 varlık"
          color={YELLOW}
          icon="📦"
        />
      </div>

      <Panel>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '16px',
          alignItems: 'flex-start',
          flexWrap: 'wrap'
        }}>
          <div>
            <div style={{ color: '#6b7280', fontSize: '12px', marginBottom: 4 }}>
              Teslim Paketi
            </div>

            <h3 style={{ margin: 0, letterSpacing: '-0.4px' }}>
              Proje Rapor Merkezi
            </h3>

            <p style={{
              color: '#9ca3af',
              fontSize: '13px',
              marginTop: '8px',
              maxWidth: 760,
              lineHeight: 1.6
            }}>
              Bu sayfa proje raporu, sunum konuşması, teknik mimari özeti ve gelecek çalışma planı için hazırlandı.
              Rapor/sunum hazırlığında buradaki metinler doğrudan kullanılabilir veya düzenlenebilir.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={() => copyText(reportText, '✅ Rapor metni panoya kopyalandı.')}
              style={primaryButton}
            >
              📄 Rapor Metnini Kopyala
            </button>

            <button
              onClick={() => copyText(presentationText, '✅ Sunum konuşma metni panoya kopyalandı.')}
              style={secondaryButton}
            >
              🎤 Sunum Metnini Kopyala
            </button>
          </div>
        </div>
      </Panel>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.05fr 0.95fr',
        gap: '22px',
        alignItems: 'start'
      }}>
        <div>
          <ReportSection
            eyebrow="01"
            title="Proje Özeti"
            accent={BLUE}
          >
            <p style={p}>
              <strong>{PROJECT_NAME}</strong>, BIST ve yabancı hisse verileri üzerinde çalışan,
              derin öğrenme destekli bir finansal analiz ve karar destek platformudur. Proje, kullanıcıya doğrudan
              al/sat tavsiyesi vermek yerine, model çıktısını ölçülebilir metriklerle birlikte sunar.
            </p>

            <p style={p}>
              Sistem günlük fiyat verileri, hacim, teknik göstergeler ve dış piyasa değişkenlerini kullanarak
              çok ufuklu senaryo üretir. Ana hedef, finansal zaman serilerinde sık görülen “düz çizgi / mean reversion”
              problemini ölçmek, görünür kılmak ve sonraki sürümlerde daha güçlü yön tahmini mekanizmaları geliştirmektir.
            </p>
          </ReportSection>

          <ReportSection
            eyebrow="02"
            title="Veri Seti ve Kapsam"
            accent={GREEN}
          >
            <p style={p}>
              Projede kullanılan ana veri tabanı; hisse bilgileri, tarihsel fiyat verileri, kullanıcı portföyü,
              işlemler ve dış piyasa verilerinden oluşur. Tarihsel veri tarafında günlük açılış fiyatı, kapanış fiyatı
              ve hacim bilgisi kullanılmaktadır.
            </p>

            <DataTable
              rows={[
                ['Stocks', 'StockID, Symbol, CompanyName, Sector'],
                ['HistoricalData', 'Date, OpenPrice, ClosePrice, Volume'],
                ['ExternalData', 'USDTRY, BIST100, Gold, BrentOil'],
                ['Transactions', 'Kullanıcı al/sat işlemleri'],
                ['Users', 'Kullanıcı ve bakiye bilgileri']
              ]}
            />

            <p style={p}>
              Mevcut veri yapısında saatlik veri bulunmamaktadır. Bu nedenle kısa vadeli intraday yön motoru,
              proje sonrası geliştirme hedefi olarak v12 planına alınmıştır.
            </p>
          </ReportSection>

          <ReportSection
            eyebrow="03"
            title="Model Mimarisi"
            accent={PURPLE}
          >
            <p style={p}>
              Güncel motor, geçmiş fiyat davranışını doğrudan günlük fiyat çizgisi olarak üretmek yerine,
              çok ufuklu hedefler üzerinden değerlendirir. Model; 5, 10, 20 ve 30 günlük ufuklarda getiri tahmini,
              belirsizlik bandı ve yön davranışı çıktıları üretir.
            </p>

            <ArchitectureGrid />

            <p style={p}>
              Bu yapı, önceki sürümlerde yaşanan rolling forecast feedback loop ve quantile megaphone etkisini azaltmak
              için tercih edilmiştir. Mevcut sürümde amaç yalnızca tahmin çizgisi üretmek değil, aynı zamanda modelin
              naive baseline karşısındaki gerçek katkısını ölçmektir.
            </p>
          </ReportSection>

          <ReportSection
            eyebrow="04"
            title="Sürüm Gelişimi"
            accent={YELLOW}
          >
            <Timeline />
          </ReportSection>
        </div>

        <div>
          <Panel>
            <div style={{ color: '#6b7280', fontSize: '12px', marginBottom: 4 }}>
              Mevcut Durum
            </div>

            <h3 style={{ margin: 0, letterSpacing: '-0.4px', marginBottom: '16px' }}>
              {CURRENT_VERSION} Değerlendirmesi
            </h3>

            <StatusItem
              label="Güçlü Taraf"
              color={GREEN}
              text="Frontend, veri yönetimi, portföy simülasyonu, dashboard ve batch test laboratuvarı stabil çalışıyor."
            />

            <StatusItem
              label="Ölçüm Kazanımı"
              color={BLUE}
              text="Backtest gerçek tarihli horizon hizalamasıyla okunuyor; naive baseline karşılaştırması görünür durumda."
            />

            <StatusItem
              label="Açık Problem"
              color={YELLOW}
              text="Yön tahmini hâlâ her hissede tatmin edici değil. Bazı örneklerde model flat davranışına kaçabiliyor."
            />

            <StatusItem
              label="Karar"
              color={PURPLE}
              text="v11.3 stabil demo ve ölçüm altyapısıdır; nihai alfa motoru değildir."
            />
          </Panel>

          <Panel>
            <div style={{ color: '#6b7280', fontSize: '12px', marginBottom: 4 }}>
              Metrik Mantığı
            </div>

            <h3 style={{ margin: 0, letterSpacing: '-0.4px', marginBottom: '16px' }}>
              Model Nasıl Okunmalı?
            </h3>

            <MetricExplanation
              title="MAPE / RMSE"
              text="Fiyat tahmin hatasını ölçer. Ancak finansal serilerde tek başına yeterli değildir."
              color={BLUE}
            />

            <MetricExplanation
              title="Direction Score"
              text="Modelin hareket yönünü ne kadar doğru yakaladığını gösterir. Projenin en kritik geliştirme alanıdır."
              color={GREEN}
            />

            <MetricExplanation
              title="Action Rate"
              text="Modelin up/down aksiyon üretme oranını gösterir. Sıfıra yaklaşması flat collapse belirtisidir."
              color={YELLOW}
            />

            <MetricExplanation
              title="Naive Baseline"
              text="Modelin basit 'fiyat değişmez' varsayımına karşı gerçek katkısını ölçmek için kullanılır."
              color={PURPLE}
            />
          </Panel>

          <Panel>
            <div style={{ color: '#6b7280', fontSize: '12px', marginBottom: 4 }}>
              Yol Haritası
            </div>

            <h3 style={{ margin: 0, letterSpacing: '-0.4px', marginBottom: '16px' }}>
              {NEXT_VERSION}
            </h3>

            <RoadmapItem
              number="1"
              title="Regresyon ve yön tahminini ayır"
              text="Fiyat/getiri tahmini ayrı, up/flat/down classification head ayrı çalışmalı."
            />

            <RoadmapItem
              number="2"
              title="Flat kaçışını cezalandır"
              text="Gerçek hareket anlamlıyken modelin sürekli flat demesi özel loss ile engellenmeli."
            />

            <RoadmapItem
              number="3"
              title="Saatlik veri tablosu ekle"
              text="IntradayHistoricalData ile kısa vadeli davranış sinyali üretilecek."
            />

            <RoadmapItem
              number="4"
              title="Multi-timeframe fusion"
              text="Saatlik yön sinyali, günlük multi-horizon modele yardımcı feature olarak bağlanacak."
            />
          </Panel>
        </div>
      </div>

      <Panel>
        <div style={{ color: '#6b7280', fontSize: '12px', marginBottom: 4 }}>
          Rapor Metni Önizleme
        </div>

        <h3 style={{ margin: 0, letterSpacing: '-0.4px', marginBottom: '14px' }}>
          Kopyalanabilir Teknik Özet
        </h3>

        <pre style={{
          whiteSpace: 'pre-wrap',
          color: '#d1d5db',
          background: '#0b1220',
          border: '1px solid #1f2937',
          borderRadius: '16px',
          padding: '16px',
          lineHeight: 1.6,
          fontSize: '13px',
          maxHeight: '360px',
          overflowY: 'auto'
        }}>
          {reportText}
        </pre>
      </Panel>
    </div>
  )
}

function Header() {
  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        color: '#6b7280',
        fontSize: '13px',
        marginBottom: '8px'
      }}>
        <span style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: GREEN,
          boxShadow: `0 0 18px ${GREEN}`
        }} />
        Pusula AI · Raporlar
      </div>

      <h2 style={{
        margin: 0,
        letterSpacing: '-0.8px',
        fontSize: '31px'
      }}>
        📄 Raporlar
      </h2>

      <p style={{
        color: '#9ca3af',
        marginTop: '9px',
        maxWidth: '860px',
        lineHeight: 1.6
      }}>
        Proje anlatımı, teknik özet, model gelişimi ve gelecek çalışma planı için hazırlanmış rapor merkezi.
      </p>
    </div>
  )
}

function StatCard({ label, value, color, icon }) {
  return (
    <div style={{
      background: 'linear-gradient(180deg, #111827 0%, #0b1220 100%)',
      border: '1px solid #1f2937',
      borderRadius: '18px',
      padding: '16px',
      minHeight: '92px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <div style={{
        position: 'absolute',
        right: 12,
        top: 12,
        fontSize: 20,
        opacity: 0.55
      }}>
        {icon}
      </div>

      <div style={{ color: '#6b7280', fontSize: '12px', marginBottom: '8px' }}>
        {label}
      </div>

      <div style={{
        color,
        fontWeight: 'bold',
        fontSize: '24px',
        letterSpacing: '-0.4px'
      }}>
        {value}
      </div>
    </div>
  )
}

function Panel({ children }) {
  return (
    <div style={{
      background: 'linear-gradient(180deg, #111827 0%, #0f172a 100%)',
      border: '1px solid #1f2937',
      borderRadius: '20px',
      padding: '22px',
      marginBottom: '22px',
      boxShadow: '0 18px 40px rgba(0,0,0,0.22)'
    }}>
      {children}
    </div>
  )
}

function ReportSection({ eyebrow, title, accent, children }) {
  return (
    <Panel>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        marginBottom: '12px'
      }}>
        <span style={{
          display: 'inline-flex',
          width: 32,
          height: 32,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '12px',
          color: accent,
          background: `${accent}18`,
          border: `1px solid ${accent}44`,
          fontWeight: 'bold',
          fontSize: '13px'
        }}>
          {eyebrow}
        </span>

        <h3 style={{ margin: 0, letterSpacing: '-0.4px' }}>
          {title}
        </h3>
      </div>

      {children}
    </Panel>
  )
}

function DataTable({ rows }) {
  return (
    <div style={{
      overflowX: 'auto',
      margin: '14px 0'
    }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '13px'
      }}>
        <tbody>
          {rows.map(([name, desc]) => (
            <tr key={name} style={{ borderBottom: '1px solid #1f2937' }}>
              <td style={{
                padding: '10px 12px',
                color: '#93c5fd',
                fontWeight: 'bold',
                whiteSpace: 'nowrap'
              }}>
                {name}
              </td>
              <td style={{
                padding: '10px 12px',
                color: '#d1d5db'
              }}>
                {desc}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ArchitectureGrid() {
  const items = [
    {
      title: 'Frontend',
      text: 'React tabanlı dashboard, portföy, admin, model lab ve rapor ekranları.'
    },
    {
      title: '.NET API',
      text: 'Hisse, portföy, işlem ve tarihsel veri yönetimi.'
    },
    {
      title: 'Python AI API',
      text: 'LSTM tabanlı çok ufuklu tahmin motoru ve model metrikleri.'
    },
    {
      title: 'SQL Server',
      text: 'Hisse, fiyat, dış veri, kullanıcı ve işlem kayıtları.'
    }
  ]

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))',
      gap: '12px',
      margin: '15px 0'
    }}>
      {items.map(item => (
        <div
          key={item.title}
          style={{
            background: '#0b1220',
            border: '1px solid #1f2937',
            borderRadius: '16px',
            padding: '14px'
          }}
        >
          <div style={{
            color: '#93c5fd',
            fontWeight: 'bold',
            marginBottom: '7px'
          }}>
            {item.title}
          </div>
          <div style={{
            color: '#9ca3af',
            fontSize: '13px',
            lineHeight: 1.55
          }}>
            {item.text}
          </div>
        </div>
      ))}
    </div>
  )
}

function Timeline() {
  const items = [
    {
      version: 'Faz 1',
      title: 'Return tahmini',
      text: 'Mutlak fiyat yerine yüzdesel getiri tahminiyle ölçek problemi azaltıldı.',
      color: GREEN
    },
    {
      version: 'Faz 2',
      title: 'Directional loss',
      text: 'Yanlış yöne tahminleri cezalandırarak modelin hareket yakalaması sağlandı.',
      color: GREEN
    },
    {
      version: 'Faz 3',
      title: 'Quantile + balanced sampling',
      text: 'Veri kırpma ve quantile bant genişlemesi nedeniyle başarısız sonuçlar alındı.',
      color: RED
    },
    {
      version: 'Faz 4',
      title: 'Rolling forecast',
      text: 'Modelin kendi tahminini kendine yedirmesi feedback loop ve düz çizgi davranışı üretti.',
      color: RED
    },
    {
      version: CURRENT_VERSION,
      title: 'Direct multi-horizon',
      text: 'Günlük rolling yerine doğrudan çok ufuklu getiri hedefleri ve ölçülebilir backtest yapısı kuruldu.',
      color: BLUE
    },
    {
      version: NEXT_VERSION,
      title: 'Directional engine',
      text: 'Regresyon ve yön sınıflandırmasını ayıran yeni motor hedeflenmektedir.',
      color: PURPLE
    }
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {items.map(item => (
        <div
          key={`${item.version}-${item.title}`}
          style={{
            display: 'grid',
            gridTemplateColumns: '110px 1fr',
            gap: '12px',
            background: '#0b1220',
            border: '1px solid #1f2937',
            borderRadius: '16px',
            padding: '14px'
          }}
        >
          <div>
            <span style={{
              color: item.color,
              background: `${item.color}18`,
              border: `1px solid ${item.color}44`,
              borderRadius: '999px',
              padding: '5px 8px',
              fontSize: '11px',
              fontWeight: 'bold'
            }}>
              {item.version}
            </span>
          </div>

          <div>
            <div style={{
              color: '#e5e7eb',
              fontWeight: 'bold',
              marginBottom: '5px'
            }}>
              {item.title}
            </div>
            <div style={{
              color: '#9ca3af',
              fontSize: '13px',
              lineHeight: 1.55
            }}>
              {item.text}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function StatusItem({ label, text, color }) {
  return (
    <div style={{
      background: '#0b1220',
      border: '1px solid #1f2937',
      borderRadius: '16px',
      padding: '14px',
      marginBottom: '12px'
    }}>
      <div style={{
        color,
        fontWeight: 'bold',
        fontSize: '13px',
        marginBottom: '6px'
      }}>
        {label}
      </div>

      <div style={{
        color: '#d1d5db',
        fontSize: '13px',
        lineHeight: 1.55
      }}>
        {text}
      </div>
    </div>
  )
}

function MetricExplanation({ title, text, color }) {
  return (
    <div style={{
      display: 'flex',
      gap: '10px',
      marginBottom: '13px'
    }}>
      <span style={{
        width: 9,
        height: 9,
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 12px ${color}`,
        marginTop: 6,
        flexShrink: 0
      }} />

      <div>
        <div style={{
          color: '#e5e7eb',
          fontWeight: 'bold',
          fontSize: '13px',
          marginBottom: '3px'
        }}>
          {title}
        </div>

        <div style={{
          color: '#9ca3af',
          fontSize: '13px',
          lineHeight: 1.5
        }}>
          {text}
        </div>
      </div>
    </div>
  )
}

function RoadmapItem({ number, title, text }) {
  return (
    <div style={{
      display: 'flex',
      gap: '12px',
      marginBottom: '14px'
    }}>
      <span style={{
        width: 30,
        height: 30,
        borderRadius: '11px',
        background: '#7c3aed22',
        border: '1px solid #8b5cf655',
        color: '#c4b5fd',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 'bold',
        flexShrink: 0
      }}>
        {number}
      </span>

      <div>
        <div style={{
          color: '#e5e7eb',
          fontWeight: 'bold',
          marginBottom: '4px'
        }}>
          {title}
        </div>

        <div style={{
          color: '#9ca3af',
          fontSize: '13px',
          lineHeight: 1.5
        }}>
          {text}
        </div>
      </div>
    </div>
  )
}

function buildReportText() {
  return `PUSULA AI PROJE RAPORU

1. Proje Özeti
Pusula AI, BIST ve yabancı hisse verileri üzerinde çalışan yapay zeka destekli bir finansal analiz ve karar destek platformudur. Proje, kullanıcıya doğrudan yatırım tavsiyesi vermek yerine, model çıktısını ölçülebilir metrikler ve senaryo grafikleriyle birlikte sunmayı hedefler.

2. Veri Seti
Sistem SQL Server üzerinde saklanan günlük hisse verileriyle çalışır. HistoricalData tablosunda Date, OpenPrice, ClosePrice ve Volume alanları bulunur. ExternalData tablosunda USDTRY, BIST100, Gold ve BrentOil gibi dış piyasa değişkenleri yer alır. Mevcut veri yapısında saatlik veri bulunmadığından intraday modelleme gelecek çalışma olarak planlanmıştır.

3. Mimari
Uygulama üç ana parçadan oluşur:
- React frontend: Dashboard, portföy, veri yönetimi, model laboratuvarı ve rapor sayfaları.
- .NET API: Hisse, portföy, işlem ve tarihsel veri yönetimi.
- Python AI API: LSTM tabanlı çok ufuklu analiz motoru.

4. Model Gelişimi
İlk sürümlerde doğrudan fiyat tahmini denenmiş, daha sonra fiyat yerine yüzdesel getiri tahminine geçilmiştir. Directional loss yaklaşımı modelin yön davranışını iyileştirmiştir. Quantile loss ve balanced sampling denemeleri veri kaybı ve bant genişlemesi nedeniyle başarısız sonuçlar üretmiştir. Rolling forecast denemesinde model kendi tahminini tekrar input olarak kullandığı için feedback loop ve düz çizgi problemi görülmüştür. Güncel sürüm olan v11.3, direct multi-horizon yaklaşımıyla 5, 10, 20 ve 30 günlük hedefleri doğrudan tahmin eder.

5. Ölçüm Sistemi
Model yalnızca tahmin çizgisiyle değil, naive baseline karşılaştırmasıyla değerlendirilir. MAPE ve RMSE fiyat hatasını ölçer. Direction Score yön başarısını gösterir. Action Rate modelin ne kadar up/down sinyali ürettiğini takip eder. Bu metrikler flat collapse ve mean reversion davranışını görünür hale getirir.

6. Mevcut Durum
v11.3 sürümü frontend, veri yönetimi, portföy simülasyonu, dashboard ve batch test laboratuvarı açısından stabil bir demo altyapısı sağlar. Ancak yön tahmini problemi tamamen çözülmüş değildir. Bu nedenle v11.3 nihai alfa motoru değil, stabil ürün ve ölçüm altyapısı olarak konumlandırılmıştır.

7. Gelecek Çalışmalar
v12 Directional Engine kapsamında regresyon ve yön tahmini ayrılacaktır. Up/flat/down classification head kurulacak, sürekli flat tahmin yapan modele özel ceza uygulanacak ve saatlik veri eklenerek multi-timeframe yön sinyali geliştirilecektir.

8. Sonuç
Pusula AI, finansal zaman serilerindeki gürültü, mean reversion ve yön tahmini zorluklarını görünür kılan; kullanıcıya model çıktısını metriklerle birlikte sunan bir karar destek platformudur. Proje, mevcut haliyle stabil demo seviyesine ulaşmış ve v12 için açık araştırma hedefleri belirlemiştir.

Not: Sistem yatırım tavsiyesi değildir. Akademik ve deneysel amaçlı geliştirilmiştir.`
}

function buildPresentationText() {
  return `Merhaba, projemin adı Pusula AI.

Bu proje, BIST ve yabancı hisse verileri üzerinde çalışan yapay zeka destekli bir finansal analiz ve karar destek platformudur. Amacım kullanıcıya doğrudan yatırım tavsiyesi vermek değil, modelin ürettiği senaryoları ölçülebilir metriklerle birlikte sunmaktır.

Proje üç ana parçadan oluşuyor. Frontend tarafında React kullanıyorum. Hisse analizi, portföy simülasyonu, veri yönetimi, model laboratuvarı ve rapor ekranları bulunuyor. Backend tarafında .NET API hisse, portföy ve veri yönetimini sağlıyor. Python AI API ise LSTM tabanlı tahmin motorunu çalıştırıyor.

Model geliştirme sürecinde birkaç farklı yaklaşım denedim. İlk başta doğrudan fiyat tahmini yaptım, fakat bu yaklaşım ölçek problemleri oluşturdu. Sonra fiyat yerine getiri tahminine geçtim. Directional loss ile modelin yön davranışını iyileştirmeye çalıştım. Quantile loss ve rolling forecast denemelerinde ise düz çizgi, yani mean reversion problemiyle karşılaştım.

Güncel sürüm olan v11.3, direct multi-horizon yaklaşımını kullanıyor. Model 5, 10, 20 ve 30 günlük hedefleri doğrudan tahmin ediyor. Ayrıca model çıktısı naive baseline ile karşılaştırılıyor. Böylece modelin gerçekten değer katıp katmadığını MAPE, RMSE, direction score ve action rate gibi metriklerle görebiliyorum.

Projenin önemli noktalarından biri, sadece başarılı tahminleri göstermek değil, modelin nerede başarısız olduğunu da görünür hale getirmek. Model Laboratuvarı sayfasında birden fazla hisseyi toplu test ederek flat collapse, düşük direction score veya naive baseline altında kalma gibi durumları analiz edebiliyorum.

Mevcut sürüm stabil bir demo ve ölçüm altyapısı sağlıyor. Ancak yön tahmini problemi tamamen çözülmüş değil. Bu nedenle sonraki hedefim v12 Directional Engine. Bu sürümde regresyon ve yön tahminini ayırmayı, up-flat-down classification head kurmayı ve mümkünse saatlik veriyle multi-timeframe yön sinyali üretmeyi planlıyorum.

Özetle Pusula AI, finansal zaman serilerindeki gürültü ve düz çizgi problemini merkeze alan, model çıktısını şeffaf metriklerle sunan bir karar destek platformudur.

Teşekkür ederim.`
}

const p = {
  color: '#d1d5db',
  fontSize: '14px',
  lineHeight: 1.7,
  margin: '0 0 12px'
}

const primaryButton = {
  padding: '12px 18px',
  color: '#fff',
  border: 'none',
  borderRadius: '13px',
  fontWeight: 'bold',
  fontSize: '14px',
  background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
  boxShadow: '0 14px 28px rgba(37,99,235,0.24)',
  cursor: 'pointer'
}

const secondaryButton = {
  padding: '12px 16px',
  color: '#d1d5db',
  border: '1px solid #1f2937',
  borderRadius: '13px',
  fontWeight: 'bold',
  fontSize: '14px',
  background: '#0b1220',
  cursor: 'pointer'
}