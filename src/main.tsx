import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

document.addEventListener('keydown', (e) => {
  const target = e.target as HTMLInputElement;
  if (target && target.tagName === 'INPUT' && target.type === 'number') {
    if (['e', 'E', '+', '-', '.'].includes(e.key)) {
      e.preventDefault();
    }
  }
});

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Detail hanya dicatat di console pengembang; jangan menampilkan pesan
    // internal atau data operasional kepada pengguna.
    console.error('Application render error', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f4fafc', color: '#102b3b', fontFamily: 'system-ui, sans-serif' }}>
        <section style={{ maxWidth: 460, padding: 32, textAlign: 'center', background: '#fff', border: '1px solid #d9eaf0', borderRadius: 20, boxShadow: '0 16px 40px rgba(7, 155, 195, .12)' }}>
          <p style={{ margin: 0, color: '#087fa9', fontWeight: 800, letterSpacing: '.08em', fontSize: 12 }}>MENENGS</p>
          <h1 style={{ margin: '10px 0', fontSize: 24 }}>Halaman perlu dimuat ulang</h1>
          <p style={{ margin: '0 0 22px', color: '#60798a', lineHeight: 1.6 }}>Terjadi gangguan pada tampilan. Data yang sudah tersimpan di server tetap aman.</p>
          <button type="button" onClick={() => window.location.reload()} style={{ border: 0, borderRadius: 10, padding: '12px 18px', background: '#079bc3', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>Muat ulang aplikasi</button>
        </section>
      </main>
    );
  }
}

window.addEventListener('error', (event) => {
  // Jangan menghapus seluruh DOM pada error handler/event. React dapat
  // mempertahankan layar terakhir dan ErrorBoundary menangani error render.
  console.error('Unhandled browser error', event.error);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary><App /></AppErrorBoundary>
  </StrictMode>,
)
