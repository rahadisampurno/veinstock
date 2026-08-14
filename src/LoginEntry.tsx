import { useEffect, useState, type FormEvent } from "react";
import "./login-entry.css";

const sessionKey = "veinstock_saved_session";

export default function LoginEntry({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [mode, setMode] = useState<"login" | "forgot" | "verify">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const slides = [
    ["/menengs-landing-1.webp", "Panduan stok rapi Menengs"],
    ["/menengs-landing-2.webp", "SOP operasional harian Menengs"],
    ["/menengs-landing-3.webp", "Sinkronisasi stok semua outlet Menengs"],
  ];

  useEffect(() => {
    const timer = window.setInterval(() => setActiveSlide(current => (current + 1) % slides.length), 6000);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, remember }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "Email atau password tidak sesuai");
      const session = JSON.stringify({ user: result.user, token: result.token, remember });
      sessionStorage.setItem(sessionKey, session);
      if (remember) localStorage.setItem(sessionKey, session); else localStorage.removeItem(sessionKey);
      onAuthenticated();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Login gagal"); }
    finally { setLoading(false); }
  };

  const requestOtp = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "Kode OTP tidak dapat dikirim");
      setMode("verify");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Kode OTP tidak dapat dikirim"); }
    finally { setLoading(false); }
  };

  const resetPassword = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (newPassword !== confirmPassword) return setError("Konfirmasi password tidak cocok");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, otp, newPassword }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "Password tidak dapat direset");
      setSuccess("Password berhasil direset. Silakan masuk menggunakan password baru.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Password tidak dapat direset"); }
    finally { setLoading(false); }
  };

  return <main className="entry-page">
    <aside className="entry-art" aria-label="Informasi operasional Menengs">
      <div className="entry-stage">
        {slides.map(([src, alt], index) => <img key={src} className={index === activeSlide ? "active" : ""} src={src} alt={alt} width="1400" height="986" fetchPriority={index === 0 ? "high" : "auto"} loading={index === 0 ? "eager" : "lazy"} decoding="async" />)}
        <div className="entry-dots" role="tablist" aria-label="Pilih informasi Menengs">{slides.map(([, alt], index) => <button key={alt} type="button" className={index === activeSlide ? "active" : ""} onClick={() => setActiveSlide(index)} role="tab" aria-selected={index === activeSlide} aria-label={`Tampilan ${index + 1}: ${alt}`} />)}</div>
      </div>
    </aside>
    <section className="entry-panel">
      {success ? <div className="entry-box"><small>BERHASIL</small><h1>Password berhasil direset</h1><p>{success}</p><button className="entry-primary" onClick={() => { setMode("login"); setSuccess(""); setPassword(""); }}>Masuk Sekarang</button></div>
      : <form className="entry-box" onSubmit={mode === "login" ? submitLogin : mode === "forgot" ? requestOtp : resetPassword}>
        {mode !== "login" && <button type="button" className="entry-link back" onClick={() => { setMode("login"); setError(""); }}>← Kembali ke Login</button>}
        <small>{mode === "login" ? "SELAMAT DATANG, TIM MENENGS" : "LUPA PASSWORD"}</small>
        <h1>{mode === "login" ? "Masuk ke Menengs" : mode === "forgot" ? "Reset Password" : "Masukkan Kode OTP"}</h1>
        <p>{mode === "login" ? "Gunakan akun operasional yang diberikan oleh Owner Menengs." : mode === "forgot" ? "Masukkan email akun Anda. Kode OTP 6 angka akan dikirim melalui email." : `Kode OTP telah dikirim ke ${email} dan berlaku selama 15 menit.`}</p>
        {(mode === "login" || mode === "forgot") && <label>Alamat email<input type="email" required autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} /></label>}
        {mode === "login" && <label>Password<span className="entry-password"><input type={showPassword ? "text" : "password"} required minLength={8} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}>{showPassword ? "Sembunyikan" : "Lihat"}</button></span></label>}
        {mode === "verify" && <><label>Kode OTP<input className="entry-otp" required inputMode="numeric" maxLength={6} value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} /></label><label>Password baru<input type="password" required minLength={8} autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} /></label><label>Konfirmasi password<input type="password" required minLength={8} autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></label></>}
        {mode === "login" && <div className="entry-options"><label className="remember"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} /> Ingat akun di perangkat ini</label><button type="button" className="entry-link" onClick={() => { setMode("forgot"); setError(""); }}>Lupa password?</button></div>}
        {error && <div className="entry-error" role="alert">{error}</div>}
        <button className="entry-primary" disabled={loading}>{loading ? "Memproses..." : mode === "login" ? "Masuk ke Dashboard" : mode === "forgot" ? "Kirim Kode OTP" : "Reset Password"}</button>
        {mode === "login" && <div className="entry-secure">🔒 Stok, penjualan, dan aktivitas tim Menengs tercatat dengan aman.</div>}
      </form>}
    </section>
  </main>;
}
