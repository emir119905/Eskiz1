
const BLUE = '#3b82f6'
const GREEN = '#10b981'
const YELLOW = '#f59e0b'
const PURPLE = '#8b5cf6'

const PROJECT_NAME = 'Pusula AI'
const CURRENT_VERSION = 'v11.3'
const NEXT_VERSION = 'v12 Directional Engine'

export default function Reports() {
  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
      <Header />

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
              Proje Brifingi
            </div>

            <h3 style={{ margin: 0, letterSpacing: '-0.4px' }}>
              Portföy Yönetimi ve Varlık Tahmin Sistemi
            </h3>

            <p style={{
              color: '#9ca3af',
              fontSize: '13px',
              marginTop: '8px',
              maxWidth: 760,
              lineHeight: 1.6
            }}>
              Bu sayfa; projenin amacını, veritabanı yapısını, uygulama mimarisini,
              veri yönetimi işlemlerini ve analiz modülünü özetleyen profesyonel bir brifing alanı olarak düzenlenmiştir.
            </p>
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
              <strong>{PROJECT_NAME}</strong>, hisse senedi verilerinin saklanması, portföy işlemlerinin yönetilmesi,
              tarihsel fiyat verilerinin izlenmesi ve yapay zekâ destekli analiz çıktılarının görüntülenmesi için
              geliştirilen çok katmanlı bir web uygulamasıdır.
            </p>

            <p style={p}>
              Proje, kullanıcıya doğrudan yatırım tavsiyesi vermek yerine; veritabanı üzerinde tutulan tarihsel verileri,
              portföy kayıtlarını ve model çıktılarıyla oluşan karar destek göstergelerini tek panelde sunar.
            </p>
          </ReportSection>

          <ReportSection
            eyebrow="02"
            title="Veritabanı Yapısı"
            accent={GREEN}
          >
            <p style={p}>
              Sistemde temel veri saklama katmanı SQL Server üzerinde tasarlanmıştır. Tablolar; kullanıcı bilgileri,
              hisse tanımları, tarihsel fiyat kayıtları, dış piyasa verileri ve portföy işlemleri üzerine kuruludur.
            </p>

            <DataTable
              rows={[
                ['Stocks', 'StockID, Symbol, CompanyName, Sector'],
                ['HistoricalData', 'DataID, StockID, Date, OpenPrice, HighPrice, LowPrice, ClosePrice, Volume'],
                ['ExternalData', 'USDTRY, BIST100, Gold, BrentOil'],
                ['Transactions', 'TransactionID, UserID, StockID, TransactionType, Quantity, PriceAtTransaction, TransactionDate'],
                ['Users', 'UserID, FirstName, LastName, Email, Balance, CreatedAt, PasswordHash']
              ]}
            />

            <p style={p}>
              HistoricalData tablosu OHLCV yapısına geçirilmiştir. Böylece yalnızca açılış ve kapanış fiyatları değil,
              gün içi en yüksek ve en düşük değerler de saklanarak ATR, mum gövdesi ve fitil oranı gibi ek analiz
              özelliklerinin hesaplanması mümkün hale gelmiştir.
            </p>
          </ReportSection>

          <ReportSection
            eyebrow="03"
            title="Model Mimarisi"
            accent={PURPLE}
          >
            <p style={p}>
              Uygulama; React tabanlı frontend, .NET tabanlı backend API, SQL Server veritabanı ve Python tabanlı
              analiz servisi olmak üzere dört ana parçadan oluşur.
            </p>

            <ArchitectureGrid />

            <p style={p}>
              Frontend kullanıcı arayüzünü sağlar. Backend API veritabanı işlemlerini ve iş kurallarını yönetir.
              Python AI API ise model analizi ve deneysel sinyal üretimi için ayrı servis olarak konumlandırılmıştır.
            </p>
          </ReportSection>

          <ReportSection
            eyebrow="04"
            title="Model ve Analiz Modülü"
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
              text="Frontend, veri yönetimi, portföy simülasyonu, dashboard ve batch test laboratuvarı stabil çalışmaktadır."
            />

            <StatusItem
              label="Veritabanı Kapsamı"
              color={BLUE}
              text="Hisse, tarihsel veri, kullanıcı, işlem ve dış piyasa tabloları uygulama içinde aktif kullanılmaktadır."
            />

            <StatusItem
              label="Açık Geliştirme Alanı"
              color={YELLOW}
              text="Yön tahmini ve işlem sinyali tarafı deneysel olarak değerlendirilmektedir. Model çıktıları yatırım tavsiyesi olarak konumlandırılmamıştır."
            />

            <StatusItem
              label="Konumlandırma"
              color={PURPLE}
              text="Mevcut sürüm, veritabanı yönetimi ve karar destek arayüzü bulunan stabil bir akademik proje demosudur."
            />
          </Panel>

          <Panel>
            <div style={{ color: '#6b7280', fontSize: '12px', marginBottom: 4 }}>
              Ana Modüller
            </div>

            <h3 style={{ margin: 0, letterSpacing: '-0.4px', marginBottom: '16px' }}>
              Uygulama Ekranları
            </h3>

            <ModuleItem
              title="Dashboard"
              text="Seçili hisse için model çıktıları, grafikler ve temel metrikler görüntülenir."
              color={BLUE}
            />

            <ModuleItem
              title="Portföy"
              text="Kullanıcı bakiyesi, sahip olunan hisseler, alım-satım işlemleri ve kâr/zarar durumu izlenir."
              color={GREEN}
            />

            <ModuleItem
              title="Model Lab"
              text="Birden fazla hisse için batch analiz, model kalite etiketi ve problem grupları takip edilir."
              color={PURPLE}
            />

            <ModuleItem
              title="Veri Yönetimi"
              text="Hisse ekleme, veri senkronizasyonu, veri sağlığı ve tarihsel kayıt silme işlemleri yapılır."
              color={YELLOW}
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
              title="Global Panel Screener"
              text="Tek tek hisse modellemek yerine BIST hisselerini ortak panel veri setiyle sıralama yaklaşımı test edilecektir."
            />

            <RoadmapItem
              number="2"
              title="Yön Motoru"
              text="Regresyon ve yön sınıflandırması birbirinden ayrılarak daha güvenilir sinyal üretimi hedeflenecektir."
            />

            <RoadmapItem
              number="3"
              title="Gelişmiş OHLCV Özellikleri"
              text="ATR, gövde oranı, fitil oranı ve endekse göre relatif güç gibi özellikler modele dahil edilecektir."
            />

            <RoadmapItem
              number="4"
              title="Raporlama Katmanı"
              text="Model sonuçları, veri sağlığı ve güçlü/zayıf adaylar daha dinamik raporlarla sunulacaktır."
            />
          </Panel>
        </div>
      </div>

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
        Pusula AI · Proje Brifingi
      </div>

      <h2 style={{
        margin: 0,
        letterSpacing: '-0.8px',
        fontSize: '31px'
      }}>
        📄 Proje Brifingi
      </h2>

      <p style={{
        color: '#9ca3af',
        marginTop: '9px',
        maxWidth: '860px',
        lineHeight: 1.6
      }}>
        Projenin teknik kapsamını, veritabanı yapısını, uygulama mimarisini ve analiz modüllerini özetleyen bölüm.
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
      text: 'React tabanlı dashboard, portföy, admin, model lab, izleme listesi ve brifing ekranları.'
    },
    {
      title: '.NET API',
      text: 'Hisse, portföy, işlem ve tarihsel veri yönetimi için REST endpointleri.'
    },
    {
      title: 'Python AI API',
      text: 'Tahmin motoru, davranış sinyali ve model laboratuvarı için analiz servisi.'
    },
    {
      title: 'SQL Server',
      text: 'Kullanıcı, hisse, işlem, dış veri ve OHLCV tarihsel fiyat kayıtları.'
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
      version: CURRENT_VERSION,
      title: 'Çok Ufuklu Tahmin',
      text: 'Model, 5, 10, 20 ve 30 günlük hedefleri doğrudan değerlendirir.',
      color: BLUE
    },
    {
      version: 'v12 Alpha',
      title: 'Davranış Sinyali',
      text: 'Momentum, oynaklık, hacim baskısı ve flat risk üzerinden deneysel davranış sinyali üretir.',
      color: PURPLE
    },
    {
      version: 'OHLCV',
      title: 'Gelişmiş Veri Zemini',
      text: 'HighPrice ve LowPrice alanlarıyla ATR, fitil oranı ve gün içi aralık özellikleri hesaplanabilir.',
      color: GREEN
    },
    {
      version: 'Zeta',
      title: 'Panel Screener',
      text: 'Gelecek aşamada BIST hisseleri ortak panel veri setiyle sıralama problemi olarak ele alınacaktır.',
      color: YELLOW
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

function ModuleItem({ title, text, color }) {
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


const p = {
  color: '#d1d5db',
  fontSize: '14px',
  lineHeight: 1.7,
  margin: '0 0 12px'
}

