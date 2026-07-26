import { useEffect, useMemo, useRef, useState } from "react";
import { resolveUserScope, authorizeAction, type ActionType } from "./utils/rbac";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import {
  Archive,
  ArrowDownToLine,
  ArrowRightLeft,
  BarChart3,
  Bell,
  Boxes,
  Check,
  ClipboardCheck,
  Download,
  History,
  LayoutDashboard,
  KeyRound,
  Menu,
  PackagePlus,
  Plus,
  RotateCcw,
  Search,
  Settings,
  ShoppingCart,
  Store,
  Trash2,
  Users,
  Eye,
  EyeOff,
  Warehouse,
  X,
  LifeBuoy,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  TrendingUp
} from "lucide-react";
import { sections, popularArticles } from "./data/helpData";
import { downloadExcel } from "./utils/exportExcel";
import { downloadPDF } from "./utils/exportPdf";
import type {
  AppData,
  Channel,
  Product,
  SessionUser,
  StockUnit,
  Variant,
} from "./types";
import {
  adjustBalance,
  createEmptyData,
  getBalance,
  loadData,
  movement,
  newId,
  normalizeData,
  saveData,
  seedData,
} from "./store";
import "./App.css";

type Page =
  | "dashboard"
  | "products"
  | "locations"
  | "receipts"
  | "stock"
  | "transfers"
  | "sales"
  | "returns"
  | "opname"
  | "history"
  | "reports"
  | "business"
  | "users"
  | "help"
  | "analytics";
const money = (n?: number | null) => `Rp ${Math.round(n || 0).toLocaleString("id-ID")}`;
const qty = (n?: number | null, unit?: StockUnit) =>
  `${(n || 0).toLocaleString("id-ID")} ${unit === "pcs" ? "pcs" : unit || "unit"}`;
const isPositiveNumber = (value?: number | null) => typeof value === 'number' && Number.isFinite(value) && value > 0;
const minimumFor = (variant: Variant | undefined, locationId: string) =>
  variant?.minStockByLocation?.[locationId] ?? variant?.minStock ?? 0;
const savedSessionKey = "veinstock_saved_session";

const readSession = () => {
  const current = sessionStorage.getItem(savedSessionKey);
  const saved = localStorage.getItem(savedSessionKey);
  try {
    const session = JSON.parse(current || saved || "null") as {
      user: SessionUser;
      token: string;
    } | null;
    if (session?.user && session.token) return session;

    // Pertahankan sesi dari versi aplikasi sebelumnya saat pengguna memperbarui aplikasi.
    const legacyUser = sessionStorage.getItem("veinstock_user");
    const legacyToken = sessionStorage.getItem("veinstock_token");
    return legacyUser && legacyToken
      ? { user: JSON.parse(legacyUser) as SessionUser, token: legacyToken }
      : null;
  } catch {
    return null;
  }
};

function App() {
  const [data, setData] = useState<AppData>(loadData);
  const [authUser, setAuthUser] = useState<SessionUser | null>(
    () => readSession()?.user || null,
  );
  const [token, setToken] = useState<string | null>(() => readSession()?.token || null);
  const [hydrated, setHydrated] = useState(false);
  const [page, setPage] = useState<Page>("dashboard");
  const [helpSection, setHelpSection] = useState<string | null>(null);
  const [sidebar, setSidebar] = useState(false);
  const [desktopSidebar, setDesktopSidebar] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [modal, setModal] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [confirm, setConfirm] = useState<{ message: string, onConfirm: () => void } | null>(null);
  const serverVersion = useRef(0);
  const serverReady = useRef(false);
  const skipNextSync = useRef(false);
  // Menahan pembaruan dari perangkat lain saat Owner masih memiliki perubahan
  // lokal yang belum selesai dikirim ke server.
  const hasPendingLocalChanges = useRef(false);
  const user = authUser;
  useEffect(() => {
    if (user) saveData(data, user.organizationId);
    if (!serverReady.current || skipNextSync.current) {
      skipNextSync.current = false;
      return;
    }
    hasPendingLocalChanges.current = true;
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/state", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ data, version: serverVersion.current }),
        });
        if (response.status === 409) {
          setToast(
            "Data berubah di perangkat lain. Muat ulang halaman sebelum melanjutkan.",
          );
          return;
        }
        const result = await response.json();
        if (!response.ok) {
          setToast(result.message || "Perubahan belum dapat disimpan");
          return;
        }
        serverVersion.current = result.version;
        hasPendingLocalChanges.current = false;
      } catch {
        /* Mode lokal tetap dapat digunakan saat API belum aktif. */
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [data, token, user]);
  useEffect(() => {
    if (!token || !user) {
      setHydrated(false);
      return;
    }
    setHydrated(false);
    fetch("/api/state", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (r.status === 401 || r.status === 403) {
          sessionStorage.removeItem(savedSessionKey);
          localStorage.removeItem(savedSessionKey);
          sessionStorage.removeItem("veinstock_user");
          sessionStorage.removeItem("veinstock_token");
          setAuthUser(null);
          setToken(null);
          return null;
        }
        if (!r.ok) throw new Error("network");
        return r.json();
      })
      .then((result) => {
        if (!result) return;
        serverVersion.current = result.version || 0;
        if (result.data) {
          skipNextSync.current = true;
          setData(normalizeData(result.data));
        } else
          setData(
            user.organizationId === "org-meneng"
              ? seedData
              : createEmptyData(user.organizationName, user),
          );
        serverReady.current = true;
        setHydrated(true);
      })
      .catch(() => {
        serverReady.current = false;
        skipNextSync.current = true;
        setData(loadData(user.organizationId));
        setHydrated(true);
      });
    // Identitas profil tidak boleh memicu hydrate ulang; data tenant hanya berubah saat token/organisasi berubah.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user?.organizationId]);
  useEffect(() => {
    if (!token || user?.role !== "owner" || !serverReady.current) return;

    const refreshFromServer = async () => {
      if (hasPendingLocalChanges.current) return;
      try {
        const response = await fetch("/api/state", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        const result = await response.json();
        if (!result.data || Number(result.version) <= serverVersion.current) return;

        serverVersion.current = Number(result.version);
        skipNextSync.current = true;
        setData(normalizeData(result.data));
        setToast("Data aktivitas tim telah diperbarui.");
      } catch {
        // Koneksi yang putus tidak boleh mengganggu pekerjaan Owner.
      }
    };

    const interval = window.setInterval(refreshFromServer, 5_000);
    return () => window.clearInterval(interval);
  }, [token, user?.role, user?.organizationId]);
  const variantMap = useMemo(
    () =>
      Object.fromEntries(
        data.products.flatMap((p) =>
          p.variants.map((v) => [
            v.id,
            { ...v, unit: p.unit, productName: p.name },
          ]),
        ),
      ),
    [data.products],
  );
  const locationMap = useMemo(
    () => Object.fromEntries(data.locations.map((l) => [l.id, l])),
    [data.locations],
  );
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  };
  const checkAuth = (action: ActionType, locationId?: string) => {
    const auth = authorizeAction(user, action, locationId);
    if (!auth.allowed) notify(auth.reason || "Akses ditolak");
    return auth.allowed;
  };
  const authenticate = async (endpoint: string, payload: object, remember = false) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Autentikasi gagal");
    setHydrated(false);
    setAuthUser(result.user);
    setToken(result.token);
    const session = JSON.stringify({ user: result.user, token: result.token });
    sessionStorage.setItem(savedSessionKey, session);
    sessionStorage.removeItem("veinstock_user");
    sessionStorage.removeItem("veinstock_token");
    if (remember) localStorage.setItem(savedSessionKey, session);
    else localStorage.removeItem(savedSessionKey);
    notify(
      endpoint === "/api/login"
        ? "Berhasil masuk ke Dashboard"
        : "Pendaftaran berhasil, selamat datang di VEINSTOCK!"
    );
  };
  const login = (email: string, password: string, remember: boolean) =>
    authenticate("/api/login", { email, password }, remember);
  const register = (
    organizationName: string,
    name: string,
    email: string,
    password: string,
  ) =>
    authenticate("/api/register", { organizationName, name, email, password });
  const addUser = async (payload: any) => {
    const response = await fetch("/api/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.message || "Gagal menambah pengguna");
    setData((current) => ({
      ...current,
      users: [...current.users, { ...result.user, avatarUrl: payload.avatarUrl }],
    }));
    setModal(null);
    notify("Pengguna berhasil ditambahkan dan sudah dapat masuk");
  };
  const updateUser = async (id: string, payload: any) => {
    const response = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.message || "Gagal memperbarui pengguna");
    setData((current) => ({
      ...current,
      users: current.users.map((item) =>
        item.id === id ? { ...item, ...result.user, avatarUrl: payload.avatarUrl ?? item.avatarUrl } : item,
      ),
    }));
    if (user?.id === id) {
      const updated = {
        ...user,
        ...result.user,
        avatarUrl: payload.avatarUrl ?? user.avatarUrl,
        organizationName: user.organizationName,
      };
      setAuthUser(updated);
      const currentSession = readSession();
      if (currentSession) {
        const session = JSON.stringify({ ...currentSession, user: updated });
        sessionStorage.setItem(savedSessionKey, session);
        if (localStorage.getItem(savedSessionKey)) localStorage.setItem(savedSessionKey, session);
      }
    }
    setModal(null);
    notify("Profil pengguna berhasil diperbarui");
  };
  const uploadImage = async (file: File) => {
    const body = new FormData();
    body.append("image", file);
    const response = await fetch("/api/uploads/image", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.message || "Gagal mengunggah gambar");
    notify(
      `Gambar dioptimalkan dari ${Math.round(result.originalBytes / 1024)} KB menjadi ${Math.round(result.bytes / 1024)} KB`,
    );
    return result.url as string;
  };
  const logout = () => {
    setAuthUser(null);
    setToken(null);
    setHydrated(false);
    setPage("dashboard");
    serverReady.current = false;
    sessionStorage.removeItem(savedSessionKey);
    localStorage.removeItem(savedSessionKey);
    sessionStorage.removeItem("veinstock_user");
    sessionStorage.removeItem("veinstock_token");
  };
  const cancelTransaction = (kind: string, id: string, reason: string) => {
    setData((d) => {
      let balances = d.balances,
        movements = d.movements;
      if (kind === "sale") {
        const item = d.sales.find((x: any) => x.id === id);
        if (!item || item.status === "voided") return d;
        item.items.forEach((line: any) => {
          balances = adjustBalance(
            balances,
            item.locationId,
            line.variantId,
            line.quantity,
          );
          movements = [
            movement(
              line.variantId,
              item.locationId,
              "Pembatalan Penjualan",
              line.quantity,
              reason,
              user?.name || "Pengguna",
            ),
            ...movements,
          ];
        });
        return {
          ...d,
          balances,
          movements,
          sales: d.sales.map((x: any) =>
            x.id === id
              ? {
                  ...x,
                  status: "voided",
                  cancelReason: reason,
                  cancelledAt: new Date().toISOString(),
                }
              : x,
          ),
        };
      }
      if (kind === "transfer") {
        const item = d.transfers.find((x: any) => x.id === id);
        if (!item || item.status === "cancelled") return d;
        if (
          item.status === "received" &&
          getBalance(balances, item.toId, item.variantId) < item.quantity
        ) {
          notify("Pembatalan gagal: stok lokasi tujuan sudah tidak mencukupi");
          return d;
        }
        if (item.status === "received")
          balances = adjustBalance(
            balances,
            item.toId,
            item.variantId,
            -item.quantity,
          );
        balances = adjustBalance(
          balances,
          item.fromId,
          item.variantId,
          item.quantity,
        );
        movements = [
          movement(
            item.variantId,
            item.fromId,
            "Pembatalan transfer",
            item.quantity,
            reason,
            user?.name || "Pengguna",
          ),
          ...movements,
        ];
        return {
          ...d,
          balances,
          movements,
          transfers: d.transfers.map((x: any) =>
            x.id === id
              ? {
                  ...x,
                  status: "cancelled",
                  cancelReason: reason,
                  cancelledAt: new Date().toISOString(),
                }
              : x,
          ),
        };
      }
      if (kind === "receipt") {
        const item = (d.receipts || []).find((x: any) => x.id === id);
        if (!item || item.status === "cancelled") return d;
        if (
          getBalance(balances, item.locationId, item.variantId) < item.quantity
        ) {
          notify("Pembatalan gagal: stok yang masuk sudah terpakai");
          return d;
        }
        balances = adjustBalance(
          balances,
          item.locationId,
          item.variantId,
          -item.quantity,
        );
        movements = [
          movement(
            item.variantId,
            item.locationId,
            "Pembatalan stok masuk",
            -item.quantity,
            reason,
            user?.name || "Pengguna",
          ),
          ...movements,
        ];
        return {
          ...d,
          balances,
          movements,
          receipts: (d.receipts || []).map((x: any) =>
            x.id === id
              ? {
                  ...x,
                  status: "cancelled",
                  cancelReason: reason,
                  cancelledAt: new Date().toISOString(),
                }
              : x,
          ),
        };
      }
      if (kind === "opname") {
        const item = d.stockCounts.find((x: any) => x.id === id);
        if (!item || item.status === "cancelled") return d;
        balances = adjustBalance(
          balances,
          item.locationId,
          item.variantId,
          -item.difference,
        );
        movements = [
          movement(
            item.variantId,
            item.locationId,
            "Pembatalan opname",
            -item.difference,
            reason,
            user?.name || "Pengguna",
          ),
          ...movements,
        ];
        return {
          ...d,
          balances,
          movements,
          stockCounts: d.stockCounts.map((x: any) =>
            x.id === id
              ? {
                  ...x,
                  status: "cancelled",
                  cancelReason: reason,
                  cancelledAt: new Date().toISOString(),
                }
              : x,
          ),
        };
      }
      const item = (d.returns || []).find((x: any) => x.id === id);
      if (!item || item.status === "cancelled") return d;
      const delta = item.type === "customer" ? -item.quantity : item.quantity;
      if (
        delta < 0 &&
        getBalance(balances, item.locationId, item.variantId) < item.quantity
      ) {
        notify("Pembatalan gagal: stok retur sudah terpakai");
        return d;
      }
      balances = adjustBalance(
        balances,
        item.locationId,
        item.variantId,
        delta,
      );
      movements = [
        movement(
          item.variantId,
          item.locationId,
          "Pembatalan retur",
          delta,
          reason,
          user?.name || "Pengguna",
        ),
        ...movements,
      ];
      return {
        ...d,
        balances,
        movements,
        returns: (d.returns || []).map((x: any) =>
          x.id === id
            ? {
                ...x,
                status: "cancelled",
                cancelReason: reason,
                cancelledAt: new Date().toISOString(),
              }
            : x,
        ),
      };
    });
    setModal(null);
    notify("Transaksi dibatalkan. Histori dan alasan koreksi tetap tersimpan.");
  };

  const scope = useMemo(() => resolveUserScope(user), [user]);
  if (!user || !token) return <Login onLogin={login} onRegister={register} />;
  if (!hydrated)
    return (
      <div className="loading-page">
        <div className="brand-mark"><img src="/veinstock-icon-192.png" alt="VEINSTOCK" /></div>
        <b>Memuat ruang usaha {user.organizationName}…</b>
      </div>
    );

  const navGroups = [
    {
      group: "Utama",
      items: [
        ["dashboard", "Dashboard", LayoutDashboard],
        ["analytics", "Analitik Bisnis", TrendingUp]
      ]
    },
    {
      group: "Master Data",
      items: [
        ["products", "Produk & Varian", Archive],
        ["locations", "Lokasi Usaha", Store]
      ]
    },
    {
      group: "Inventaris",
      items: [
        ["receipts", "Stok Masuk", ArrowDownToLine],
        ["stock", "Stok per Lokasi", Boxes],
        ["transfers", "Transfer Stok", ArrowRightLeft],
        ["opname", "Stok Opname", ClipboardCheck],
        ["history", "Riwayat Stok", History]
      ]
    },
    {
      group: "Transaksi",
      items: [
        ["sales", "Penjualan", ShoppingCart],
        ["returns", "Retur", RotateCcw]
      ]
    },
    {
      group: "Laporan",
      items: [
        ["reports", "Laporan", BarChart3]
      ]
    },
    {
      group: "Pengaturan",
      items: [
        ["business", "Profil Usaha", Settings],
        ["users", "Pengguna & Akses", Users],
        ["help", "Pusat Bantuan", LifeBuoy]
      ]
    }
  ] as const;
  const titles: Record<Page, string> = {
    dashboard: "Dashboard Operasional",
    products: "Produk & Varian",
    locations: "Lokasi Usaha",
    receipts: "Stok Masuk",
    stock: "Stok per Lokasi",
    transfers: "Transfer Stok",
    sales: "Penjualan Multi-Kanal",
    returns: "Retur Barang",
    opname: "Stock Opname & Penyesuaian",
    history: "Histori Pergerakan Stok",
    reports: "Laporan Usaha",
    business: "Profil Bisnis & Organisasi",
    users: "Manajemen Akses & Pengguna",
    analytics: "Analisis Kinerja Bisnis",
    help: "Pusat Bantuan VEINSTOCK",
  };
  const allowed = (p: Page) => {
    if (p === "dashboard" || p === "help") return true;
    if (p === "business") return scope.role === "owner";
    if (p === "users") return scope.permissions.has("user.view");
    if (p === "locations" || p === "products") return scope.permissions.has("location.view") || scope.permissions.has("product.view");
    if (p === "receipts" || p === "returns") return scope.permissions.has("stock.in") || scope.permissions.has("stock.out");
    if (p === "sales") return scope.permissions.has("sale.view");
    if (p === "stock" || p === "history") return scope.permissions.has("stock.view");
    if (p === "transfers") return scope.permissions.has("transfer.create") || scope.permissions.has("transfer.send") || scope.permissions.has("transfer.receive");
    if (p === "opname") return scope.permissions.has("stock.opname");
    if (p === "reports" || p === "analytics") return scope.permissions.has("report.view");
    return false;
  };

  return (
    <div className={`app-shell ${!desktopSidebar ? "sidebar-collapsed" : ""}`}>
      {sidebar && (
        <div className="sidebar-overlay" onClick={() => setSidebar(false)}></div>
      )}
      <aside className={sidebar ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <div className="brand-mark"><img src="/veinstock-icon-192.png" alt="VEINSTOCK" /></div>
          <div>
            <strong>
              VEIN<span>STOCK</span>
            </strong>
            <small>Stok akurat, usaha tenang.</small>
          </div>
          <button
            className="icon-btn close-mobile"
            aria-label="Tutup menu"
            onClick={() => setSidebar(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace">
          <span>RUANG KERJA</span>
          <b>{user.organizationName}</b>
          <small>
            <Store /> {data.locations.filter((l) => l.active).length} lokasi
            aktif
          </small>
        </div>
        <nav>
          {navGroups.map((group, idx) => {
            const allowedItems = group.items.filter(([id]) => allowed(id as Page));
            if (allowedItems.length === 0) return null;
            return (
              <div key={idx} className="nav-group-wrapper">
                <div className="nav-group-title">{group.group}</div>
                {allowedItems.map(([id, label, Icon]) => (
                  <button
                    key={id as string}
                    className={page === id ? "active" : ""}
                    onClick={() => {
                      setPage(id as Page);
                      setSidebar(false);
                    }}
                  >
                    <Icon />
                    <span>{label as string}</span>
                    {id === "transfers" &&
                      data.transfers.some((t) => t.status === "sent") && (
                        <em>
                          {data.transfers.filter((t) => t.status === "sent").length}
                        </em>
                      )}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>

        <button className="sidebar-tab-toggle" onClick={() => setDesktopSidebar(!desktopSidebar)}>
          {desktopSidebar ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </aside>
      <main>
        <header>
          <button
            className="icon-btn menu-btn"
            aria-label="Buka menu"
            onClick={() => { setSidebar(true); setDesktopSidebar(true); }}
          >
            <Menu />
          </button>
          <div>
            <small>{user.organizationName.toUpperCase()} / OPERASIONAL</small>
            <h1>{titles[page]}</h1>
          </div>
          <div className="header-actions">
            <button
              className="icon-btn notification"
              aria-label="Notifikasi stok"
              onClick={() => setModal("notifications")}
            >
              <Bell />
              {data.balances.some(
                (b) => b.quantity < minimumFor(variantMap[b.variantId], b.locationId),
              ) && <i />}
            </button>
            <div className="date-chip">
              Hari ini
              <br />
              <b>
                {new Date().toLocaleDateString("id-ID", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </b>
            </div>
            <div 
              className="header-user" 
              tabIndex={0} 
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setUserMenuOpen(false);
              }}
              style={{ position: 'relative', cursor: 'pointer', outline: 'none' }}
            >
              <div className="avatar">{user.avatarUrl||(user.role==='owner'&&data.business?.logoUrl)?<img src={user.avatarUrl||data.business?.logoUrl} alt={user.name}/>:user.name.slice(0, 2).toUpperCase()}</div>
              <div onClick={() => setUserMenuOpen(!userMenuOpen)}>
                <b style={{fontWeight: 700}}>Hai, {user.name}</b>
              </div>
              <button className="icon-btn" aria-label="Menu Pengguna" onClick={() => setUserMenuOpen(!userMenuOpen)}>
                <Menu size={18} />
              </button>
              
              {userMenuOpen && (
                <div className="user-dropdown">
                  {user.role === 'owner' && (
                    <button onClick={() => { setModal('business'); setUserMenuOpen(false); }}>Edit Profile Usaha</button>
                  )}
                  <button onClick={() => { setModal('change-password'); setUserMenuOpen(false); }}>Ganti Password</button>
                  <button onClick={() => { logout(); setUserMenuOpen(false); }} style={{color: 'var(--red)'}}>Logout</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <div className="content">
          {page === "dashboard" && (
            <Dashboard
              data={data}
              variants={variantMap}
              locations={locationMap}
              setPage={setPage}
              organizationName={data.business?.name || "Usaha Anda"}
              canEdit={user.role !== "finance"}
              role={user.role}
              outletId={user.outletId}
            />
          )}
          {page === "products" && (
            <Products
              data={data}
              open={() => checkAuth('product.create') && setModal("product")}
              edit={(productId: string) => checkAuth('product.update') && setModal(`product:${productId}`)}
            />
          )}
          {page === "locations" && (
            <LocationsPage
              data={data}
              open={() => checkAuth('location.create') && setModal("location")}
              edit={(id: string) => checkAuth('location.update') && setModal(`location:${id}`)}
            />
          )}
          {page === "receipts" && (
            <ReceiptsPage
              data={data}
              variants={variantMap}
              locations={locationMap}
              open={() => {
                if (!data.products.some((p) => p.active && p.variants.some((v) => v.active !== false)))
                  return notify("Tambahkan produk aktif terlebih dahulu");
                if (checkAuth('stock.in')) setModal("receipt");
              }}
              edit={(id: string) => checkAuth('stock.in') && setModal(`receipt:${id}`)}
              cancel={(id: string) => checkAuth('stock.in') && setModal(`cancel:receipt:${id}`)}
            />
          )}
          {page === "stock" && (
            <Stock 
              data={data} 
              setData={setData}
              variants={variantMap}
              role={user.role}
              outletId={user.outletId} 
            />
          )}
          {page === "transfers" && (
            <Transfers
              data={data}
              setData={setData}
              variants={variantMap}
              locations={locationMap}
              role={user.role}
              outletId={user.outletId}
              open={() => {
                if (data.locations.filter((l) => l.active).length < 2)
                  return notify("Tambahkan minimal dua lokasi aktif terlebih dahulu");
                if (!data.products.some((p) => p.active && p.variants.some((v) => v.active !== false)))
                  return notify("Tambahkan produk aktif terlebih dahulu");
                if (checkAuth('transfer.create')) setModal("transfer");
              }}
              notify={notify}
              user={user.name}
              cancel={(id: string) => checkAuth('transfer.cancel') && setModal(`cancel:transfer:${id}`)}
              detail={(id: string) => setModal(`transfer-detail:${id}`)}
              helpAction={() => { setHelpSection("transfer"); setPage("help"); }}
            />
          )}
          {page === "sales" && (
            <Sales
              data={data}
              variants={variantMap}
              locations={locationMap}
              role={user.role}
              outletId={user.outletId}
              open={() => {
                if (!data.locations.some((l) => l.active)) return notify("Tambahkan lokasi aktif terlebih dahulu");
                if (!data.products.some((p) => p.active && p.variants.some((v) => v.active !== false))) return notify("Tambahkan produk aktif terlebih dahulu");
                if (checkAuth('sale.create')) setModal("sale");
              }}
              cancel={(id: string) => checkAuth('sale.void') && setModal(`cancel:sale:${id}`)}
              detail={(id: string) => setModal(`sale-detail:${id}`)}
              canCancel={true}
            />
          )}
          {page === "returns" && (
            <ReturnsPage
              data={data}
              variants={variantMap}
              locations={locationMap}
              role={user.role}
              outletId={user.outletId}
              open={() => {
                if (!data.products.some((p) => p.active && p.variants.some((v) => v.active !== false)))
                  return notify("Tambahkan produk aktif terlebih dahulu");
                if (checkAuth('stock.in')) setModal("return");
              }}
              cancel={(id: string) => checkAuth('stock.in') && setModal(`cancel:return:${id}`)}
            />
          )}
          {page === "opname" && (
            <Opname
              data={data}
              setData={setData}
              variants={variantMap}
              locations={locationMap}
              role={user.role}
              outletId={user.outletId}
              open={() => {
                if (!data.locations.some((l) => l.active)) return notify("Tambahkan lokasi aktif terlebih dahulu");
                if (!data.products.some((p) => p.active && p.variants.some((v) => v.active !== false))) return notify("Tambahkan produk aktif terlebih dahulu");
                if (checkAuth('stock.opname')) setModal("opname");
              }}
              notify={notify}
              user={user.name}
              edit={(id: string) => checkAuth('stock.opname') && setModal(`opname:${id}`)}
              cancel={(id: string) => checkAuth('stock.opname') && setModal(`cancel:opname:${id}`)}
              canCorrect={true}
            />
          )}
          {page === "history" && (
            <HistoryPage
              data={data}
              variants={variantMap}
              locations={locationMap}
              role={user.role}
              outletId={user.outletId}
            />
          )}
          {page === "reports" && (
            <Reports
              data={data}
              variants={variantMap}
              locations={locationMap}
              notify={notify}
              role={user.role}
              outletId={user.outletId}
            />
          )}
          {page === "business" && (
            <BusinessPage data={data} open={() => setModal("business")} />
          )}
          {page === "users" && (
            <UsersPage
              data={data}
              currentUser={user}
              open={() => setModal("user")}
              edit={(id: string) => setModal(`user:${id}`)}
            />
          )}
          {page === "help" && <HelpPage initialSection={helpSection} clearInitialSection={() => setHelpSection(null)} />}
          {page === "analytics" && <AnalyticsPage data={data} setData={setData} />}
        </div>
      </main>
      {modal === "product" && (
        <ProductModal
          user={user}
              locations={data.locations.filter((loc: any) => user?.role === "owner" || user?.role === "admin" || loc.id === ((user as any)?.outlet_id || user?.outletId))}
          close={() => setModal(null)}
          uploadImage={uploadImage}
          save={(p: Product, initialStocks?: any[]) => {
            setData((d) => {
              const newBalances = [...d.balances];
              const newMovements = [...d.movements];
              
              if (initialStocks && initialStocks.length > 0) {
                initialStocks.forEach(st => {
                  if (!newBalances.find(b => b.locationId === st.locationId && b.variantId === st.variantId)) {
                    newBalances.push({ locationId: st.locationId, variantId: st.variantId, quantity: st.quantity });
                    newMovements.push(movement(st.variantId, st.locationId, "INITIAL_BALANCE", st.quantity, "Saldo awal saat pembuatan produk", user?.name || "Sistem"));
                  }
                });
              }
              
              return { ...d, products: [...d.products, p], balances: newBalances, movements: newMovements };
            });
            setModal(null);
            notify("Produk dan varian berhasil ditambahkan");
          }}
        />
      )}
      {modal?.startsWith("product:") &&
        (() => {
          const [, productId] = modal.split(":"),
            product = data.products.find((item) => item.id === productId);
          return product ? (
            <ProductModal
              user={user}
                  locations={data.locations.filter((loc: any) => user?.role === "owner" || user?.role === "admin" || loc.id === ((user as any)?.outlet_id || user?.outletId))}
              product={product}
              close={() => setModal(null)}
              uploadImage={uploadImage}
              onDelete={() => {
                setConfirm({
                  message: "Arsipkan produk ini? Produk tidak lagi bisa dipilih untuk transaksi baru, tetapi histori penjualan dan stok tetap aman.",
                  onConfirm: () => {
                    setData((d) => ({
                      ...d,
                      products: d.products.map((p: any) =>
                        p.id === product.id
                          ? { ...p, active: false, variants: p.variants.map((v: any) => ({ ...v, active: false })) }
                          : p,
                      ),
                    }));
                    setModal(null);
                    notify("Produk diarsipkan. Histori transaksi tetap tersimpan.");
                    setConfirm(null);
                  }
                });
              }}
              save={(updated: Product) => {
                setData((d) => ({
                  ...d,
                  products: d.products.map((item) =>
                    item.id === updated.id ? updated : item,
                  ),
                }));
                setModal(null);
                notify("Produk dan varian berhasil diperbarui");
              }}
            />
          ) : null;
        })()}
      {modal === "location" && (
        <LocationModal
          close={() => setModal(null)}
          save={(name: string, type: "warehouse" | "outlet") => {
            setData((d) => ({
              ...d,
              locations: [
                ...d.locations,
                { id: newId("loc"), name, type, active: true },
              ],
            }));
            setModal(null);
            notify("Lokasi usaha berhasil ditambahkan");
          }}
        />
      )}
      {modal?.startsWith("location:") &&
        (() => {
          const selected = data.locations.find(
            (x) => x.id === modal.split(":")[1],
          );
          return selected ? (
            <LocationModal
              location={selected}
              close={() => setModal(null)}
              onDelete={() => {
                setConfirm({
                  message: "Nonaktifkan lokasi ini? Histori dan saldo lama tetap tersimpan untuk audit, tetapi lokasi tidak dapat dipakai transaksi baru.",
                  onConfirm: () => {
                    if (data.locations.filter((l) => l.active).length === 1)
                      return notify("Minimal satu lokasi harus tetap aktif");
                    setData((d) => ({
                      ...d,
                      locations: d.locations.map((l: any) =>
                        l.id === selected.id ? { ...l, active: false } : l,
                      ),
                    }));
                    setModal(null);
                    notify("Lokasi dinonaktifkan. Histori transaksi tetap tersimpan.");
                    setConfirm(null);
                  }
                });
              }}
              save={(
                name: string,
                type: "warehouse" | "outlet",
                address: string,
                active: boolean,
              ) => {
                if (
                  !active &&
                  data.locations.filter((x) => x.active).length === 1
                )
                  return notify("Minimal satu lokasi harus tetap aktif");
                setData((d) => ({
                  ...d,
                  locations: d.locations.map((x) =>
                    x.id === selected.id
                      ? { ...x, name, type, address, active }
                      : x,
                  ),
                }));
                setModal(null);
                notify("Lokasi berhasil diperbarui");
              }}
            />
          ) : null;
        })()}
      {(modal === "receipt" || (modal?.startsWith("receipt:") && !modal.startsWith("cancel:"))) && (
        (() => {
          const receipt = modal !== "receipt" ? data.receipts?.find((r: any) => r.id === modal.split(":")[1]) : undefined;
          return (
            <ReceiptModal
              data={data}
              receipt={receipt}
              close={() => setModal(null)}
              save={(form: any) => {
                if (!form.items || form.items.length === 0) return notify("Pilih minimal satu varian");
                for (const item of form.items) {
                   if (!isPositiveNumber(item.quantity) || !Number.isFinite(item.unitCost) || item.unitCost < 0)
                     return notify("Jumlah dan harga modal stok masuk harus valid");
                }

                setData((d) => {
                  let b = d.balances;
                  let newReceipts = [...(d.receipts || [])];
                  let newMovements = [...(d.movements || [])];

                  if (receipt) {
                    b = adjustBalance(b, receipt.locationId, receipt.variantId, -receipt.quantity);
                  }

                  form.items.forEach((item: any) => {
                    b = adjustBalance(b, form.locationId, item.variantId, item.quantity);

                    if (receipt) {
                      newReceipts = newReceipts.map((r: any) => r.id === receipt.id ? { ...r, ...form, variantId: item.variantId, quantity: item.quantity, unitCost: item.unitCost, createdBy: user?.name || r.createdBy } : r);
                      newMovements = [
                        movement(item.variantId, form.locationId, "Koreksi Stok Masuk", item.quantity, "Revisi transaksi", user?.name || "Sistem"),
                        movement(receipt.variantId, receipt.locationId, "Koreksi Stok Masuk", -receipt.quantity, "Revisi transaksi (Pembatalan lama)", user?.name || "Sistem"),
                        ...newMovements
                      ];
                    } else {
                      newReceipts = [
                        {
                          id: newId("rcv"),
                          ...form,
                          variantId: item.variantId,
                          quantity: item.quantity,
                          unitCost: item.unitCost,
                          status: "completed",
                          createdBy: user?.name || "Sistem",
                          createdAt: new Date().toISOString(),
                        },
                        ...newReceipts
                      ];
                      newMovements = [
                        movement(
                          item.variantId,
                          form.locationId,
                          form.sourceType === "production"
                            ? "Hasil produksi"
                            : form.supplierName || "Supplier",
                          item.quantity,
                          "",
                          user?.name || "Sistem",
                        ),
                        ...newMovements
                      ];
                    }
                  });

                  return {
                    ...d,
                    balances: b,
                    receipts: newReceipts,
                    movements: newMovements,
                  };
                });
                setModal(null);
                notify(receipt ? "Stok masuk berhasil diperbarui" : "Stok masuk berhasil dicatat");
              }}
            />
          );
        })()
      )}
      {modal === "return" && (
        <ReturnModal
          data={data}
          close={() => setModal(null)}
          save={(form: any) => {
            if (!form.reason?.trim() || form.items.length === 0)
              return notify("Pilih produk dan isi alasan retur dengan benar");
            
            let balances = [...data.balances];
            let newReturns = [...(data.returns || [])];
            let newMovements = [...data.movements];

            for (const item of form.items) {
              const delta = form.type === "customer" ? item.quantity : -item.quantity;
              if (delta < 0 && getBalance(balances, form.locationId, item.variantId) < item.quantity) {
                 return notify(`Stok tidak cukup untuk produk dengan ID varian ${item.variantId}`);
              }
              balances = adjustBalance(balances, form.locationId, item.variantId, delta);
              newReturns.unshift({
                  id: newId("ret"),
                  type: form.type,
                  locationId: form.locationId,
                  variantId: item.variantId,
                  quantity: item.quantity,
                  reason: form.reason,
                  status: "completed",
                  createdAt: new Date().toISOString(),
              });
              newMovements.unshift(
                movement(
                  item.variantId,
                  form.locationId,
                  form.type === "customer" ? "Retur pelanggan" : "Retur ke supplier",
                  delta,
                  form.reason,
                  user.name,
                )
              );
            }

            setData((d) => ({
              ...d,
              balances,
              returns: newReturns,
              movements: newMovements,
            }));
            setModal(null);
            notify("Retur berhasil dicatat dan saldo stok telah diperbarui");
          }}
        />
      )}
      {modal === "business" && (
        <BusinessModal
          data={data}
          close={() => setModal(null)}
          uploadImage={uploadImage}
          save={async (profile: any) => {
            const res = await fetch('/api/organization', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.token}` },
              body: JSON.stringify(profile)
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              throw new Error(err.message || 'Gagal menyimpan profil usaha');
            }
            // Update user organizationName if ownerName changed
            setUser((u: any) => ({ ...u, organizationName: profile.name }));
            setData((d) => ({ ...d, business: profile }));
            setModal(null);
            notify("Profil usaha berhasil diperbarui");
          }}
        />
      )}
      {modal === "user" && (
        <UserModal data={data} close={() => setModal(null)} save={addUser} uploadImage={uploadImage}/>
      )}
      {modal?.startsWith("user:") &&
        (() => {
          const stored = data.users.find(
              (item) => item.id === modal.split(":")[1],
            ),
            selected = stored?.id === user.id ? { ...stored, ...user } : stored;
          return selected ? (
            <UserModal
              data={data}
              user={selected}
              uploadImage={uploadImage}
              close={() => setModal(null)}
              onDelete={selected.id !== user.id ? () => {
                setConfirm({
                  message: "Nonaktifkan akun ini? Akun tidak dapat masuk lagi, tetapi histori aktivitasnya tetap dapat diaudit.",
                  onConfirm: async () => {
                    await updateUser(selected.id, {
                      name: selected.name,
                      email: selected.email,
                      role: selected.role,
                      outletId: selected.outletId,
                      active: false,
                    });
                    setConfirm(null);
                    notify("Akun dinonaktifkan. Histori aktivitas tetap tersimpan.");
                  }
                });
              } : undefined}
              save={(payload: object) => updateUser(selected.id, payload)}
            />
          ) : null;
        })()}
      {modal === "transfer" && (
        <TransferModal
          data={data}
          close={() => setModal(null)}
          fixedFrom={user.role === "pic" ? user.outletId : undefined}
          save={(f: string, t: string, items: { variantId: string, quantity: number }[]) => {
            if (f === t || items.length === 0)
              return notify("Pilih lokasi berbeda dan minimal satu produk");
            
            let balances = [...data.balances];
            let newTransfers = [...data.transfers];
            let newMovements = [...data.movements];

            for (const item of items) {
               const currentStock = getBalance(balances, f, item.variantId);
               if (currentStock < item.quantity) {
                 const policy = data.business?.negativeStockPolicy || 'BLOCK';
                 if (policy === 'BLOCK') {
                   return notify(`Stok lokasi asal tidak mencukupi untuk varian ID ${item.variantId}`);
                 }
                 if (policy === 'WARN' && !window.confirm(`Peringatan: Stok lokasi asal tidak mencukupi untuk varian ID ${item.variantId} (Tersedia: ${currentStock}). Lanjutkan transfer?`)) {
                   return;
                 }
               }
               balances = adjustBalance(balances, f, item.variantId, -item.quantity);
               newTransfers.unshift({
                  id: newId("trf"),
                  fromId: f,
                  toId: t,
                  variantId: item.variantId,
                  quantity: item.quantity,
                  status: "sent",
                  createdAt: new Date().toISOString(),
               });
               newMovements.unshift(
                 movement(
                   item.variantId,
                   f,
                   "Transfer keluar",
                   -item.quantity,
                   `Dikirim ke ${locationMap[t].name}`,
                   user.name,
                 )
               );
            }

            setData((d) => ({
              ...d,
              balances,
              transfers: newTransfers,
              movements: newMovements,
            }));
            setModal(null);
            notify("Transfer dibuat, menunggu konfirmasi outlet");
          }}
        />
      )}
      {modal === "sale" && (
        <SaleModal
          data={data}
          fixedLocation={user.role === "pic" ? user.outletId : undefined}
          close={() => setModal(null)}
          save={(
            loc: string,
            channel: Channel,
            cart: Array<{variantId: string, quantity: number}>,
            payment: string
          ) => {
            const policy = data.business?.negativeStockPolicy || 'BLOCK';
            let totalAmount = 0;
            const itemsToSave: any[] = [];
            let newBalances = data.balances;
            const newMovements: any[] = [];
            
            for (const c of cart) {
              const variant = variantMap[c.variantId];
              if (!variant || !isPositiveNumber(c.quantity)) continue;
              
              const currentStock = getBalance(data.balances, loc, c.variantId);
              if (currentStock < c.quantity) {
                if (policy === 'BLOCK') {
                  return notify(`Transaksi ditolak: Stok ${variant.productName} ${variant.name} tidak mencukupi. Tersedia ${currentStock} ${variant.unit}.`);
                }
                if (policy === 'WARN' && !window.confirm(`Peringatan: Stok ${variant.productName} ${variant.name} tidak mencukupi (Tersedia: ${currentStock} ${variant.unit}). Lanjutkan transaksi?`)) {
                  return;
                }
              }
              
              const price = channel === "reseller" ? variant.resellerPrice : variant.price;
              totalAmount += c.quantity * price;
              
              newBalances = adjustBalance(newBalances, loc, c.variantId, -c.quantity);
              itemsToSave.push({
                variantId: c.variantId,
                quantity: c.quantity,
                unit: variant.unit,
                unitCost: variant.cost || 0,
                subtotal: c.quantity * (variant.cost || 0),
              });
              
              newMovements.push(
                movement(
                  c.variantId,
                  loc,
                  `Penjualan ${channel}`,
                  -c.quantity,
                  `${c.quantity} ${variant.unit}`,
                  user.name
                )
              );
            }
            
            if (itemsToSave.length === 0) return notify("Tidak ada produk valid di keranjang");

            setData((d) => ({
              ...d,
              balances: newBalances,
              sales: [
                {
                  id: newId("sale"),
                  locationId: loc,
                  channel,
                  total: totalAmount,
                  payment,
                  createdAt: new Date().toISOString(),
                  items: itemsToSave,
                },
                ...(d.sales || []),
              ],
              movements: [
                ...newMovements,
                ...d.movements,
              ],
            }));
            setModal(null);
            notify("Penjualan tersimpan dan stok otomatis berkurang");
          }}
        />
      )}
      {modal?.startsWith("opname") && (
        <OpnameModal
          data={data}
          item={
            modal.split(":")[1]
              ? data.stockCounts.find((x: any) => x.id === modal.split(":")[1])
              : null
          }
          fixedLocation={user.role === "pic" ? user.outletId : undefined}
          close={() => setModal(null)}
          save={(loc: string, items: { variantId: string, actualQty: number, reason: string }[]) => {
            if (items.length === 0)
              return notify("Isi stok fisik dan alasan opname dengan benar");
            
            const isEdit = modal.includes(":");
            if (isEdit) {
              const id = modal.split(":")[1];
              const oldItem = data.stockCounts.find((x: any) => x.id === id);
              if (!oldItem) return;
              const item = items[0]; // when editing, we only edit one item
              setData((d) => {
                const revertedBalances = adjustBalance(d.balances, oldItem.locationId, oldItem.variantId, -oldItem.difference);
                
                const system = getBalance(revertedBalances, loc, item.variantId);
                const newDiff = item.actualQty - system;
                const finalBalances = adjustBalance(revertedBalances, loc, item.variantId, newDiff);

                return {
                  ...d,
                  balances: finalBalances,
                  stockCounts: d.stockCounts.map((x: any) =>
                    x.id === id
                      ? {
                          ...x,
                          locationId: loc,
                          variantId: item.variantId,
                          systemQty: system,
                          actualQty: item.actualQty,
                          difference: newDiff,
                          reason: item.reason,
                          createdBy: user.name,
                          updatedAt: new Date().toISOString(),
                        }
                      : x,
                  ),
                  movements: [
                    movement(item.variantId, loc, "Koreksi opname (Update)", newDiff, item.reason, user.name),
                    movement(oldItem.variantId, oldItem.locationId, "Reversi update opname", -oldItem.difference, item.reason, user.name),
                    ...d.movements,
                  ],
                };
              });
              setModal(null);
              notify("Stock opname berhasil diperbarui");
            } else {
              let balances = [...data.balances];
              let newStockCounts = [...(data.stockCounts || [])];
              let newMovements = [...data.movements];

              for (const item of items) {
                const system = getBalance(balances, loc, item.variantId);
                const diff = item.actualQty - system;
                
                balances = adjustBalance(balances, loc, item.variantId, diff);
                newStockCounts.unshift({
                    id: newId("opn"),
                    locationId: loc,
                    variantId: item.variantId,
                    systemQty: system,
                    actualQty: item.actualQty,
                    difference: diff,
                    reason: item.reason,
                    createdBy: user.name,
                    createdAt: new Date().toISOString(),
                });
                newMovements.unshift(
                  movement(item.variantId, loc, "Koreksi opname", diff, item.reason, user.name)
                );
              }

              setData((d) => ({
                ...d,
                balances,
                stockCounts: newStockCounts,
                movements: newMovements,
              }));
              setModal(null);
              notify("Stock opname berhasil dicatat");
            }
          }}
        />
      )}
      {modal?.startsWith("cancel:") && (
        <CancelModal
          close={() => setModal(null)}
          save={(reason: string) => {
            const [, kind, id] = modal.split(":");
            cancelTransaction(kind, id, reason);
          }}
        />
      )}
      {modal?.startsWith("transfer-detail:") && (
        <TransferDetail
          item={data.transfers.find((x) => x.id === modal.split(":")[1])}
          business={data.business}
          variants={variantMap}
          locations={locationMap}
          close={() => setModal(null)}
          notify={notify}
        />
      )}
      {modal?.startsWith("sale-detail:") && (
        <SaleDetail
          item={data.sales.find((x) => x.id === modal.split(":")[1])}
          variants={variantMap}
          locations={locationMap}
          close={() => setModal(null)}
        />
      )}
      {modal === "notifications" && (
        <Notifications
          data={data}
          variants={variantMap}
          locations={locationMap}
          close={() => setModal(null)}
          act={(target: Page) => {
            setModal(null);
            setPage(target);
          }}
        />
      )}
      {modal === "change-password" && (
        <ChangePasswordModal
          token={token}
          close={() => setModal(null)}
          notify={notify}
        />
      )}
      {confirm && (
        <div className="modal-backdrop" style={{ zIndex: 100 }}>
          <div className="modal" style={{ width: '400px', padding: '24px' }}>
            <h2 style={{ fontSize: '18px', marginBottom: '8px' }}>Konfirmasi</h2>
            <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '24px' }}>{confirm.message}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button type="button" className="secondary" onClick={() => setConfirm(null)}>Batal</button>
              <button type="button" className="danger-button" onClick={confirm.onConfirm}>Ya, Lanjutkan</button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className="toast">
          <Check />
          {toast}
        </div>
      )}
    </div>
  );
}

function Login({
  onLogin,
  onRegister,
}: {
  onLogin: (email: string, password: string, remember: boolean) => Promise<void>;
  onRegister: (
    organizationName: string,
    name: string,
    email: string,
    password: string,
  ) => Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login"),
    [organization, setOrganization] = useState(""),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [remember, setRemember] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const changeMode = (next: "login" | "register" | "forgot") => {
    setMode(next);
    setError("");
    if (next === "register") {
      setEmail("");
      setPassword("");
    }
  };
  return (
    <div className="login-page">
      <div className="login-art" style={{ backgroundImage: 'url(/login-bg.png)', backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', padding: 0, backgroundColor: '#f5fbfa' }}>
      </div>
      <div className="login-panel">
        {mode === "forgot" ? (
          <ForgotPasswordFlow onBack={() => changeMode("login")} />
        ) : (
        <form
          className="login-box"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            setLoading(true);
            try {
              if (mode === "login") await onLogin(email, password, remember);
              else await onRegister(organization, name, email, password);
            } catch (err) {
              setError(
                err instanceof Error
                  ? err.message
                  : "Gagal memproses permintaan",
              );
            } finally {
              setLoading(false);
            }
          }}
        >
          <small>{mode === "login" ? "SELAMAT DATANG" : "MULAI GRATIS"}</small>
          <h2>
            {mode === "login" ? "Masuk ke VEINSTOCK" : "Buat ruang usaha"}
          </h2>
          <p>
            {mode === "login"
              ? "Gunakan akun dari owner usaha Anda."
              : "Data UMKM Anda akan dipisahkan dari usaha lain."}
          </p>
          <div className="auth-tabs">
            <button
              type="button"
              className={mode === "login" ? "active" : ""}
              onClick={() => changeMode("login")}
            >
              Masuk
            </button>
            <button
              type="button"
              className={mode === "register" ? "active" : ""}
              onClick={() => changeMode("register")}
            >
              Daftar UMKM
            </button>
          </div>
          {mode === "register" && (
            <>
              <Field label="Nama UMKM">
                <input
                  required
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  placeholder="Contoh: Toko Berkah"
                />
              </Field>
              <Field label="Nama pemilik">
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nama lengkap Anda"
                />
              </Field>
            </>
          )}
          <Field label="Alamat email">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
            />
          </Field>
          <Field label="Password">
            <PasswordInput
              minLength={8}
              required
              value={password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
          </Field>
          {mode === "login" && (
            <div className="login-options">
              <label className="toggle-field">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Ingat akun di perangkat ini
              </label>
              <button type="button" className="link-btn" onClick={() => changeMode("forgot")}>
                Lupa password?
              </button>
            </div>
          )}
          {error && <div className="login-error">{error}</div>}
          <button className="primary login-submit" disabled={loading}>
            {loading
              ? "Memproses..."
              : mode === "login"
                ? "Masuk ke Dashboard"
                : "Buat Ruang Usaha"}
          </button>
          <div className="secure-note">
            🔒 Data setiap UMKM terisolasi dan aktivitas stok tercatat.
          </div>
        </form>
        )}
      </div>
    </div>
  );
}

function ForgotPasswordFlow({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState<"request" | "verify">("request"),
    [email, setEmail] = useState(""),
    [otp, setOtp] = useState(""),
    [newPassword, setNewPassword] = useState(""),
    [confirmPassword, setConfirmPassword] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");

  const requestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setStep("verify");
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim OTP');
    } finally { setLoading(false); }
  };

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) return setError('Konfirmasi password tidak cocok');
    if (newPassword.length < 8) return setError('Password minimal 8 karakter');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, otp, newPassword }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setSuccess(data.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mereset password');
    } finally { setLoading(false); }
  };

  return (
    <div className="login-box forgot-flow">
      <button type="button" className="back-btn" onClick={onBack}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
        Kembali ke Login
      </button>
      {success ? (
        <div className="forgot-success">
          <div className="forgot-success-icon">✅</div>
          <h2>Password Berhasil Direset!</h2>
          <p>{success}</p>
          <button className="primary" style={{ width: '100%', marginTop: '24px' }} onClick={onBack}>Masuk Sekarang</button>
        </div>
      ) : step === "request" ? (
        <form onSubmit={requestOtp}>
          <small>LUPA PASSWORD</small>
          <h2>Reset Password</h2>
          <p>Masukkan email akun Anda. Kami akan mengirimkan kode OTP 6 angka ke email tersebut.</p>
          <Field label="Alamat email">
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="email@usaha.com" autoComplete="username" />
          </Field>
          {error && <div className="login-error">{error}</div>}
          <button className="primary login-submit" disabled={loading}>{loading ? 'Mengirim...' : 'Kirim Kode OTP'}</button>
        </form>
      ) : (
        <form onSubmit={resetPassword}>
          <small>LUPA PASSWORD · LANGKAH 2</small>
          <h2>Masukkan Kode OTP</h2>
          <p>Kode OTP 6 angka telah dikirim ke <strong>{email}</strong>. Berlaku 15 menit.</p>
          <Field label="Kode OTP">
            <input
              required
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              maxLength={6}
              inputMode="numeric"
              className="otp-input"
            />
          </Field>
          <Field label="Password Baru">
            <PasswordInput required minLength={8} value={newPassword} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPassword(e.target.value)} autoComplete="new-password" placeholder="Minimal 8 karakter" />
          </Field>
          <Field label="Konfirmasi Password Baru">
            <PasswordInput required minLength={8} value={confirmPassword} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)} autoComplete="new-password" placeholder="Ulangi password baru" />
          </Field>
          {error && <div className="login-error">{error}</div>}
          <button className="primary login-submit" disabled={loading}>{loading ? 'Menyimpan...' : 'Reset Password'}</button>
          <button type="button" className="link-btn" style={{ width: '100%', marginTop: '8px' }} onClick={() => { setStep('request'); setOtp(''); setNewPassword(''); setConfirmPassword(''); setError(''); }}>
            Kirim ulang kode OTP
          </button>
        </form>
      )}
    </div>
  );
}

function Dashboard({
  data,
  variants,
  locations,
  setPage,
  organizationName,
  canEdit,
  role,
  outletId,
}: any) {
  const isPic = ["pic", "warehouse", "cashier", "admin"].includes(role) && outletId;
  const sales = isPic ? data.sales.filter((s: any) => s.locationId === outletId) : data.sales;
  const balances = isPic ? data.balances.filter((b: any) => b.locationId === outletId) : data.balances;
  const transfers = isPic ? data.transfers.filter((t: any) => t.fromId === outletId || t.toId === outletId) : data.transfers;
  const myLocations = isPic ? data.locations.filter((l: any) => l.id === outletId) : data.locations;

  const today = sales.reduce((s: any, x: any) => s + x.total, 0);
  const low = balances.filter(
    (b: any) => b.quantity < minimumFor(variants[b.variantId], b.locationId),
  );
  return (
    <>
      <section className="welcome">
        <div>
          <span>RINGKASAN HARI INI</span>
          <h2>Selamat bekerja, tim {organizationName}.</h2>
          <p>
            Stok seluruh lokasi diperbarui dari transaksi dan transfer terbaru.
          </p>
        </div>
        {canEdit && (
          <button className="primary" onClick={() => setPage("sales")}>
            <Plus /> Catat Penjualan
          </button>
        )}
      </section>
      {canEdit&&(data.products.length===0||data.balances.length===0)&&<section className="onboarding"><div><small>PANDUAN MULAI</small><h2>Siapkan stok pertama Anda</h2><p>Ikuti urutan ini agar saldo awal tercatat sebagai transaksi dan mudah diaudit.</p></div><ol><li className={data.locations.length?'done':''}><b>1. Buat lokasi</b><span>Gudang atau outlet tempat stok disimpan.</span><button onClick={()=>setPage('locations')}>Buka lokasi</button></li><li className={data.products.length?'done':''}><b>2. Tambah produk & varian</b><span>Masukkan ukuran, warna, SKU, harga, dan minimum stok.</span><button onClick={()=>setPage('products')}>Buka produk</button></li><li className={data.balances.length?'done':''}><b>3. Catat stok masuk</b><span>Pilih supplier atau hasil produksi untuk membentuk saldo awal.</span><button onClick={()=>setPage('receipts')}>Catat stok</button></li></ol></section>}
      <section className="stats-grid">
        <Stat
          label="Penjualan hari ini"
          value={money(today)}
          sub="Semua kanal"
          tone="navy"
        />
        <Stat
          label="Stok seluruh lokasi"
          value={`${balances.length} saldo`}
          sub={`${data.products.flatMap((p: any) => p.variants).length} varian aktif`}
        />
        <Stat
          label="Transfer berjalan"
          value={transfers.filter((t: any) => t.status === "sent").length}
          sub="Menunggu penerimaan"
          tone="amber"
        />
        <Stat
          label="Perlu perhatian"
          value={low.length}
          sub="Stok di bawah minimum"
          tone="red"
        />
      </section>
      <section className="dashboard-grid">
        <Card
          title="Stok per lokasi"
          action="Lihat detail"
          onAction={() => setPage("stock")}
        >
          <div className="location-list">
            {myLocations.map((l: any) => {
              return (
                <div key={l.id}>
                  <div className="location-icon">
                    {l.type === "warehouse" ? <Warehouse /> : <Store />}
                  </div>
                  <div>
                    <b>{l.name}</b>
                    <span>
                      {
                        balances.filter((b: any) => b.locationId === l.id)
                          .length
                      }{" "}
                      varian tercatat
                    </span>
                  </div>
                  <strong>
                    {l.type === "warehouse" ? "Gudang" : "Outlet"}
                  </strong>
                </div>
              );
            })}
          </div>
        </Card>
        <Card title="Penjualan berdasarkan kanal">
          <div className="channel-bars">
            {(["offline", "online", "reseller"] as Channel[]).map((c, i) => {
              const val = sales
                .filter((s: any) => s.channel === c)
                .reduce((a: any, s: any) => a + s.total, 0);
              return (
                <div key={c}>
                  <span>
                    {c[0].toUpperCase() + c.slice(1)}
                    <b>{money(val)}</b>
                  </span>
                  <i>
                    <em
                      style={{
                        width: `${today ? Math.max(8, (val / today) * 100) : 0}%`,
                        background: ["#16a66a", "#2455d6", "#ef9b2d"][i],
                      }}
                    />
                  </i>
                </div>
              );
            })}
          </div>
        </Card>
        <Card
          title="Aktivitas terbaru"
          action="Lihat semua"
          onAction={() => setPage("history")}
        >
          <Activity data={data} variants={variants} locations={locations} role={role} outletId={outletId} />
        </Card>
      </section>
    </>
  );
}
const Stat = ({ label, value, sub, tone = "green" }: any) => (
  <article className={`stat ${tone}`}>
    <small>{label}</small>
    <b>{value}</b>
    <span>{sub}</span>
  </article>
);
const Card = ({ title, action, onAction, children }: any) => (
  <article className="card">
    <div className="card-head">
      <h3>{title}</h3>
      {action && <button onClick={onAction}>{action}</button>}
    </div>
    {children}
  </article>
);
function Activity({ data, variants, locations, role, outletId }: any) {
  const movements = role === "pic" && outletId 
    ? data.movements.filter((m: any) => m.locationId === outletId)
    : data.movements;
  return (
    <div className="activity">
      {movements.slice(0, 5).map((m: any) => (
        <div key={m.id}>
          <i className={m.quantity >= 0 ? "in" : "out"}>
            {m.quantity >= 0 ? "+" : "−"}
          </i>
          <div>
            <b>
              {m.type} · {variants[m.variantId]?.name}
            </b>
            <span>
              {locations[m.locationId]?.name} · {m.note}
            </span>
          </div>
          <time>
            {new Date(m.createdAt).toLocaleTimeString("id-ID", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        </div>
      ))}
    </div>
  );
}

function Products({ data, open, edit }: any) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const categories = Array.from(new Set(data.products.map((p: any) => p.category))).sort();

  return (
    <PageBlock
      title="Daftar produk"
      desc="Kelola kategori, satuan, varian, dan harga jual."
      action="Tambah Produk"
      onAction={open}
    >
      <div style={{ display: 'flex', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <ListSearch value={search} setValue={setSearch} placeholder="Cari produk, varian, SKU, atau kategori" />
        </div>
        <select 
          style={{ width: '200px', height: '44px', borderRadius: '12px', border: '1px solid #d9e1e8', padding: '0 14px', outline: 'none', background: '#fff' }} 
          value={categoryFilter} 
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="all">Semua Kategori</option>
          {categories.map((c: any) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="product-grid">
        {data.products
          .filter((p: any) => categoryFilter === "all" || p.category === categoryFilter)
          .filter((p: any) => 
            `${p.name} ${p.category}`.toLowerCase().includes(search.toLowerCase()) || 
            p.variants.some((v:any) => `${v.name} ${v.sku}`.toLowerCase().includes(search.toLowerCase()))
          )
          .map((p: any) => (
            <article className="product-card clickable-card" key={p.id} onClick={() => edit(p.id)}>
              <button className="card-edit" aria-label={`Edit ${p.name}`} onClick={(e) => { e.stopPropagation(); edit(p.id); }}>
                <Settings size={18} />
              </button>
              
              <div className="product-head">
                <div className="product-img">
                  {p.imageUrl || p.variants[0]?.imageUrl ? (
                    <img src={p.imageUrl || p.variants[0]?.imageUrl} alt={p.name} loading="lazy" />
                  ) : (
                    p.name.slice(0, 2).toUpperCase()
                  )}
                </div>
                
                <div className="product-info">
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span className="badge">{p.category}</span>
                    {!p.active && <span className="status danger">Nonaktif</span>}
                  </div>
                  <h3>{p.name}</h3>
                </div>
              </div>

              <div className="product-variants">
                <div className="variant-count">{p.variants.length} Varian</div>
                {p.variants.map((v: any) => (
                  <div key={v.id} className="variant-item">
                    <div>
                      <b>{v.name} {v.active === false && <span className="inactive-badge">(Nonaktif)</span>}</b>
                      <code>{v.sku}</code>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <strong>{money(v.price)}</strong>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                        Stok: {data.balances?.filter((b: any) => b.variantId === v.id).reduce((sum: number, b: any) => sum + b.quantity, 0) || 0} {p.unit || 'Pcs'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </article>
        ))}
      </div>
    </PageBlock>
  );
}
function LocationsPage({ data, open, edit }: any) {
  const [search, setSearch] = useState("");
  const rows = data.locations.filter((x: any) =>
    `${x.name} ${x.address || ""}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <PageBlock
      title="Lokasi usaha"
      desc="Tambahkan, edit, atau nonaktifkan gudang dan outlet tanpa menghapus histori."
      action="Tambah Lokasi"
      onAction={open}
    >
      <ListSearch
        value={search}
        setValue={setSearch}
        placeholder="Cari lokasi atau alamat"
      />
      <div className="user-grid">
        {rows.map((location: any) => (
          <article className="clickable-card" key={location.id} onClick={() => edit(location.id)}>
            <div className="location-icon">
              {location.type === "warehouse" ? <Warehouse /> : <Store />}
            </div>
            <div>
              <h3>{location.name}</h3>
              <p>
                {location.address || (location.type === "warehouse"
                  ? "Gudang"
                  : "Outlet / cabang")}
              </p>
              <span className={`status ${location.active ? "ok" : "danger"}`}>
                {location.active ? "Aktif" : "Nonaktif"}
              </span>
            </div>
            <button
              className="icon-btn user-edit"
              aria-label={`Edit ${location.name}`}
            >
              <Settings />
            </button>
          </article>
        ))}
      </div>
    </PageBlock>
  );
}
function ReceiptsPage({ data, variants, locations, open, edit, cancel }: any) {
  const [search, setSearch] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [filterSource, setFilterSource] = useState("");
  
  const [sortCol, setSortCol] = useState<string>("date");
  const [sortDesc, setSortDesc] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    setPage(1);
  }, [search, filterStartDate, filterEndDate, filterSource]);

  const rows = (data.receipts || []).filter((x: any) => {
    const matchSearch = `${x.supplierName || ""} ${locations[x.locationId]?.name || ""} ${variants[x.variantId]?.name || ""}`
      .toLowerCase()
      .includes(search.toLowerCase());
    
    let matchDate = true;
    const itemDate = new Date(x.createdAt);
    if (filterStartDate) {
      const start = new Date(`${filterStartDate}T00:00:00`);
      matchDate = matchDate && itemDate >= start;
    }
    if (filterEndDate) {
      const end = new Date(`${filterEndDate}T23:59:59`);
      matchDate = matchDate && itemDate <= end;
    }

    const matchSource = filterSource ? x.sourceType === filterSource : true;
    return matchSearch && matchDate && matchSource;
  });

  const totalTransaksi = rows.length;
  const totalItemMasuk = rows.reduce((acc: number, r: any) => acc + (r.status !== 'cancelled' ? r.quantity : 0), 0);
  const totalNilai = rows.reduce((acc: number, r: any) => acc + (r.status !== 'cancelled' ? r.quantity * r.unitCost : 0), 0);

  const sortedRows = [...rows].sort((a, b) => {
    let valA: any, valB: any;
    if (sortCol === "date") { valA = new Date(a.createdAt).getTime(); valB = new Date(b.createdAt).getTime(); }
    else if (sortCol === "source") { valA = a.sourceType === "production" ? "Hasil produksi" : a.supplierName || ""; valB = b.sourceType === "production" ? "Hasil produksi" : b.supplierName || ""; }
    else if (sortCol === "location") { valA = locations[a.locationId]?.name || ""; valB = locations[b.locationId]?.name || ""; }
    else if (sortCol === "product") { valA = variants[a.variantId]?.productName || ""; valB = variants[b.variantId]?.productName || ""; }
    else if (sortCol === "qty") { valA = a.quantity; valB = b.quantity; }
    else if (sortCol === "value") { valA = a.quantity * a.unitCost; valB = b.quantity * b.unitCost; }
    else if (sortCol === "status") { valA = a.status; valB = b.status; }
    else if (sortCol === "user") { valA = a.createdBy || ""; valB = b.createdBy || ""; }
    else { valA = 0; valB = 0; }

    if (valA < valB) return sortDesc ? 1 : -1;
    if (valA > valB) return sortDesc ? -1 : 1;
    return 0;
  });

  const totalPages = Math.ceil(sortedRows.length / ITEMS_PER_PAGE) || 1;
  const paginatedRows = sortedRows.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const Th = ({ col, label }: { col: string; label: string }) => (
    <th
      style={{ cursor: "pointer", userSelect: "none" }}
      onClick={() => {
        if (sortCol === col) setSortDesc(!sortDesc);
        else { setSortCol(col); setSortDesc(true); }
      }}
    >
      {label} {sortCol === col ? (sortDesc ? "↓" : "↑") : ""}
    </th>
  );

  return (
    <PageBlock
      title="Stok masuk"
      desc="Catat pembelian supplier atau hasil produksi tanpa menggunakan stock opname."
      action="Catat Stok Masuk"
      onAction={open}
    >
      <div className="stats-grid compact">
        <Stat
          label="Total Transaksi"
          value={totalTransaksi.toString()}
          sub="Sesuai filter"
        />
        <Stat
          label="Total Item Masuk"
          value={totalItemMasuk.toString()}
          sub="Tidak termasuk batal"
        />
        <Stat
          label="Total Nilai"
          value={money(totalNilai)}
          sub="Estimasi modal stok"
        />
      </div>
      <div className="filters">
        <ListSearch
          value={search}
          setValue={setSearch}
          placeholder="Cari supplier, lokasi, atau produk"
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>DARI</span>
          <input
            type="date"
            value={filterStartDate}
            onChange={(e) => setFilterStartDate(e.target.value)}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>HINGGA</span>
          <input
            type="date"
            value={filterEndDate}
            onChange={(e) => setFilterEndDate(e.target.value)}
          />
        </label>
        <select value={filterSource} onChange={e => setFilterSource(e.target.value)}>
           <option value="">Semua Sumber</option>
           <option value="supplier">Pembelian Supplier</option>
           <option value="production">Hasil Produksi</option>
        </select>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <Th col="date" label="Tanggal" />
              <Th col="source" label="Sumber" />
              <Th col="location" label="Lokasi" />
              <Th col="product" label="Produk" />
              <Th col="qty" label="Jumlah" />
              <Th col="value" label="Nilai" />
              <Th col="status" label="Status" />
              <Th col="user" label="Penginput" />
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {paginatedRows.length ? (
              paginatedRows.map((item: any) => (
                <tr key={item.id}>
                  <td>{new Date(item.createdAt).toLocaleString("id-ID")}</td>
                  <td>
                    <b>
                      {item.sourceType === "production"
                        ? "Hasil produksi"
                        : item.supplierName || "Supplier"}
                    </b>
                  </td>
                  <td>{locations[item.locationId]?.name}</td>
                  <td>
                    {variants[item.variantId]?.productName} ·{" "}
                    {variants[item.variantId]?.name}
                  </td>
                  <td>{qty(item.quantity, variants[item.variantId]?.unit)}</td>
                  <td>{money(item.quantity * item.unitCost)}</td>
                  <td>
                    <span
                      className={`status ${item.status === "cancelled" ? "danger" : "ok"}`}
                    >
                      {item.status === "cancelled" ? "Dibatalkan" : "Selesai"}
                    </span>
                  </td>
                  <td>{item.createdBy || '-'}</td>
                  <td>
                    {item.status !== "cancelled" && (
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                          className="table-action"
                          onClick={() => edit(item.id)}
                        >
                          Edit
                        </button>
                        <button
                          className="table-action danger-text"
                          onClick={() => cancel(item.id)}
                        >
                          Batalkan
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <Empty text="Belum ada stok masuk." />
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0' }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            Menampilkan {(page - 1) * ITEMS_PER_PAGE + 1} - {Math.min(page * ITEMS_PER_PAGE, sortedRows.length)} dari {sortedRows.length} data
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="secondary"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Sebelumnya
            </button>
            <button
              className="secondary"
              disabled={page === totalPages}
              onClick={() => setPage(page + 1)}
            >
              Selanjutnya
            </button>
          </div>
        </div>
      )}
    </PageBlock>
  );
}
function ReturnsPage({ data, variants, locations, open, cancel, role, outletId }: any) {
  const [search, setSearch] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  
  const [sortCol, setSortCol] = useState<string>("date");
  const [sortDesc, setSortDesc] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    setPage(1);
  }, [search, filterStartDate, filterEndDate]);

  const isPic = ["pic", "warehouse", "cashier", "admin"].includes(role) && outletId;
  const filteredReturns = isPic ? (data.returns || []).filter((x: any) => x.locationId === outletId) : (data.returns || []);
  const rows = filteredReturns.filter((x: any) => {
    const matchSearch = `${x.reason} ${locations[x.locationId]?.name || ""} ${variants[x.variantId]?.name || ""}`
      .toLowerCase()
      .includes(search.toLowerCase());
      
    let matchDate = true;
    const itemDate = new Date(x.createdAt);
    if (filterStartDate) {
      const start = new Date(`${filterStartDate}T00:00:00`);
      matchDate = matchDate && itemDate >= start;
    }
    if (filterEndDate) {
      const end = new Date(`${filterEndDate}T23:59:59`);
      matchDate = matchDate && itemDate <= end;
    }

    return matchSearch && matchDate;
  });

  const totalRetur = rows.length;
  const totalItem = rows.reduce((acc: number, r: any) => acc + (r.status !== 'cancelled' ? r.quantity : 0), 0);

  const sortedRows = [...rows].sort((a, b) => {
    let valA: any, valB: any;
    if (sortCol === "date") { valA = new Date(a.createdAt).getTime(); valB = new Date(b.createdAt).getTime(); }
    else if (sortCol === "type") { valA = a.type; valB = b.type; }
    else if (sortCol === "location") { valA = locations[a.locationId]?.name || ""; valB = locations[b.locationId]?.name || ""; }
    else if (sortCol === "product") { valA = variants[a.variantId]?.productName || ""; valB = variants[b.variantId]?.productName || ""; }
    else if (sortCol === "qty") { valA = a.quantity; valB = b.quantity; }
    else if (sortCol === "reason") { valA = a.reason; valB = b.reason; }
    else if (sortCol === "status") { valA = a.status; valB = b.status; }
    else { valA = 0; valB = 0; }

    if (valA < valB) return sortDesc ? 1 : -1;
    if (valA > valB) return sortDesc ? -1 : 1;
    return 0;
  });

  const totalPages = Math.ceil(sortedRows.length / ITEMS_PER_PAGE) || 1;
  const paginatedRows = sortedRows.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const Th = ({ col, label }: { col: string; label: string }) => (
    <th
      style={{ cursor: "pointer", userSelect: "none" }}
      onClick={() => {
        if (sortCol === col) setSortDesc(!sortDesc);
        else { setSortCol(col); setSortDesc(true); }
      }}
    >
      {label} {sortCol === col ? (sortDesc ? "↓" : "↑") : ""}
    </th>
  );
  return (
    <PageBlock
      title="Retur barang"
      desc="Retur pelanggan menambah stok; retur supplier mengurangi stok."
      action="Catat Retur"
      onAction={open}
    >
      <div className="stats-grid compact">
        <Stat
          label="Total Retur"
          value={totalRetur.toString()}
          sub="Sesuai filter"
        />
        <Stat
          label="Total Item Retur"
          value={totalItem.toString()}
          sub="Tidak termasuk batal"
        />
        <Stat
          label="Selisih Retur"
          value={totalItem.toString()}
          sub="Barang berputar"
        />
      </div>
      <div className="filters">
        <ListSearch
          value={search}
          setValue={setSearch}
          placeholder="Cari produk, lokasi, atau alasan"
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>DARI</span>
          <input
            type="date"
            value={filterStartDate}
            onChange={(e) => setFilterStartDate(e.target.value)}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>HINGGA</span>
          <input
            type="date"
            value={filterEndDate}
            onChange={(e) => setFilterEndDate(e.target.value)}
          />
        </label>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <Th col="date" label="Tanggal" />
              <Th col="type" label="Jenis" />
              <Th col="location" label="Lokasi" />
              <Th col="product" label="Produk" />
              <Th col="qty" label="Jumlah" />
              <Th col="reason" label="Alasan" />
              <Th col="status" label="Status" />
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {paginatedRows.length ? (
              paginatedRows.map((item: any) => (
                <tr key={item.id}>
                  <td>{new Date(item.createdAt).toLocaleString("id-ID")}</td>
                  <td>
                    <b>
                      {item.type === "customer"
                        ? "Dari pelanggan"
                        : "Ke supplier"}
                    </b>
                  </td>
                  <td>{locations[item.locationId]?.name}</td>
                  <td>
                    {variants[item.variantId]?.productName} ·{" "}
                    {variants[item.variantId]?.name}
                  </td>
                  <td>{qty(item.quantity, variants[item.variantId]?.unit)}</td>
                  <td>{item.reason}</td>
                  <td>
                    <span
                      className={`status ${item.status === "cancelled" ? "danger" : "ok"}`}
                    >
                      {item.status === "cancelled" ? "Dibatalkan" : "Selesai"}
                    </span>
                  </td>
                  <td>
                    {item.status !== "cancelled" && (
                      <button
                        className="table-action danger-text"
                        onClick={() => cancel(item.id)}
                      >
                        Batalkan
                      </button>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <Empty text="Belum ada retur barang." />
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0' }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            Menampilkan {(page - 1) * ITEMS_PER_PAGE + 1} - {Math.min(page * ITEMS_PER_PAGE, sortedRows.length)} dari {sortedRows.length} data
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="secondary"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Sebelumnya
            </button>
            <button
              className="secondary"
              disabled={page === totalPages}
              onClick={() => setPage(page + 1)}
            >
              Selanjutnya
            </button>
          </div>
        </div>
      )}
    </PageBlock>
  );
}
function BusinessPage({ data, open }: any) {
  const profile = data.business || {};
  return (
    <PageBlock
      title="Identitas usaha"
      desc="Informasi ini digunakan pada dokumen dan ruang kerja VEINSTOCK."
      action="Edit Profil Usaha"
      onAction={open}
    >
      <article className="business-card">
        <div className="business-logo">
          {profile.logoUrl ? (
            <img src={profile.logoUrl} alt={profile.name} />
          ) : (
            String(profile.name || "U")
              .slice(0, 2)
              .toUpperCase()
          )}
        </div>
        <div>
          <h2>{profile.name || "Usaha Saya"}</h2>
          <p>{profile.ownerName || "-"}</p>
          <span>
            {profile.phone || "Nomor telepon belum diisi"} ·{" "}
            {profile.email || "Email belum diisi"}
          </span>
          <address>{profile.address || "Alamat belum diisi"}</address>
        </div>
      </article>
    </PageBlock>
  );
}
function Stock({ data, setData, variants, role, outletId }: any) {
  const isPic = ["pic", "warehouse", "cashier", "admin"].includes(role) && outletId;
  const myLocations = isPic ? data.locations.filter((l: any) => l.id === outletId) : data.locations;
  const [loc, setLoc] = useState(myLocations[0]?.id || data.locations[0]?.id);
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<string>("variant");
  const [sortDesc, setSortDesc] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    setPage(1);
  }, [search, loc]);

  const rows = data.balances.filter(
    (b: any) =>
      b.locationId === loc &&
      `${variants[b.variantId]?.name} ${variants[b.variantId]?.sku}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );

  const totalVariants = rows.length;
  const lowStockVariants = rows.filter((b: any) => b.quantity < minimumFor(variants[b.variantId], b.locationId)).length;

  const sortedRows = [...rows].sort((a, b) => {
    const vA = variants[a.variantId];
    const vB = variants[b.variantId];
    const minA = minimumFor(vA, a.locationId);
    const minB = minimumFor(vB, b.locationId);

    let valA: any, valB: any;
    if (sortCol === "variant") { valA = vA?.name || ""; valB = vB?.name || ""; }
    else if (sortCol === "sku") { valA = vA?.sku || ""; valB = vB?.sku || ""; }
    else if (sortCol === "balance") { valA = a.quantity; valB = b.quantity; }
    else if (sortCol === "min") { valA = minA; valB = minB; }
    else if (sortCol === "status") { valA = a.quantity < minA ? 0 : 1; valB = b.quantity < minB ? 0 : 1; }
    else { valA = 0; valB = 0; }

    if (valA < valB) return sortDesc ? 1 : -1;
    if (valA > valB) return sortDesc ? -1 : 1;
    return 0;
  });

  const totalPages = Math.ceil(sortedRows.length / ITEMS_PER_PAGE) || 1;
  const paginatedRows = sortedRows.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const Th = ({ col, label }: { col: string; label: string }) => (
    <th
      style={{ cursor: "pointer", userSelect: "none" }}
      onClick={() => {
        if (sortCol === col) setSortDesc(!sortDesc);
        else { setSortCol(col); setSortDesc(true); }
      }}
    >
      {label} {sortCol === col ? (sortDesc ? "↓" : "↑") : ""}
    </th>
  );
  return (
    <PageBlock
      title="Saldo stok aktual"
      desc="Saldo dihitung otomatis dari seluruh pergerakan."
    >
      <div className="stats-grid compact">
        <Stat
          label="Total Varian"
          value={totalVariants.toString()}
          sub="Di lokasi ini"
        />
        <Stat
          label="Stok Menipis"
          value={lowStockVariants.toString()}
          sub="Perlu re-stock"
        />
      </div>
      <div className="filters">
        <select value={loc} onChange={(e) => setLoc(e.target.value)}>
          {myLocations.map((l: any) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <ListSearch
          value={search}
          setValue={setSearch}
          placeholder="Cari varian atau SKU"
        />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <Th col="variant" label="Varian" />
              <Th col="sku" label="SKU" />
              <Th col="balance" label="Saldo aktual" />
              <Th col="min" label="Minimum" />
              <Th col="status" label="Status" />
            </tr>
          </thead>
          <tbody>
            {paginatedRows.length ? (
              paginatedRows.map((b: any) => {
                const v = variants[b.variantId],
                  minimum = minimumFor(v, b.locationId),
                  low = b.quantity < minimum;
                return (
                  <tr key={`${b.locationId}-${b.variantId}`}>
                    <td>
                      <b>{v.productName} - {v.name}</b>
                    </td>
                    <td>
                      <code>{v.sku}</code>
                    </td>
                    <td>
                      <strong>{qty(b.quantity, v.unit)}</strong>
                    </td>
                    <td>
                      {role === "owner" ? (
                        <input
                          aria-label={`Minimum stok ${v.name}`}
                          type="number"
                          min="0"
                          value={String(minimum)}
                          onChange={(e) => {
                            e.target.value = e.target.value.replace(/^0+(?=\d)/, '');
                            const next = Number(e.target.value);
                            if (!Number.isFinite(next) || next < 0) return;
                            setData((current: AppData) => ({
                              ...current,
                              products: current.products.map((product) => ({
                                ...product,
                                variants: product.variants.map((variant) =>
                                  variant.id === v.id
                                    ? { ...variant, minStockByLocation: { ...variant.minStockByLocation, [b.locationId]: next } }
                                    : variant,
                                ),
                              })),
                            }));
                          }}
                        />
                      ) : qty(minimum, v.unit)}
                    </td>
                    <td>
                      <span className={`status ${low ? "danger" : "ok"}`}>
                        {low ? "Menipis" : "Aman"}
                      </span>
                    </td>
                  </tr>
                );
              })
            ) : (
              <Empty text="Belum ada saldo stok di lokasi ini." />
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0' }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            Menampilkan {(page - 1) * ITEMS_PER_PAGE + 1} - {Math.min(page * ITEMS_PER_PAGE, sortedRows.length)} dari {sortedRows.length} data
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="secondary"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Sebelumnya
            </button>
            <button
              className="secondary"
              disabled={page === totalPages}
              onClick={() => setPage(page + 1)}
            >
              Selanjutnya
            </button>
          </div>
        </div>
      )}
    </PageBlock>
  );
}
function Transfers({
  data,
  setData,
  variants,
  locations,
  open,
  notify,
  user,
  role,
  outletId,
  cancel,
  detail,
  helpAction,
}: any) {
  const [search, setSearch] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  
  const [sortCol, setSortCol] = useState<string>("date");
  const [sortDesc, setSortDesc] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    setPage(1);
  }, [search, filterStartDate, filterEndDate]);

  const isPic = ["pic", "warehouse", "cashier", "admin"].includes(role) && outletId;
  const filteredTransfers = isPic
    ? data.transfers.filter((t: any) => t.fromId === outletId || t.toId === outletId)
    : data.transfers;
  const rows = filteredTransfers.filter((t: any) => {
    const matchSearch = `${locations[t.fromId]?.name} ${locations[t.toId]?.name} ${variants[t.variantId]?.name}`
      .toLowerCase()
      .includes(search.toLowerCase());
      
    let matchDate = true;
    const itemDate = new Date(t.createdAt);
    if (filterStartDate) {
      const start = new Date(`${filterStartDate}T00:00:00`);
      matchDate = matchDate && itemDate >= start;
    }
    if (filterEndDate) {
      const end = new Date(`${filterEndDate}T23:59:59`);
      matchDate = matchDate && itemDate <= end;
    }

    return matchSearch && matchDate;
  });

  const totalTransfer = rows.length;
  const totalReceived = rows.filter((r: any) => r.status === 'received').length;
  const totalSent = rows.filter((r: any) => r.status === 'sent').length;

  const sortedRows = [...rows].sort((a, b) => {
    let valA: any, valB: any;
    if (sortCol === "date") { valA = new Date(a.createdAt).getTime(); valB = new Date(b.createdAt).getTime(); }
    else if (sortCol === "route") { valA = locations[a.fromId]?.name || ""; valB = locations[b.fromId]?.name || ""; }
    else if (sortCol === "product") { valA = variants[a.variantId]?.name || ""; valB = variants[b.variantId]?.name || ""; }
    else if (sortCol === "qty") { valA = a.quantity; valB = b.quantity; }
    else if (sortCol === "status") { valA = a.status; valB = b.status; }
    else { valA = 0; valB = 0; }

    if (valA < valB) return sortDesc ? 1 : -1;
    if (valA > valB) return sortDesc ? -1 : 1;
    return 0;
  });

  const totalPages = Math.ceil(sortedRows.length / ITEMS_PER_PAGE) || 1;
  const paginatedRows = sortedRows.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const Th = ({ col, label }: { col: string; label: string }) => (
    <th
      style={{ cursor: "pointer", userSelect: "none" }}
      onClick={() => {
        if (sortCol === col) setSortDesc(!sortDesc);
        else { setSortCol(col); setSortDesc(true); }
      }}
    >
      {label} {sortCol === col ? (sortDesc ? "↓" : "↑") : ""}
    </th>
  );
  const receive = (t: any) => {
    setData((d: any) => ({
      ...d,
      balances: adjustBalance(d.balances, t.toId, t.variantId, t.quantity),
      transfers: d.transfers.map((x: any) =>
        x.id === t.id
          ? { ...x, status: "received", receivedAt: new Date().toISOString() }
          : x,
      ),
      movements: [
        movement(
          t.variantId,
          t.toId,
          "Transfer diterima",
          t.quantity,
          `Dari ${locations[t.fromId].name}`,
          user,
        ),
        ...d.movements,
      ],
    }));
    notify("Transfer diterima, stok lokasi tujuan telah bertambah");
  };
  return (
    <PageBlock
      title="Transfer antar lokasi"
      desc="Stok tujuan bertambah setelah penerima mengonfirmasi barang."
      action="Buat Transfer"
      onAction={open}
    >
      <div className="stats-grid compact">
        <Stat
          label="Total Transfer"
          value={totalTransfer.toString()}
          sub="Sesuai filter"
        />
        <Stat
          label="Selesai (Diterima)"
          value={totalReceived.toString()}
          sub="Stok sudah masuk"
        />
        <Stat
          label="Dalam Perjalanan"
          value={totalSent.toString()}
          sub="Menunggu konfirmasi"
        />
      </div>

      <div style={{ background: '#f0f7f4', border: '1px solid #18a66a33', padding: '12px 16px', borderRadius: '12px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <LifeBuoy color="var(--green)" size={20} />
          <span style={{ fontSize: '13px', color: 'var(--navy)', fontWeight: 600 }}>Butuh bantuan mengirim atau menerima stok?</span>
        </div>
        <button className="small-primary" onClick={helpAction} style={{ background: 'white', border: '1px solid var(--line)', color: 'var(--navy)' }}>Baca Panduan Transfer</button>
      </div>

      <div className="filters">
        <ListSearch
          value={search}
          setValue={setSearch}
          placeholder="Cari rute atau produk"
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>DARI</span>
          <input
            type="date"
            value={filterStartDate}
            onChange={(e) => setFilterStartDate(e.target.value)}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>HINGGA</span>
          <input
            type="date"
            value={filterEndDate}
            onChange={(e) => setFilterEndDate(e.target.value)}
          />
        </label>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <Th col="date" label="Tanggal" />
              <Th col="route" label="Rute" />
              <Th col="product" label="Varian" />
              <Th col="qty" label="Jumlah" />
              <Th col="status" label="Status" />
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {paginatedRows.length ? (
              paginatedRows.map((t: any) => (
                <tr key={t.id}>
                  <td>{new Date(t.createdAt).toLocaleDateString("id-ID")}</td>
                  <td>
                    <b>{locations[t.fromId]?.name}</b>
                    <br />
                    <small>ke {locations[t.toId]?.name}</small>
                  </td>
                  <td>{variants[t.variantId]?.productName} - {variants[t.variantId]?.name}</td>
                  <td>
                    <strong>
                      {qty(t.quantity, variants[t.variantId]?.unit)}
                    </strong>
                  </td>
                  <td>
                    <span
                      className={`status ${t.status === "cancelled" ? "danger" : t.status === "sent" ? "wait" : "ok"}`}
                    >
                      {t.status === "cancelled"
                        ? "Dibatalkan"
                        : t.status === "sent"
                          ? "Dalam perjalanan"
                          : "Diterima"}
                    </span>
                  </td>
                  <td className="actions-cell">
                    <button
                      className="table-action"
                      onClick={() => detail(t.id)}
                    >
                      Detail / Bukti
                    </button>
                    {t.status === "sent" &&
                      (role === "owner" || t.toId === outletId) && (
                        <button
                          className="small-primary"
                          onClick={() => receive(t)}
                        >
                          Terima
                        </button>
                      )}
                    {t.status !== "cancelled" && role === "owner" && (
                      <button
                        className="table-action danger-text"
                        onClick={() => cancel(t.id)}
                      >
                        Batalkan
                      </button>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <Empty text="Belum ada transfer stok." />
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0' }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            Menampilkan {(page - 1) * ITEMS_PER_PAGE + 1} - {Math.min(page * ITEMS_PER_PAGE, sortedRows.length)} dari {sortedRows.length} data
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="secondary"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Sebelumnya
            </button>
            <button
              className="secondary"
              disabled={page === totalPages}
              onClick={() => setPage(page + 1)}
            >
              Selanjutnya
            </button>
          </div>
        </div>
      )}
    </PageBlock>
  );
}
function Sales({ data, variants, locations, open, cancel, detail, role, outletId, canCancel }: any) {
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState("all");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  
  const [sortCol, setSortCol] = useState<string>("date");
  const [sortDesc, setSortDesc] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    setPage(1);
  }, [search, channel, filterStartDate, filterEndDate]);

  const isPic = ["pic", "warehouse", "cashier", "admin"].includes(role) && outletId;
  const filteredSales = isPic ? data.sales.filter((s: any) => s.locationId === outletId) : data.sales;
  const rows = filteredSales.filter((s: any) => {
    const matchChannel = channel === "all" || s.channel === channel;
    const matchSearch = `${locations[s.locationId]?.name} ${s.channel} ${variants[s.items[0]?.variantId]?.name}`
      .toLowerCase()
      .includes(search.toLowerCase());
      
    let matchDate = true;
    const itemDate = new Date(s.createdAt);
    if (filterStartDate) {
      const start = new Date(`${filterStartDate}T00:00:00`);
      matchDate = matchDate && itemDate >= start;
    }
    if (filterEndDate) {
      const end = new Date(`${filterEndDate}T23:59:59`);
      matchDate = matchDate && itemDate <= end;
    }

    return matchChannel && matchSearch && matchDate;
  });

  const totalSales = rows.length;
  const totalRevenue = rows.reduce((acc: number, s: any) => acc + (s.status !== 'voided' ? s.total : 0), 0);

  const sortedRows = [...rows].sort((a, b) => {
    let valA: any, valB: any;
    if (sortCol === "date") { valA = new Date(a.createdAt).getTime(); valB = new Date(b.createdAt).getTime(); }
    else if (sortCol === "location") { valA = locations[a.locationId]?.name || ""; valB = locations[b.locationId]?.name || ""; }
    else if (sortCol === "channel") { valA = a.channel; valB = b.channel; }
    else if (sortCol === "item") { valA = variants[a.items[0]?.variantId]?.name || ""; valB = variants[b.items[0]?.variantId]?.name || ""; }
    else if (sortCol === "payment") { valA = a.payment; valB = b.payment; }
    else if (sortCol === "total") { valA = a.total; valB = b.total; }
    else if (sortCol === "status") { valA = a.status; valB = b.status; }
    else { valA = 0; valB = 0; }

    if (valA < valB) return sortDesc ? 1 : -1;
    if (valA > valB) return sortDesc ? -1 : 1;
    return 0;
  });

  const totalPages = Math.ceil(sortedRows.length / ITEMS_PER_PAGE) || 1;
  const paginatedRows = sortedRows.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const Th = ({ col, label }: { col: string; label: string }) => (
    <th
      style={{ cursor: "pointer", userSelect: "none" }}
      onClick={() => {
        if (sortCol === col) setSortDesc(!sortDesc);
        else { setSortCol(col); setSortDesc(true); }
      }}
    >
      {label} {sortCol === col ? (sortDesc ? "↓" : "↑") : ""}
    </th>
  );
  return (
    <PageBlock
      title="Transaksi penjualan"
      desc="Offline, online, dan reseller tercatat dalam satu laporan."
      action="Catat Penjualan"
      onAction={open}
    >
      <div className="stats-grid compact">
        <Stat
          label="Total Transaksi"
          value={totalSales.toString()}
          sub="Sesuai filter"
        />
        <Stat
          label="Total Pendapatan"
          value={money(totalRevenue)}
          sub="Hanya transaksi selesai"
        />
      </div>
      <div className="filters">
        <select value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="all">Semua kanal</option>
          <option value="offline">Offline</option>
          <option value="online">Online</option>
          <option value="reseller">Reseller</option>
        </select>
        <ListSearch
          value={search}
          setValue={setSearch}
          placeholder="Cari lokasi atau produk"
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>DARI</span>
          <input
            type="date"
            value={filterStartDate}
            onChange={(e) => setFilterStartDate(e.target.value)}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>HINGGA</span>
          <input
            type="date"
            value={filterEndDate}
            onChange={(e) => setFilterEndDate(e.target.value)}
          />
        </label>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <Th col="date" label="Waktu" />
              <Th col="location" label="Lokasi" />
              <Th col="channel" label="Kanal" />
              <Th col="item" label="Item" />
              <Th col="payment" label="Pembayaran" />
              <Th col="total" label="Total" />
              <Th col="status" label="Status" />
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {paginatedRows.length ? (
              paginatedRows.map((s: any) => (
                <tr key={s.id}>
                  <td>{new Date(s.createdAt).toLocaleString("id-ID")}</td>
                  <td>{locations[s.locationId]?.name}</td>
                  <td>
                    <span className="status info">{s.channel}</span>
                  </td>
                  <td>
                    {variants[s.items[0].variantId]?.productName} - {variants[s.items[0].variantId]?.name}
                    <small className="block">
                      {qty(
                        s.items[0].quantity,
                        variants[s.items[0].variantId]?.unit,
                      )}
                    </small>
                  </td>
                  <td>{s.payment}</td>
                  <td>
                    <strong>{money(s.total)}</strong>
                  </td>
                  <td>
                    <span
                      className={`status ${s.status === "voided" ? "danger" : "ok"}`}
                    >
                      {s.status === "voided" ? "Dibatalkan" : "Selesai"}
                    </span>
                  </td>
                  <td className="actions-cell">
                    <button
                      className="table-action"
                      onClick={() => detail(s.id)}
                    >
                      Detail
                    </button>
                    {canCancel && s.status !== "voided" && (
                      <button
                        className="table-action danger-text"
                        onClick={() => cancel(s.id)}
                      >
                        Batalkan
                      </button>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <Empty text="Belum ada penjualan." />
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0' }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            Menampilkan {(page - 1) * ITEMS_PER_PAGE + 1} - {Math.min(page * ITEMS_PER_PAGE, sortedRows.length)} dari {sortedRows.length} data
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="secondary"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Sebelumnya
            </button>
            <button
              className="secondary"
              disabled={page === totalPages}
              onClick={() => setPage(page + 1)}
            >
              Selanjutnya
            </button>
          </div>
        </div>
      )}
    </PageBlock>
  );
}
function Opname({ data, variants, locations, open, edit, cancel, role, outletId, canCorrect }: any) {
  const [search, setSearch] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  
  const [sortCol, setSortCol] = useState<string>("date");
  const [sortDesc, setSortDesc] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    setPage(1);
  }, [search, filterStartDate, filterEndDate]);

  const isPic = ["pic", "warehouse", "cashier", "admin"].includes(role) && outletId;
  const filteredOpname = isPic ? data.stockCounts.filter((o: any) => o.locationId === outletId) : data.stockCounts;
  
  const rows = filteredOpname.filter((o: any) => {
    const matchSearch = `${o.reason} ${locations[o.locationId]?.name || ""} ${variants[o.variantId]?.name || ""}`
      .toLowerCase()
      .includes(search.toLowerCase());
      
    let matchDate = true;
    const itemDate = new Date(o.createdAt);
    if (filterStartDate) {
      const start = new Date(`${filterStartDate}T00:00:00`);
      matchDate = matchDate && itemDate >= start;
    }
    if (filterEndDate) {
      const end = new Date(`${filterEndDate}T23:59:59`);
      matchDate = matchDate && itemDate <= end;
    }

    return matchSearch && matchDate;
  });

  const totalOpname = rows.length;
  const totalDiff = rows.reduce((acc: number, o: any) => acc + (o.status !== 'cancelled' ? o.difference : 0), 0);

  const sortedRows = [...rows].sort((a, b) => {
    let valA: any, valB: any;
    if (sortCol === "date") { valA = new Date(a.createdAt).getTime(); valB = new Date(b.createdAt).getTime(); }
    else if (sortCol === "location") { valA = locations[a.locationId]?.name || ""; valB = locations[b.locationId]?.name || ""; }
    else if (sortCol === "product") { valA = variants[a.variantId]?.name || ""; valB = variants[b.variantId]?.name || ""; }
    else if (sortCol === "system") { valA = a.systemQty; valB = b.systemQty; }
    else if (sortCol === "actual") { valA = a.actualQty; valB = b.actualQty; }
    else if (sortCol === "diff") { valA = a.difference; valB = b.difference; }
    else if (sortCol === "reason") { valA = a.reason; valB = b.reason; }
    else if (sortCol === "user") { valA = a.createdBy || ""; valB = b.createdBy || ""; }
    else { valA = 0; valB = 0; }

    if (valA < valB) return sortDesc ? 1 : -1;
    if (valA > valB) return sortDesc ? -1 : 1;
    return 0;
  });

  const totalPages = Math.ceil(sortedRows.length / ITEMS_PER_PAGE) || 1;
  const paginatedRows = sortedRows.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const Th = ({ col, label }: { col: string; label: string }) => (
    <th
      style={{ cursor: "pointer", userSelect: "none" }}
      onClick={() => {
        if (sortCol === col) setSortDesc(!sortDesc);
        else { setSortCol(col); setSortDesc(true); }
      }}
    >
      {label} {sortCol === col ? (sortDesc ? "↓" : "↑") : ""}
    </th>
  );
  return (
    <PageBlock
      title="Stock opname"
      desc="Bandingkan stok sistem dan fisik tanpa menghapus histori."
      action="Mulai Opname"
      onAction={open}
    >
      <div className="stats-grid compact">
        <Stat
          label="Total Riwayat Opname"
          value={totalOpname.toString()}
          sub="Sesuai filter"
        />
        <Stat
          label="Total Selisih"
          value={totalDiff.toString()}
          sub="Unit barang"
        />
      </div>
      <div className="filters">
        <ListSearch
          value={search}
          setValue={setSearch}
          placeholder="Cari lokasi, produk, alasan"
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>DARI</span>
          <input
            type="date"
            value={filterStartDate}
            onChange={(e) => setFilterStartDate(e.target.value)}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>HINGGA</span>
          <input
            type="date"
            value={filterEndDate}
            onChange={(e) => setFilterEndDate(e.target.value)}
          />
        </label>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <Th col="date" label="Tanggal" />
              <Th col="location" label="Lokasi" />
              <Th col="product" label="Varian" />
              <Th col="system" label="Sistem" />
              <Th col="actual" label="Fisik" />
              <Th col="diff" label="Selisih" />
              <Th col="reason" label="Alasan" />
              <Th col="user" label="Penginput" />
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {paginatedRows.length ? (
              paginatedRows.map((o: any) => (
                <tr key={o.id} className={o.status === "cancelled" ? "cancelled" : ""}>
                  <td>{new Date(o.createdAt).toLocaleString("id-ID")}</td>
                  <td>{locations[o.locationId]?.name}</td>
                  <td>{variants[o.variantId]?.productName} - {variants[o.variantId]?.name}</td>
                  <td>{qty(o.systemQty, variants[o.variantId]?.unit)}</td>
                  <td>{qty(o.actualQty, variants[o.variantId]?.unit)}</td>
                  <td>
                    <strong
                      className={o.difference < 0 ? "negative" : "positive"}
                    >
                      {o.difference > 0 ? "+" : ""}
                      {qty(o.difference, variants[o.variantId]?.unit)}
                    </strong>
                  </td>
                  <td>{o.status === "cancelled" ? `Dibatalkan: ${o.cancelReason}` : o.reason}</td>
                  <td>{o.createdBy || '-'}</td>
                  <td>
                    <div className="table-actions">
                      {canCorrect && o.status !== "cancelled" && (
                        <>
                          <button onClick={() => edit(o.id)}>Edit</button>
                          <button className="danger" onClick={() => cancel(o.id)}>
                            Batalkan
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <Empty text="Belum ada stock opname." />
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0' }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            Menampilkan {(page - 1) * ITEMS_PER_PAGE + 1} - {Math.min(page * ITEMS_PER_PAGE, sortedRows.length)} dari {sortedRows.length} data
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="secondary"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Sebelumnya
            </button>
            <button
              className="secondary"
              disabled={page === totalPages}
              onClick={() => setPage(page + 1)}
            >
              Selanjutnya
            </button>
          </div>
        </div>
      )}
    </PageBlock>
  );
}
function HistoryPage({ data, variants, locations, role, outletId }: any) {
  const [search, setSearch] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  
  const [sortCol, setSortCol] = useState<string>("date");
  const [sortDesc, setSortDesc] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    setPage(1);
  }, [search, filterStartDate, filterEndDate]);

  const isPic = ["pic", "warehouse", "cashier", "admin"].includes(role) && outletId;
  const filteredMovements = isPic ? data.movements.filter((m: any) => m.locationId === outletId) : data.movements;
  
  const rows = filteredMovements.filter((m: any) => {
    const matchSearch = `${locations[m.locationId]?.name} ${variants[m.variantId]?.name} ${m.type} ${m.note} ${m.user}`
      .toLowerCase()
      .includes(search.toLowerCase());
      
    let matchDate = true;
    const itemDate = new Date(m.createdAt);
    if (filterStartDate) {
      const start = new Date(`${filterStartDate}T00:00:00`);
      matchDate = matchDate && itemDate >= start;
    }
    if (filterEndDate) {
      const end = new Date(`${filterEndDate}T23:59:59`);
      matchDate = matchDate && itemDate <= end;
    }

    return matchSearch && matchDate;
  });

  const totalMovements = rows.length;
  const totalIn = rows.reduce((acc: number, m: any) => acc + (m.quantity > 0 ? m.quantity : 0), 0);
  const totalOut = rows.reduce((acc: number, m: any) => acc + (m.quantity < 0 ? Math.abs(m.quantity) : 0), 0);

  const sortedRows = [...rows].sort((a, b) => {
    let valA: any, valB: any;
    if (sortCol === "date") { valA = new Date(a.createdAt).getTime(); valB = new Date(b.createdAt).getTime(); }
    else if (sortCol === "location") { valA = locations[a.locationId]?.name || ""; valB = locations[b.locationId]?.name || ""; }
    else if (sortCol === "product") { valA = variants[a.variantId]?.name || ""; valB = variants[b.variantId]?.name || ""; }
    else if (sortCol === "type") { valA = a.type; valB = b.type; }
    else if (sortCol === "qty") { valA = a.quantity; valB = b.quantity; }
    else if (sortCol === "user") { valA = a.user; valB = b.user; }
    else { valA = 0; valB = 0; }

    if (valA < valB) return sortDesc ? 1 : -1;
    if (valA > valB) return sortDesc ? -1 : 1;
    return 0;
  });

  const totalPages = Math.ceil(sortedRows.length / ITEMS_PER_PAGE) || 1;
  const paginatedRows = sortedRows.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const Th = ({ col, label }: { col: string; label: string }) => (
    <th
      style={{ cursor: "pointer", userSelect: "none" }}
      onClick={() => {
        if (sortCol === col) setSortDesc(!sortDesc);
        else { setSortCol(col); setSortDesc(true); }
      }}
    >
      {label} {sortCol === col ? (sortDesc ? "↓" : "↑") : ""}
    </th>
  );
  return (
    <PageBlock
      title="Jejak stok"
      desc="Setiap perubahan tersimpan permanen untuk audit operasional."
    >
      <div className="stats-grid compact">
        <Stat
          label="Total Jejak"
          value={totalMovements.toString()}
          sub="Sesuai filter"
        />
        <Stat
          label="Total Stok Masuk"
          value={totalIn.toString()}
          sub="Unit barang"
        />
        <Stat
          label="Total Stok Keluar"
          value={totalOut.toString()}
          sub="Unit barang"
        />
      </div>
      <div className="filters">
        <ListSearch
          value={search}
          setValue={setSearch}
          placeholder="Cari lokasi, produk, tipe, pengguna"
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>DARI</span>
          <input
            type="date"
            value={filterStartDate}
            onChange={(e) => setFilterStartDate(e.target.value)}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>HINGGA</span>
          <input
            type="date"
            value={filterEndDate}
            onChange={(e) => setFilterEndDate(e.target.value)}
          />
        </label>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <Th col="date" label="Waktu" />
              <Th col="location" label="Lokasi" />
              <Th col="product" label="Varian" />
              <Th col="type" label="Tipe" />
              <Th col="qty" label="Kuantitas" />
              <Th col="user" label="Pengguna" />
            </tr>
          </thead>
          <tbody>
            {paginatedRows.length ? (
              paginatedRows.map((m: any) => (
                <tr key={m.id || Math.random()}>
                  <td>{new Date(m.createdAt).toLocaleString("id-ID")}</td>
                  <td>{locations[m.locationId]?.name}</td>
                  <td>{variants[m.variantId]?.productName} - {variants[m.variantId]?.name}</td>
                  <td>
                    <b>{m.type === 'INITIAL_BALANCE' ? 'Saldo Awal' : m.type}</b>
                    <br />
                    <small>{m.type === 'INITIAL_BALANCE' ? 'Stok awal' : m.note}</small>
                  </td>
                  <td>
                    <strong className={m.quantity >= 0 ? "positive" : "negative"}>
                      {m.quantity > 0 ? "+" : ""}
                      {qty(m.quantity, variants[m.variantId]?.unit)}
                    </strong>
                  </td>
                  <td>{m.user}</td>
                </tr>
              ))
            ) : (
              <Empty text="Belum ada jejak stok." />
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0' }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            Menampilkan {(page - 1) * ITEMS_PER_PAGE + 1} - {Math.min(page * ITEMS_PER_PAGE, sortedRows.length)} dari {sortedRows.length} data
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="secondary"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Sebelumnya
            </button>
            <button
              className="secondary"
              disabled={page === totalPages}
              onClick={() => setPage(page + 1)}
            >
              Selanjutnya
            </button>
          </div>
        </div>
      )}
    </PageBlock>
  );
}
function Reports({ data, variants, locations, notify, role, outletId }: any) {
  const [period, setPeriod] = useState("month"),
    [location, setLocation] = useState("all"),
    [product, setProduct] = useState("all"),
    [channel, setChannel] = useState("all"),
    now = Date.now(),
    start =
      period === "day"
        ? now - 864e5
        : period === "week"
          ? now - 7 * 864e5
          : period === "month"
            ? now - 30 * 864e5
            : 0;
  const isPic = ["pic", "warehouse", "cashier", "admin"].includes(role) && outletId;
  const visibleLocations = isPic
    ? data.locations.filter((item: any) => item.id === outletId)
    : data.locations;
  const visibleBalances = isPic
    ? data.balances.filter((item: any) => item.locationId === outletId)
    : data.balances;
  const sales = data.sales.filter(
      (s: any) =>
        s.status !== "cancelled" &&
        (!isPic || s.locationId === outletId) &&
        new Date(s.createdAt).getTime() >= start &&
        (location === "all" || s.locationId === location) &&
        (channel === "all" || s.channel === channel) &&
        (product === "all" ||
          s.items.some((i: any) => i.variantId === product)),
    ),
    total = sales.reduce((a: number, s: any) => a + s.total, 0),
    receipts = (data.receipts || []).filter(
      (r: any) =>
        r.status !== "cancelled" &&
        (!isPic || r.locationId === outletId) &&
        new Date(r.createdAt).getTime() >= start &&
        (location === "all" || r.locationId === location) &&
        (product === "all" || r.variantId === product),
    ),
    totalReceipts = receipts.reduce((a: number, r: any) => a + (r.quantity * (r.unitCost || 0)), 0),
    sold: Record<string, number> = {};
  sales.forEach((s: any) =>
    s.items.forEach(
      (i: any) => (sold[i.variantId] = (sold[i.variantId] || 0) + i.quantity),
    ),
  );
  const top = Object.entries(sold).sort((a, b) => b[1] - a[1])[0],
    stockout = Object.entries(variants)
      .map(([id, v]: any) => {
        const balance = visibleBalances
            .filter((b: any) => b.variantId === id)
            .reduce((a: number, b: any) => a + b.quantity, 0),
          daily =
            (sold[id] || 0) /
            Math.max(
              1,
              period === "day"
                ? 1
                : period === "week"
                  ? 7
                  : period === "month"
                    ? 30
                    : 90,
            );
        return {
          ...v,
          id,
          balance,
          days: daily > 0 ? Math.ceil(balance / daily) : null,
        };
      })
      .filter((x: any) => x.balance > 0)
      .sort((a: any, b: any) => (a.days ?? 99999) - (b.days ?? 99999))
      .slice(0, 5);
  const download = async () => {
    // Prepare Sales Data - Detailed per item
    const salesData: any[] = [];
    sales.forEach((s: any) => {
      s.items.forEach((item: any) => {
        salesData.push([
          new Date(s.createdAt).toLocaleString("id-ID"),
          s.id.substring(0, 8).toUpperCase(), // Receipt No (short ID)
          locations[s.locationId]?.name || '-',
          s.channel || 'offline',
          s.cashierName || '-',
          variants[item.variantId]?.productName || '-',
          variants[item.variantId]?.name || '-',
          item.quantity,
          item.price || (s.total / s.items.reduce((a:number, i:any)=>a+i.quantity,0)), // fallback
          item.quantity * (item.price || (s.total / s.items.reduce((a:number, i:any)=>a+i.quantity,0))), // subtotal
          s.payment || '-',
          "Selesai"
        ]);
      });
    });

    // Prepare Receipts Data (Stok Masuk)
    const receiptsData: any[] = [];
    receipts.forEach((r: any) => {
      receiptsData.push([
        new Date(r.createdAt).toLocaleString("id-ID"),
        locations[r.locationId]?.name || '-',
        r.sourceType === "production" ? "Produksi Internal" : r.supplierName || "Supplier",
        variants[r.variantId]?.productName || '-',
        variants[r.variantId]?.name || '-',
        r.quantity,
        r.unitCost || 0,
        r.quantity * (r.unitCost || 0),
        r.note || '-',
        "Selesai"
      ]);
    });

    await downloadExcel(`Laporan_Veinstock_${period}_${new Date().toISOString().slice(0, 10)}`, [
      {
        name: "Penjualan Detail",
        columns: [
          { header: "Tanggal", key: "tanggal", width: 20 },
          { header: "No. Struk", key: "receipt", width: 15 },
          { header: "Outlet", key: "outlet", width: 20 },
          { header: "Kanal", key: "kanal", width: 12 },
          { header: "Kasir", key: "kasir", width: 15 },
          { header: "Produk", key: "produk", width: 25 },
          { header: "Varian", key: "varian", width: 15 },
          { header: "Jumlah", key: "jumlah", width: 10 },
          { header: "Harga Satuan", key: "hargasatuan", width: 15 },
          { header: "Subtotal", key: "subtotal", width: 15 },
          { header: "Pembayaran", key: "pembayaran", width: 15 },
          { header: "Status", key: "status", width: 12 }
        ],
        data: salesData
      },
      {
        name: "Stok Masuk",
        columns: [
          { header: "Tanggal", key: "tanggal", width: 20 },
          { header: "Lokasi", key: "lokasi", width: 20 },
          { header: "Sumber", key: "sumber", width: 20 },
          { header: "Produk", key: "produk", width: 25 },
          { header: "Varian", key: "varian", width: 15 },
          { header: "Jumlah Masuk", key: "jumlah", width: 15 },
          { header: "Harga Beli / Modal", key: "harga", width: 20 },
          { header: "Total Nilai", key: "totalnilai", width: 20 },
          { header: "Catatan", key: "catatan", width: 25 },
          { header: "Status", key: "status", width: 12 }
        ],
        data: receiptsData
      }
    ]);
    
    notify("Laporan Excel berhasil diunduh.");
  };

  const downloadPDF = async () => {
    try {
      notify("Mempersiapkan PDF, mohon tunggu...");
      const element = document.getElementById("report-content");
      if (!element) return notify("Konten laporan tidak ditemukan");
      
      const { default: html2canvas } = await import("html2canvas");
      const { default: jsPDF } = await import("jspdf");
      
      const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      // Calculate how many pages we need
      let heightLeft = pdfHeight;
      let position = 0;
      
      pdf.addImage(imgData, "PNG", 0, position, pdfWidth, pdfHeight);
      heightLeft -= pdf.internal.pageSize.getHeight();
      
      while (heightLeft >= 0) {
        position = heightLeft - pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, pdfWidth, pdfHeight);
        heightLeft -= pdf.internal.pageSize.getHeight();
      }
      
      pdf.save(`Laporan_Veinstock_${period}_${new Date().toISOString().slice(0, 10)}.pdf`);
      notify("Laporan PDF berhasil diunduh.");
    } catch (err) {
      console.error(err);
      notify("Gagal mengunduh PDF");
    }
  };

  return (
    <PageBlock
      title="Laporan & analisis stok"
      desc="Saring per periode, outlet, produk, dan kanal."
      action="Unduh Excel"
      onAction={download}
      secondaryAction="Unduh PDF"
      onSecondaryAction={downloadPDF}
    >
      <div id="report-content" style={{ padding: '16px', backgroundColor: '#fff', borderRadius: '8px' }}>

      <div className="filters report-filters">
        <select value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="day">Hari ini</option>
          <option value="week">7 hari</option>
          <option value="month">30 hari</option>
          <option value="all">Semua waktu</option>
        </select>
        <select value={location} onChange={(e) => setLocation(e.target.value)}>
          <option value="all">Semua outlet</option>
          {visibleLocations.map((l: any) => (
            <option value={l.id} key={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <select value={product} onChange={(e) => setProduct(e.target.value)}>
          <option value="all">Semua produk</option>
          {Object.entries(variants).map(([id, v]: any) => (
            <option value={id} key={id}>
              {v.productName} · {v.name}
            </option>
          ))}
        </select>
        <select value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="all">Semua kanal</option>
          <option>offline</option>
          <option>online</option>
          <option>reseller</option>
        </select>
      </div>
      <div className="report-hero" style={{display: 'flex', gap: 16}}>
        <div style={{flex: 1}}>
          <small>TOTAL PENJUALAN</small>
          <h2>{money(total)}</h2>
          <p>{sales.length} transaksi sesuai filter.</p>
        </div>
        <div style={{flex: 1}}>
          <small>TOTAL STOK MASUK</small>
          <h2>{money(totalReceipts)}</h2>
          <p>{receipts.length} catatan penerimaan barang.</p>
        </div>
        <Download />
      </div>
      <div className="stats-grid compact">
        <Stat
          label="Produk terlaris"
          value={top ? variants[top[0]]?.name : "Belum ada"}
          sub={
            top
              ? qty(top[1] as number, variants[top[0]]?.unit)
              : "Belum ada penjualan"
          }
        />
        <Stat
          label="Nilai stok masuk"
          value={money(totalReceipts)}
          sub="Estimasi nilai modal masuk"
        />
        <Stat
          label="Stok tertua"
          value={
            data.movements.length
              ? variants[data.movements[0]?.variantId]
                  ?.name || "-"
              : "Belum ada"
          }
          sub="Berdasarkan catatan masuk terlama"
        />
      </div>
      <Card title="Perkiraan stok habis">
        <div className="location-list">
          {stockout.map((x: any) => (
            <div key={x.id}>
              <div>
                <b>
                  {x.productName} · {x.name}
                </b>
                <span>Saldo {qty(x.balance, x.unit)}</span>
              </div>
              <strong>
                {x.days ? `± ${x.days} hari` : "Belum dapat dihitung"}
              </strong>
            </div>
          ))}
        </div>
      </Card>
      </div>
    </PageBlock>
  );
}
function UsersPage({ data, currentUser, businessLogo, open, edit }: any) {
  return (
    <PageBlock
      title="Tim VEINSTOCK"
      desc="Akses dibatasi sesuai tanggung jawab masing-masing."
      action="Tambah Pengguna"
      onAction={open}
    >
      <div className="user-grid">
        {data.users.map((stored: any) => {
          const u =
            stored.id === currentUser.id
              ? { ...stored, ...currentUser }
              : stored;
          return (
            <article className="clickable-card" key={u.id} onClick={() => edit(u.id)}>
              <div className={`avatar ${u.role}`}>
                {u.avatarUrl||(u.role==='owner'&&businessLogo)?<img src={u.avatarUrl||businessLogo} alt={u.name}/>:u.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h3>{u.name}</h3>
                <p>{u.email}</p>
                <span className={`status ${u.active ? "ok" : "danger"}`}>
                  {u.active ? (u.role === "owner" ? "Owner" : u.role === "admin" ? "Admin Cabang" : u.role === "warehouse" ? "Staf Gudang" : u.role === "cashier" ? "Kasir" : u.role === "finance" ? "Keuangan" : "PIC Outlet") : "nonaktif"}
                </span>
              </div>
              <button
                className="icon-btn user-edit"
                aria-label={`Edit ${u.name}`}
              >
                <Settings />
              </button>
            </article>
          );
        })}
      </div>
    </PageBlock>
  );
}
const PageBlock = ({ title, desc, action, onAction, secondaryAction, onSecondaryAction, children }: any) => (
  <>
    <section className="page-head">
      <div>
        <h2>{title}</h2>
        <p>{desc}</p>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        {secondaryAction && onSecondaryAction && (
          <button className="secondary" onClick={onSecondaryAction}>
            {secondaryAction}
          </button>
        )}
        {action && onAction && (
          <button className="primary" onClick={onAction}>
            <Plus />
            {action}
          </button>
        )}
      </div>
    </section>
    {children}
  </>
);
const Empty = ({ text }: any) => (
  <tr>
    <td colSpan={9}>
      <div className="empty">
        <PackagePlus />
        <b>{text}</b>
        <span>Gunakan tombol di kanan atas untuk mulai.</span>
      </div>
    </td>
  </tr>
);

const Modal = ({ title, desc, close, children, className = "" }: any) => (
  <div className="modal-backdrop">
    <div className={`modal ${className}`}>
      <header>
        <div>
          <h2>{title}</h2>
          <p>{desc}</p>
        </div>
        <button className="icon-btn" aria-label="Tutup dialog" onClick={close}>
          <X />
        </button>
      </header>
      {children}
    </div>
  </div>
);
function ProductModal({
  close,
  save,
  uploadImage,
  product,
  onDelete,
  locations
}: any) {
  const editing = Boolean(product),
    [name, setName] = useState(product?.name || ""),
    [category, setCategory] = useState(product?.category || "Umum"),
    [unit, setUnit] = useState<StockUnit>(product?.unit || "pcs"),
    [active, setActive] = useState(product?.active ?? true),
    [file, setFile] = useState<File | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);

  const [variants, setVariants] = useState<any[]>(
    product?.variants || [
      { id: newId("v"), name: "", sku: "", cost: 0, price: 0, resellerPrice: 0, minStock: 0, active: true, initialStock: 0 }
    ]
  );
  
  const [includeInitialStock, setIncludeInitialStock] = useState(false);
  const [initialStockLocationId, setInitialStockLocationId] = useState(locations?.length === 1 ? locations[0].id : "");

  const [bulkCost, setBulkCost] = useState("");
  const [bulkPrice, setBulkPrice] = useState("");
  const [bulkReseller, setBulkReseller] = useState("");
  const [bulkMinStock, setBulkMinStock] = useState("");

  const applyBulk = () => {
    setVariants(variants.map(v => ({
      ...v,
      cost: bulkCost !== "" ? Number(bulkCost) : v.cost,
      price: bulkPrice !== "" ? Number(bulkPrice) : v.price,
      resellerPrice: bulkReseller !== "" ? Number(bulkReseller) : v.resellerPrice,
      minStock: bulkMinStock !== "" ? Number(bulkMinStock) : v.minStock
    })));
    setBulkCost("");
    setBulkPrice("");
    setBulkReseller("");
    setBulkMinStock("");
  };

  const updateVariant = (index: number, field: string, value: any) => {
    const newVariants = [...variants];
    newVariants[index] = { ...newVariants[index], [field]: value };
    setVariants(newVariants);
  };
  const removeVariant = (index: number) => {
    setVariants(variants.filter((_, i) => i !== index));
  };
  const addVariant = () => {
    setVariants([...variants, { id: newId("v"), name: "", sku: "", cost: 0, price: 0, resellerPrice: 0, minStock: 0, active: true, initialStock: 0 }]);
  };

  return (
    <Modal
      title={editing ? "Edit produk & varian" : "Tambah produk"}
      desc="Kelola informasi produk dan variannya."
      close={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (variants.length === 0) return setError("Minimal harus ada 1 varian");
          if (variants.some(v => !v.name)) return setError("Nama varian tidak boleh kosong");
          setError("");
          setLoading(true);
          try {
            const uploadedUrl = file ? await uploadImage(file) : undefined;
            const updatedProduct: Product = {
              id: product?.id || newId("prod"),
              name,
              category,
              unit,
              active,
              imageUrl: uploadedUrl || product?.imageUrl,
              variants: variants.map((v, index) => {
                const { initialStock, ...rest } = v;
                return {
                  ...rest,
                  sku: v.sku || `VST-${v.name.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-3)}${index}`,
                };
              }),
            };
            const initialStocks = (!editing && includeInitialStock) ? variants.filter(v => v.initialStock > 0).map(v => ({
              variantId: v.id,
              locationId: initialStockLocationId,
              quantity: v.initialStock,
              cost: v.cost
            })) : [];
            save(updatedProduct, initialStocks);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Gagal menyimpan produk");
            setLoading(false);
          }
        }}
      >
        <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '24px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>Informasi Produk</h3>
          <Field label="Gambar produk (opsional)">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <span className="upload-hint" style={{ marginTop: '10px' }}>Rekomendasi: Gambar persegi (1:1), ukuran maksimal 2MB, format JPG/PNG/WEBP.</span>
          </Field>
          <div className="form-grid">
            <Field label="Nama produk">
              <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Kaos Polos" />
            </Field>
            <Field label="Kategori">
              <input required value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Contoh: Fashion" />
            </Field>
          </div>
          <div className="form-grid">
            <Field label="Satuan stok">
              <select value={unit} onChange={(e) => setUnit(e.target.value as StockUnit)}>
                <option value="Pcs">Pcs</option>
                <option value="Botol">Botol</option>
                <option value="Cup">Cup</option>
                <option value="Pack">Pack</option>
                <option value="Box">Box</option>
                <option value="Dus">Dus</option>
                <option value="Kg">Kg</option>
                <option value="Gram">Gram</option>
                <option value="Liter">Liter</option>
                <option value="Ml">Ml</option>
              </select>
              <span className="upload-hint" style={{ marginTop: '4px', display: 'block' }}>Sistem belum mendukung konversi otomatis.</span>
            </Field>
            {editing && (
              <label className="toggle-field" style={{ alignSelf: 'end', marginBottom: '8px' }}>
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                <span>Produk aktif dijual</span>
              </label>
            )}
          </div>
        </div>

        <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '24px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '14px', color: '#0f172a' }}>Isi Cepat (Terapkan ke Semua Varian)</h3>
            <button type="button" onClick={applyBulk} style={{ background: 'var(--green)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>Terapkan</button>
          </div>
          <div className="form-grid">
            <Field label="Harga Modal"><input type="number" min="0" value={String(bulkCost)} onChange={(e) => { e.target.value = e.target.value.replace(/^0+(?=\d)/, ''); setBulkCost(e.target.value) }} placeholder="Opsional" style={{ background: 'white' }} /></Field>
            <Field label="Harga Jual"><input type="number" min="0" value={String(bulkPrice)} onChange={(e) => { e.target.value = e.target.value.replace(/^0+(?=\d)/, ''); setBulkPrice(e.target.value) }} placeholder="Opsional" style={{ background: 'white' }} /></Field>
            <Field label="Harga Reseller"><input type="number" min="0" value={String(bulkReseller)} onChange={(e) => { e.target.value = e.target.value.replace(/^0+(?=\d)/, ''); setBulkReseller(e.target.value) }} placeholder="Opsional" style={{ background: 'white' }} /></Field>
            <Field label="Min Stok"><input type="number" min="0" value={String(bulkMinStock)} onChange={(e) => { e.target.value = e.target.value.replace(/^0+(?=\d)/, ''); setBulkMinStock(e.target.value) }} placeholder="Opsional" style={{ background: 'white' }} /></Field>
          </div>
        </div>

        {!editing && (
          <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '24px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '16px' }}>Stok Awal Produk</h3>
            <label className="toggle-field" style={{ marginBottom: includeInitialStock ? '16px' : '0' }}>
              <input type="checkbox" checked={includeInitialStock} onChange={(e) => setIncludeInitialStock(e.target.checked)} />
              <span style={{ fontWeight: 500 }}>Masukkan stok yang sudah tersedia</span>
            </label>
            {!includeInitialStock && (
              <p style={{ margin: 0, fontSize: '12px', color: '#64748b', marginTop: '8px' }}>Bagian ini bersifat opsional. Anda juga dapat menambahkan stok melalui menu Stok Masuk setelah produk dibuat.</p>
            )}
            {includeInitialStock && (
              <>
                <p style={{ margin: '0 0 16px', fontSize: '12px', color: '#64748b' }}>Stok yang dimasukkan akan tercatat sebagai saldo awal pada riwayat stok.</p>
                <Field label="Lokasi penyimpanan">
                  <select required={includeInitialStock} value={initialStockLocationId} onChange={(e) => setInitialStockLocationId(e.target.value)}>
                    <option value="" disabled>Pilih gudang atau outlet</option>
                    {locations?.map((l: any) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                  <span className="upload-hint" style={{ marginTop: '4px' }}>Pilih lokasi tempat stok barang saat ini disimpan.</span>
                </Field>
              </>
            )}
          </div>
        )}

        <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>Daftar Varian</h3>
        {variants.map((v, index) => (
          <div key={v.id} style={{ padding: '16px', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '16px', background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <b style={{ fontSize: '14px' }}>Varian {index + 1}</b>
              {variants.length > 1 && (
                <button type="button" onClick={() => removeVariant(index)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 'bold' }}>
                  <Trash2 size={14} /> Hapus
                </button>
              )}
            </div>
            <div className="form-grid">
              <Field label="Nama varian">
                <input required value={v.name} onChange={(e) => updateVariant(index, 'name', e.target.value)} placeholder="Contoh: Hitam / L" />
              </Field>
              <Field label="SKU (Otomatis jika kosong)">
                <input value={v.sku} onChange={(e) => updateVariant(index, 'sku', e.target.value)} />
              </Field>
              <Field label={`Harga Modal${bulkCost !== '' ? ' (Dilewati)' : ''}`}>
                <input required type="number" min="0" value={v.cost === 0 ? '' : String(v.cost)} onChange={(e) => { e.target.value = e.target.value.replace(/^0+(?=\d)/, ''); updateVariant(index, 'cost', +e.target.value) }} />
              </Field>
              <Field label={`Harga Jual${bulkPrice !== '' ? ' (Dilewati)' : ''}`}>
                <input required type="number" min="0" value={v.price === 0 ? '' : String(v.price)} onChange={(e) => { e.target.value = e.target.value.replace(/^0+(?=\d)/, ''); updateVariant(index, 'price', +e.target.value) }} />
              </Field>
              <Field label={`Harga Reseller${bulkReseller !== '' ? ' (Dilewati)' : ''}`}>
                <input type="number" min="0" value={v.resellerPrice === 0 ? '' : String(v.resellerPrice)} onChange={(e) => { e.target.value = e.target.value.replace(/^0+(?=\d)/, ''); updateVariant(index, 'resellerPrice', +e.target.value) }} />
              </Field>
              <Field label={`Min Stok${bulkMinStock !== '' ? ' (Dilewati)' : ''}`}>
                <input type="number" min="0" value={v.minStock === 0 ? '' : String(v.minStock)} onChange={(e) => { e.target.value = e.target.value.replace(/^0+(?=\d)/, ''); updateVariant(index, 'minStock', +e.target.value) }} />
              </Field>
              {!editing && includeInitialStock && (
                <Field label="Stok Awal">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input type="number" min="0" value={v.initialStock === 0 ? '' : String(v.initialStock)} onChange={(e) => { e.target.value = e.target.value.replace(/^0+(?=\d)/, ''); updateVariant(index, 'initialStock', +e.target.value) }} placeholder="0" style={{ flex: 1 }} />
                    <span style={{ fontSize: '14px', color: '#64748b' }}>{unit}</span>
                  </div>
                  <span className="upload-hint" style={{ marginTop: '4px' }}>Isi jumlah barang yang sudah tersedia.</span>
                </Field>
              )}
            </div>
            {editing && (
              <label className="toggle-field" style={{ marginTop: '12px' }}>
                <input type="checkbox" checked={v.active !== false} onChange={(e) => updateVariant(index, 'active', e.target.checked)} />
                <span>Varian aktif</span>
              </label>
            )}
          </div>
        ))}
        
        <button type="button" className="secondary" onClick={addVariant} style={{ width: '100%', marginBottom: '24px', borderStyle: 'dashed' }}>
          + Tambah Varian Lainnya
        </button>

        {!editing && includeInitialStock && (
           <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '24px', border: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: '14px' }}>Ringkasan stok awal</h4>
              <p style={{ margin: '0 0 4px', fontSize: '13px', color: '#475569' }}>Lokasi: <b>{locations?.find((l:any) => l.id === initialStockLocationId)?.name || '-'}</b></p>
              <p style={{ margin: '0 0 4px', fontSize: '13px', color: '#475569' }}>Jumlah varian: <b>{variants.filter(v => v.initialStock > 0).length} varian</b></p>
              <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#475569' }}>Total stok: <b>{variants.reduce((sum, v) => sum + (Number(v.initialStock) || 0), 0)} {unit}</b></p>
              <p style={{ margin: 0, fontSize: '12px', color: '#0369a1', fontStyle: 'italic' }}>Stok akan langsung tersedia setelah produk berhasil disimpan.</p>
           </div>
        )}

        {error && <div className="login-error">{error}</div>}
        <footer className="modal-actions">
          <button type="button" className="secondary" onClick={close}>Batal</button>
          {onDelete && <button type="button" className="danger-button" onClick={onDelete}><Trash2 size={16} /> Hapus Produk</button>}
          <button className="primary" disabled={loading}>
            <Check />
            {loading ? "Menyimpan..." : "Simpan Produk"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
function LocationModal({ close, save, location, onDelete }: any) {
  const [isSaving, setIsSaving] = useState(false);
  const editing=Boolean(location),[name, setName] = useState(location?.name||""),
    [type, setType] = useState<"warehouse" | "outlet">(location?.type||"outlet"),[address,setAddress]=useState(location?.address||""),[active,setActive]=useState(location?.active??true);
  return (
    <Modal
      title={editing?"Edit lokasi usaha":"Tambah lokasi usaha"}
      desc="Stok lokasi ini akan dihitung dan diaudit secara terpisah."
      close={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (isSaving) return;
          setIsSaving(true);
          try {
            await save(name, type, address, active);
          } catch(err) {
            setIsSaving(false);
          }
        }}
      >
        <Field label="Nama lokasi">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Contoh: Outlet Pasar Baru"
          />
        </Field>
        <Field label="Alamat lokasi"><textarea value={address} onChange={(e)=>setAddress(e.target.value)} placeholder="Alamat lengkap gudang atau outlet"/></Field>
        {editing&&<label className="toggle-field"><input type="checkbox" checked={active} onChange={(e)=>setActive(e.target.checked)}/><span>Lokasi aktif dan dapat digunakan untuk transaksi</span></label>}
        <Field label="Jenis lokasi">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "warehouse" | "outlet")}
          >
            <option value="outlet">Outlet / cabang</option>
            <option value="warehouse">Gudang</option>
          </select>
        </Field>
        <ModalActions close={close} onDelete={onDelete} disabled={isSaving} />
      </form>
    </Modal>
  );
}
function UserModal({ data, close, save, user, uploadImage, onDelete }: any) {
  const editing = Boolean(user),
    isOwner = user?.role === "owner",
    [name, setName] = useState(user?.name || ""),
    [email, setEmail] = useState(user?.email || ""),
    [password, setPassword] = useState(""),
    [role, setRole] = useState<"owner" | "pic" | "finance" | "admin" | "warehouse" | "cashier">(
      user?.role || "pic",
    ),
    [outletId, setOutletId] = useState(
      user?.outletId ||
        data.locations.find((item: any) => item.type === "outlet")?.id ||
        "",
    ),
    [active, setActive] = useState(user?.active ?? true),
    [file,setFile]=useState<File|null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [showPasswordEdit, setShowPasswordEdit] = useState(false),
    [showHelp, setShowHelp] = useState(false);
  return (
    <Modal
      title={editing ? "Edit profil pengguna" : "Tambah pengguna"}
      desc={
        editing
          ? "Perbarui identitas, akses, outlet, atau password pengguna."
          : "Buat akun operasional khusus untuk UMKM ini."
      }
      close={close}
    >
      <form
        autoComplete="off"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setLoading(true);
          try {
            const avatarUrl=file?await uploadImage(file):user?.avatarUrl;
            await save({
              name,
              email,
              password: password || undefined,
              role,
              outletId: ["pic", "warehouse", "cashier", "admin"].includes(role) ? outletId : undefined,
              active,
              avatarUrl,
            });
          } catch (err) {
            setError(
              err instanceof Error ? err.message : "Gagal menyimpan pengguna",
            );
            setLoading(false);
          }
        }}
      >
        {!isOwner && (
          <>
            <Field label="Foto profil (opsional)"><input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={(e)=>setFile(e.target.files?.[0]||null)}/></Field>
            <small className="upload-hint">Foto otomatis dikompresi. {editing&&user.avatarUrl?'Kosongkan jika foto tidak diubah.':''}</small>
          </>
        )}
        <Field label="Nama lengkap">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            autoComplete="off"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        {editing ? (
          showPasswordEdit ? (
            <Field label="Ganti Password">
              <PasswordInput
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                placeholder="Masukkan password baru pengguna ini"
              />
              <small className="upload-hint" style={{marginTop: 8, display: 'block'}}>
                Biarkan form kosong jika Anda batal mengganti password.
              </small>
            </Field>
          ) : (
            <Field label="Keamanan">
              <button
                type="button"
                className="table-action"
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px' }}
                onClick={() => setShowPasswordEdit(true)}
              >
                <KeyRound size={16} /> Ganti Password
              </button>
            </Field>
          )
        ) : (
          <Field label="Password awal">
            <PasswordInput
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            />
          </Field>
        )}
        <Field label={
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', width:'100%'}}>
            <span>Peran</span>
            <button type="button" onClick={() => setShowHelp(!showHelp)} style={{background:'none',border:'none',color:'var(--green)',fontSize:'10px',cursor:'pointer',textDecoration:'underline',padding:0,fontWeight:700}}>Pelajari hak akses</button>
          </div>
        }>
          <select
            value={role}
            disabled={isOwner}
            onChange={(e) => setRole(e.target.value as "owner" | "pic" | "finance" | "admin" | "warehouse" | "cashier")}
          >
            {isOwner && <option value="owner">Owner</option>}
            <option value="admin">Admin Cabang</option>
            <option value="pic">PIC Outlet</option>
            <option value="warehouse">Staf Gudang</option>
            <option value="cashier">Kasir</option>
            <option value="finance">Keuangan</option>
          </select>
          {showHelp && (
            <div style={{ marginTop: '8px', padding: '12px', background: 'var(--mint)', borderRadius: '8px', fontSize: '11.5px', color: 'var(--text)', border: '1px solid #d8f6e8', lineHeight: 1.5 }}>
              <div style={{ display: 'grid', gap: '8px' }}>
                <div><b>Admin Cabang:</b> Mengelola operasional cabang (stok & penjualan), tanpa akses laporan keuangan.</div>
                <div><b>PIC Outlet:</b> Kepala operasional toko/outlet.</div>
                <div><b>Staf Gudang:</b> Khusus mencatat mutasi stok di gudang, tanpa melihat harga jual/omset.</div>
                <div><b>Kasir:</b> Hanya bisa mengakses dan melayani transaksi di menu Penjualan.</div>
                <div><b>Keuangan:</b> Memantau laporan omset dan laba, tanpa bisa memodifikasi stok fisik.</div>
              </div>
            </div>
          )}
        </Field>
        {["pic", "warehouse", "cashier", "admin"].includes(role) && (
          <Field label="Lokasi Penempatan">
            <select
              required
              value={outletId}
              onChange={(e) => setOutletId(e.target.value)}
            >
              <option value="">Pilih Lokasi</option>
              {data.locations
                .filter((item: any) => {
                  if (role === "warehouse") return item.type === "warehouse";
                  if (role === "pic" || role === "cashier") return item.type === "outlet";
                  return true; // admin can see all for now
                })
                .map((item: any) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </Field>
        )}
        {editing && !isOwner && (
          <label className="toggle-field">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            <span>Akun aktif dan dapat masuk</span>
          </label>
        )}
        {error && <div className="login-error">{error}</div>}
        <footer className="modal-actions">
          <button type="button" className="secondary" onClick={close}>Batal</button>
          {onDelete && <button type="button" className="danger-button" onClick={onDelete}><Trash2 size={16} /> Hapus</button>}
          <button className="primary" disabled={loading}>
            <Check />
            {loading ? "Menyimpan..." : editing ? "Simpan Perubahan" : "Simpan"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
function ReceiptModal({ data, receipt, close, save }: any) {
  const [isSaving, setIsSaving] = useState(false);
  const variants = data.products
      .filter((p: any) => p.active)
      .flatMap((p: any) =>
        p.variants
          .filter((v: any) => v.active !== false)
          .map((v: any) => ({ ...v, unit: p.unit, productName: p.name })),
      ),
    [sourceType, setSourceType] = useState<"supplier" | "production">(
      receipt?.sourceType || "supplier",
    ),
    [supplierName, setSupplierName] = useState(receipt?.supplierName || ""),
    [locationId, setLocationId] = useState(
      receipt?.locationId || data.locations.find((l: any) => l.active)?.id || "",
    ),
    [searchVariant, setSearchVariant] = useState(""),
    [selectedItems, setSelectedItems] = useState<Record<string, { quantity: number, unitCost: number }>>(
      receipt ? { [receipt.variantId]: { quantity: receipt.quantity, unitCost: receipt.unitCost } } : {}
    ),
    [note, setNote] = useState(receipt?.note || ""),
    filteredVariants = variants.filter((v: any) => `${v.sku} ${v.productName} ${v.name}`.toLowerCase().includes(searchVariant.toLowerCase()));
  return (
    <Modal
      title={receipt ? "Edit stok masuk" : "Catat stok masuk"}
      desc={receipt ? "Perbarui informasi transaksi stok masuk ini." : "Saldo langsung bertambah dan aktivitas tercatat dalam histori."}
      close={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (isSaving) return;
          setIsSaving(true);
          save({
            sourceType,
            supplierName: sourceType === "supplier" ? supplierName : undefined,
            locationId,
            items: Object.entries(selectedItems).map(([vid, val]) => ({ variantId: vid, quantity: val.quantity, unitCost: val.unitCost })),
            note,
          });
        }}
      >
        <Field label="Sumber stok">
          <select
            value={sourceType}
            onChange={(e) =>
              setSourceType(e.target.value as "supplier" | "production")
            }
          >
            <option value="supplier">Pembelian supplier</option>
            <option value="production">Hasil produksi</option>
          </select>
        </Field>
        {sourceType === "supplier" && (
          <Field label="Nama supplier">
            <input
              required
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="Contoh: CV Sumber Makmur"
            />
          </Field>
        )}
        <Field label="Lokasi penerima">
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
          >
            {data.locations
              .filter((l: any) => l.active || l.id === locationId)
              .map((l: any) => (
                <option key={l.id} value={l.id}>
                  {l.type === 'warehouse' ? '🏢 Gudang: ' : '🏪 Outlet: '} {l.name}
                </option>
              ))}
          </select>
        </Field>
        {receipt ? (
          <div className="form-grid">
            <Field label={`Jumlah (${variants.find((v:any) => v.id === receipt.variantId)?.unit || "unit"})`}>
              <input
                type="number"
                min="1"
                value={String(selectedItems[receipt.variantId]?.quantity || 1)}
                onChange={(e) => { e.target.value = e.target.value.replace(/^0+(?=\d)/, ''); setSelectedItems({...selectedItems, [receipt.variantId]: { ...selectedItems[receipt.variantId], quantity: +e.target.value }}); }}
              />
            </Field>
            <Field label={`Harga modal per ${variants.find((v:any) => v.id === receipt.variantId)?.unit || "unit"}`}>
              <input
                type="number"
                min="0"
                value={String(selectedItems[receipt.variantId]?.unitCost || 0)}
                onChange={(e) => { e.target.value = e.target.value.replace(/^0+(?=\d)/, ''); setSelectedItems({...selectedItems, [receipt.variantId]: { ...selectedItems[receipt.variantId], unitCost: +e.target.value }}); }}
              />
            </Field>
          </div>
        ) : (
          <>
            <Field label="Pilih Produk / Varian">
              <input value={searchVariant} onChange={e => setSearchVariant(e.target.value)} placeholder="Cari varian..." />
              <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 6, padding: 8, marginTop: 8 }}>
                {filteredVariants.map((v: any) => (
                  <label key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!selectedItems[v.id]} style={{ width: 'auto', padding: 0, margin: 0 }} onChange={e => {
                      if (e.target.checked) {
                        setSelectedItems({ ...selectedItems, [v.id]: { quantity: 1, unitCost: v.cost || 0 } });
                      } else {
                        const next = { ...selectedItems };
                        delete next[v.id];
                        setSelectedItems(next);
                      }
                    }} />
                    <span>{v.productName} · {v.name}</span>
                  </label>
                ))}
              </div>
            </Field>
            {Object.keys(selectedItems).length > 0 && (
              <div style={{ marginTop: 16, marginBottom: 16 }}>
                <h4 style={{ margin: '0 0 12px', fontSize: 14 }}>Varian Terpilih:</h4>
                {Object.entries(selectedItems).map(([vid, item]) => {
                  const v = variants.find((x: any) => x.id === vid);
                  if (!v) return null;
                  return (
                    <div key={vid} className="form-grid" style={{ background: '#f8fafc', padding: 12, borderRadius: 6, marginBottom: 8, border: '1px solid #e2e8f0' }}>
                      <div style={{ gridColumn: '1 / -1', fontSize: 13 }}><b>{v.productName} · {v.name}</b></div>
                      <Field label={`Jumlah (${v.unit})`}>
                         <input type="number" min="1" value={String(item.quantity)} onChange={e => { e.target.value = e.target.value.replace(/^0+(?=\d)/, ''); setSelectedItems({...selectedItems, [vid]: { ...item, quantity: +(e.target.value || 0) }}) }} style={{ background: 'white' }} />
                      </Field>
                      <Field label="Harga Modal">
                         <input type="number" min="0" value={String(item.unitCost)} onChange={e => { e.target.value = e.target.value.replace(/^0+(?=\d)/, ''); setSelectedItems({...selectedItems, [vid]: { ...item, unitCost: +(e.target.value || 0) }}) }} style={{ background: 'white' }} />
                      </Field>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
        <Field label="Catatan">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Nomor faktur, batch, atau catatan produksi"
          />
        </Field>
        <ModalActions close={close} disabled={isSaving} />
      </form>
    </Modal>
  );
}
function ReturnModal({ data, close, save }: any) {
  const [isSaving, setIsSaving] = useState(false);
  const variants = data.products
      .filter((p: any) => p.active)
      .flatMap((p: any) =>
        p.variants
          .filter((v: any) => v.active !== false)
          .map((v: any) => ({ ...v, unit: p.unit, productName: p.name })),
      ),
    [type, setType] = useState<"customer" | "supplier">("customer"),
    [locationId, setLocationId] = useState(
      data.locations.find((l: any) => l.active)?.id || "",
    ),
    [searchVariant, setSearchVariant] = useState(""),
    [selectedItems, setSelectedItems] = useState<Record<string, { quantity: number }>>({}),
    [reason, setReason] = useState(""),
    filteredVariants = variants.filter((v: any) => `${v.sku} ${v.productName} ${v.name}`.toLowerCase().includes(searchVariant.toLowerCase()));

  return (
    <Modal
      title="Catat retur"
      desc="Perubahan stok dicatat otomatis tanpa menghapus transaksi asal."
      close={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (isSaving) return;
          setIsSaving(true);
          if (Object.keys(selectedItems).length === 0) { setIsSaving(false); return alert("Pilih minimal satu produk"); }
          save({ type, locationId, items: Object.entries(selectedItems).map(([vid, val]) => ({ variantId: vid, quantity: val.quantity })), reason });
        }}
      >
        <Field label="Jenis retur">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "customer" | "supplier")}
          >
            <option value="customer">Retur dari pelanggan</option>
            <option value="supplier">Retur ke supplier</option>
          </select>
        </Field>
        <Field label="Lokasi">
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
          >
            {data.locations
              .filter((l: any) => l.active)
              .map((l: any) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Pilih Produk / Varian">
          <input value={searchVariant} onChange={e => setSearchVariant(e.target.value)} placeholder="Cari varian..." />
          <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 6, padding: 8, marginTop: 8 }}>
            {filteredVariants.map((v: any) => (
              <label key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!selectedItems[v.id]} style={{ width: 'auto', padding: 0, margin: 0 }} onChange={e => {
                  if (e.target.checked) {
                    setSelectedItems({ ...selectedItems, [v.id]: { quantity: 1 } });
                  } else {
                    const next = { ...selectedItems };
                    delete next[v.id];
                    setSelectedItems(next);
                  }
                }} />
                <span>{v.productName} · {v.name}</span>
              </label>
            ))}
          </div>
        </Field>
        {Object.keys(selectedItems).length > 0 && (
          <div style={{ marginTop: 16, marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 12px', fontSize: 14 }}>Varian Terpilih:</h4>
            {Object.entries(selectedItems).map(([vid, item]) => {
              const v = variants.find((x: any) => x.id === vid);
              if (!v) return null;
              return (
                <div key={vid} style={{ background: '#f8fafc', padding: 12, borderRadius: 6, marginBottom: 8, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 13, marginBottom: 8 }}><b>{v.productName} · {v.name}</b></div>
                  <Field label={`Jumlah (${v.unit})`}>
                     <input type="number" min="1" value={String(item.quantity)} onChange={e => { e.target.value = e.target.value.replace(/^0+(?=\d)/, ''); setSelectedItems({...selectedItems, [vid]: { quantity: +(e.target.value || 0) }}) }} style={{ background: 'white' }} />
                  </Field>
                </div>
              );
            })}
          </div>
        )}
        <Field label="Alasan retur">
          <textarea
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Contoh: Barang rusak atau salah kirim"
          />
        </Field>
        <ModalActions close={close} disabled={isSaving} />
      </form>
    </Modal>
  );
}
function BusinessModal({ data, close, save, uploadImage }: any) {
  const current = data.business || {},
    [name, setName] = useState(current.name || ""),
    [ownerName, setOwnerName] = useState(current.ownerName || ""),
    [phone, setPhone] = useState(current.phone || ""),
    [email, setEmail] = useState(current.email || ""),
    [address, setAddress] = useState(current.address || ""),
    [negativeStockPolicy, setNegativeStockPolicy] = useState(current.negativeStockPolicy || "BLOCK"),
    [file, setFile] = useState<File | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title="Edit profil usaha"
      desc="Logo dan identitas digunakan pada dokumen usaha."
      close={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          setError("");
          try {
            const logoUrl = file ? await uploadImage(file) : current.logoUrl;
            save({ name, ownerName, phone, email, address, logoUrl, negativeStockPolicy });
          } catch (err) {
            setError(
              err instanceof Error ? err.message : "Gagal menyimpan profil",
            );
            setLoading(false);
          }
        }}
      >
        <Field label="Logo usaha">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </Field>
        <small className="upload-hint">
          Logo otomatis dikompresi sebelum disimpan.
        </small>
        <div className="form-grid">
          <Field label="Nama usaha">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Nama pemilik">
            <input
              required
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
            />
          </Field>
        </div>
        <div className="form-grid">
          <Field label="Nomor telepon">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Email usaha">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
        </div>
        <div className="form-grid">
          <Field label="Alamat usaha">
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </Field>
          <Field label="Kebijakan Stok Negatif">
            <select value={negativeStockPolicy} onChange={(e) => setNegativeStockPolicy(e.target.value)}>
              <option value="BLOCK">BLOCK (Tolak transaksi jika stok habis)</option>
              <option value="WARN">WARN (Munculkan peringatan)</option>
            </select>
          </Field>
        </div>
        {error && <div className="login-error">{error}</div>}
        <footer className="modal-actions">
          <button type="button" className="secondary" onClick={close}>
            Batal
          </button>
          <button className="primary" disabled={loading}>
            <Check />
            {loading ? "Menyimpan..." : "Simpan Perubahan"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
function TransferModal({ data, close, save, fixedFrom }: any) {
  const [isSaving, setIsSaving] = useState(false);
  const activeLocations=data.locations.filter((l:any)=>l.active),variants = data.products.filter((p:any)=>p.active).flatMap((p: any) =>
      p.variants.filter((item:any)=>item.active!==false).map((item: any) => ({
        ...item,
        unit: p.unit,
        productName: p.name,
      })),
    ),
    [from, setFrom] = useState(fixedFrom || activeLocations[0]?.id || ""),
    [to, setTo] = useState(activeLocations.find((l: any) => l.id !== (fixedFrom || activeLocations[0]?.id))?.id || ""),
    [searchVariant, setSearchVariant] = useState(""),
    [selectedItems, setSelectedItems] = useState<Record<string, { quantity: number }>>({}),
    filteredVariants = variants.filter((v: any) => {
      if (!`${v.sku} ${v.productName} ${v.name}`.toLowerCase().includes(searchVariant.toLowerCase())) return false;
      return getBalance(data.balances, from, v.id) > 0 || selectedItems[v.id];
    });

  return (
    <Modal
      title="Buat transfer stok"
      desc="Lokasi tujuan harus mengonfirmasi barang yang diterima."
      close={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (isSaving) return;
          setIsSaving(true);
          if (Object.keys(selectedItems).length === 0) { setIsSaving(false); return alert("Pilih minimal satu produk"); }
          save(from, to, Object.entries(selectedItems).map(([vid, val]) => ({ variantId: vid, quantity: val.quantity })));
        }}
      >
        <Field label="Lokasi asal">
          {fixedFrom ? (
            <input
              readOnly
              value={activeLocations.find((l: any) => l.id === fixedFrom)?.name || fixedFrom}
              className="input-readonly"
            />
          ) : (
          <select
            value={from}
            onChange={(e) => {
              const next = e.target.value;
              setFrom(next);
              if (to === next)
                setTo(activeLocations.find((l: any) => l.id !== next)?.id || "");
            }}
          >
            {activeLocations.map((l: any) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          )}
        </Field>
        <Field label="Lokasi tujuan">
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            {activeLocations
              .filter((l: any) => l.id !== from)
              .map((l: any) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Pilih Produk / Varian">
          <input value={searchVariant} onChange={e => setSearchVariant(e.target.value)} placeholder="Cari varian..." />
          <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 6, padding: 8, marginTop: 8 }}>
            {filteredVariants.map((v: any) => (
              <label key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!selectedItems[v.id]} style={{ width: 'auto', padding: 0, margin: 0 }} onChange={e => {
                  if (e.target.checked) {
                    setSelectedItems({ ...selectedItems, [v.id]: { quantity: 1 } });
                  } else {
                    const next = { ...selectedItems };
                    delete next[v.id];
                    setSelectedItems(next);
                  }
                }} />
                <span>{v.productName} · {v.name} (Stok: {getBalance(data.balances, from, v.id)} {v.unit})</span>
              </label>
            ))}
          </div>
        </Field>
        {Object.keys(selectedItems).length > 0 && (
          <div style={{ marginTop: 16, marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 12px', fontSize: 14 }}>Varian Terpilih:</h4>
            {Object.entries(selectedItems).map(([vid, item]) => {
              const v = variants.find((x: any) => x.id === vid);
              if (!v) return null;
              return (
                <div key={vid} style={{ background: '#f8fafc', padding: 12, borderRadius: 6, marginBottom: 8, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 13, marginBottom: 8 }}><b>{v.productName} · {v.name}</b></div>
                  <Field label={`Jumlah (${v.unit})`}>
                     <input type="number" min="1" value={String(item.quantity)} onChange={e => { e.target.value = e.target.value.replace(/^0+(?=\d)/, ''); setSelectedItems({...selectedItems, [vid]: { quantity: +(e.target.value || 0) }}) }} style={{ background: 'white' }} />
                  </Field>
                </div>
              );
            })}
          </div>
        )}
        <ModalActions close={close} disabled={isSaving} />
      </form>
    </Modal>
  );
}
function SaleModal({ data, close, save, fixedLocation }: any) {
  const activeLocations=data.locations.filter((l:any)=>l.active),variants = data.products.filter((p:any)=>p.active).flatMap((p: any) =>
      p.variants.filter((item:any)=>item.active!==false).map((item: any) => ({
        ...item,
        unit: p.unit,
        productName: p.name,
      })),
    ),
    [loc, setLoc] = useState(
      fixedLocation || activeLocations[1]?.id || activeLocations[0]?.id || "",
    ),
    [channel, setChannel] = useState<Channel>("offline"),
    [skuSearch, setSkuSearch] = useState(""),
    [payment, setPayment] = useState("QRIS"),
    [cart, setCart] = useState<Array<{ variantId: string; quantity: number }>>([]),
    matchingVariants = variants.filter((item: any) => {
      if (!`${item.sku} ${item.productName} ${item.name}`.toLowerCase().includes(skuSearch.toLowerCase())) return false;
      return getBalance(data.balances, loc, item.id) > 0 || cart.some(c => c.variantId === item.id);
    });
  
  const totalQty = cart.reduce((acc, c) => acc + c.quantity, 0);
  const totalAmount = cart.reduce((acc, c) => {
    const varDetail = variants.find((item: any) => item.id === c.variantId);
    const price = channel === "reseller" ? (varDetail?.resellerPrice || 0) : (varDetail?.price || 0);
    return acc + (c.quantity * price);
  }, 0);

  return (
    <Modal
      title="Catat penjualan"
      desc="Catat penjualan untuk mengurangi stok dan mencatat riwayat transaksi."
      close={close}
      className="large"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (cart.length === 0) return alert("Keranjang masih kosong");
          save(loc, channel, cart, payment);
        }}
      >
        <div className="form-grid">
          <Field label="Lokasi">
            <select
              value={loc}
              disabled={Boolean(fixedLocation)}
              onChange={(e) => setLoc(e.target.value)}
            >
              {activeLocations.map((l: any) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Kanal">
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as Channel)}
            >
              <option value="offline">Offline</option>
              <option value="online">Online</option>
              <option value="reseller">Reseller</option>
            </select>
          </Field>
        </div>
        <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '1px solid var(--border)' }}>
          <h4 style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--muted)' }}>PILIH PRODUK / VARIAN</h4>
          <Field label="">
            <input
              value={skuSearch}
              onChange={(e) => setSkuSearch(e.target.value)}
              placeholder="Cari atau scan barcode / SKU"
              autoComplete="off"
            />
            <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 6, padding: 8, marginTop: 8, background: 'white' }}>
              {matchingVariants.map((v: any) => {
                const checked = cart.some(c => c.variantId === v.id);
                return (
                  <label key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
                    <input type="checkbox" checked={checked} style={{ width: 'auto', padding: 0, margin: 0 }} onChange={e => {
                      if (e.target.checked) {
                        setCart([...cart, { variantId: v.id, quantity: 1 }]);
                      } else {
                        setCart(cart.filter(c => c.variantId !== v.id));
                      }
                    }} />
                    <span>{v.productName} · {v.name} (Stok: {getBalance(data.balances, loc, v.id)} {v.unit})</span>
                  </label>
                )
              })}
            </div>
          </Field>
        </div>
        
        {cart.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '8px 0' }}>Produk</th>
                  <th style={{ padding: '8px 0' }}>Harga</th>
                  <th style={{ padding: '8px 0' }}>Qty</th>
                  <th style={{ padding: '8px 0', textAlign: 'right' }}>Subtotal</th>
                  <th style={{ padding: '8px 0', width: 30 }}></th>
                </tr>
              </thead>
              <tbody>
                {cart.map((c, idx) => {
                  const varDetail = variants.find((item: any) => item.id === c.variantId);
                  if (!varDetail) return null;
                  const price = channel === "reseller" ? varDetail.resellerPrice : varDetail.price;
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 0' }}>{varDetail.productName} - {varDetail.name}</td>
                      <td style={{ padding: '8px 0' }}>{money(price)}</td>
                      <td style={{ padding: '8px 0' }}>
                        <input 
                          type="number" 
                          min="1" 
                          value={String(c.quantity)} 
                          onChange={e => {
                             e.target.value = e.target.value.replace(/^0+(?=\d)/, '');
                             const qty = Math.max(1, Number(e.target.value));
                             const newCart = [...cart];
                             newCart[idx].quantity = qty;
                             setCart(newCart);
                          }}
                          style={{ width: 60, padding: 4, background: 'white', border: '1px solid var(--line)', borderRadius: 4 }}
                        /> <span style={{ marginLeft: 4 }}>{varDetail.unit}</span>
                      </td>
                      <td style={{ padding: '8px 0', textAlign: 'right' }}>{money(price * c.quantity)}</td>
                      <td style={{ padding: '8px 0', textAlign: 'center' }}>
                        <button type="button" onClick={() => setCart(cart.filter((_, i) => i !== idx))} style={{ background: 'transparent', border: 'none', color: 'red', cursor: 'pointer', padding: 0 }}>×</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div style={{ background: 'var(--navy)', color: 'white', padding: '12px 16px', borderRadius: '8px', marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>TOTAL TAGIHAN</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{money(totalAmount)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, opacity: 0.8 }}>TOTAL QTY</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{totalQty} item</div>
              </div>
            </div>
          </div>
        )}

        <div className="form-grid">
          <Field label="Metode Pembayaran">
            <select
              value={payment}
              onChange={(e) => setPayment(e.target.value)}
            >
              <option>QRIS</option>
              <option>Tunai</option>
              <option>Transfer</option>
            </select>
          </Field>
          <div></div>
        </div>
        <ModalActions close={close} disabled={cart.length === 0} />
      </form>
    </Modal>
  );
}
function OpnameModal({ data, item, close, save, fixedLocation }: any) {
  const [isSaving, setIsSaving] = useState(false);
  const variants = data.products.flatMap((p: any) =>
      p.variants.map((variantItem: any) => ({
        ...variantItem,
        unit: p.unit,
        productName: p.name,
      })),
    ),
    [loc, setLoc] = useState(
      item?.locationId || fixedLocation || data.locations[1]?.id || data.locations[0]?.id || "",
    ),
    [searchVariant, setSearchVariant] = useState(""),
    [selectedItems, setSelectedItems] = useState<Record<string, { actualQty: number, reason: string }>>(
      item ? { [item.variantId]: { actualQty: item.actualQty || 0, reason: item.reason || "Koreksi saldo dari halaman stok" } } : {}
    ),
    filteredVariants = variants.filter((v: any) => `${v.sku} ${v.productName} ${v.name}`.toLowerCase().includes(searchVariant.toLowerCase()));

  return (
    <Modal
      title="Catat stock opname"
      desc="Selisih akan menjadi koreksi dengan jejak audit."
      close={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (isSaving) return;
          setIsSaving(true);
          if (Object.keys(selectedItems).length === 0) { setIsSaving(false); return alert("Pilih minimal satu produk"); }
          save(loc, Object.entries(selectedItems).map(([vid, val]) => ({ variantId: vid, actualQty: val.actualQty, reason: val.reason })));
        }}
      >
        <Field label="Lokasi">
          <select
            value={loc}
            disabled={Boolean(fixedLocation)}
            onChange={(e) => setLoc(e.target.value)}
          >
            {data.locations.map((l: any) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Pilih Produk / Varian">
          <input value={searchVariant} onChange={e => setSearchVariant(e.target.value)} placeholder="Cari varian..." />
          <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 6, padding: 8, marginTop: 8 }}>
            {filteredVariants.map((v: any) => (
              <label key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!selectedItems[v.id]} style={{ width: 'auto', padding: 0, margin: 0 }} onChange={e => {
                  if (e.target.checked) {
                    setSelectedItems({ ...selectedItems, [v.id]: { actualQty: 0, reason: "Hasil hitung fisik akhir hari" } });
                  } else {
                    const next = { ...selectedItems };
                    delete next[v.id];
                    setSelectedItems(next);
                  }
                }} />
                <span>{v.productName} · {v.name}</span>
              </label>
            ))}
          </div>
        </Field>
        {Object.keys(selectedItems).length > 0 && (
          <div style={{ marginTop: 16, marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 12px', fontSize: 14 }}>Varian Terpilih:</h4>
            {Object.entries(selectedItems).map(([vid, selectedItem]) => {
              const v = variants.find((x: any) => x.id === vid);
              if (!v) return null;
              return (
                <div key={vid} className="form-grid" style={{ background: '#f8fafc', padding: 12, borderRadius: 6, marginBottom: 8, border: '1px solid #e2e8f0' }}>
                  <div style={{ gridColumn: '1 / -1', fontSize: 13, marginBottom: 4 }}><b>{v.productName} · {v.name}</b></div>
                  <Field label={`Stok fisik (${v.unit})`}>
                     <input type="number" min="0" value={String(selectedItem.actualQty)} onChange={e => { e.target.value = e.target.value.replace(/^0+(?=\d)/, ''); setSelectedItems({...selectedItems, [vid]: { ...selectedItem, actualQty: +(e.target.value || 0) }}) }} style={{ background: 'white' }} />
                  </Field>
                  <Field label="Alasan / catatan">
                     <textarea required value={selectedItem.reason} onChange={e => setSelectedItems({...selectedItems, [vid]: { ...selectedItem, reason: e.target.value }})} style={{ background: 'white' }} />
                  </Field>
                </div>
              );
            })}
          </div>
        )}
        <ModalActions close={close} disabled={isSaving} />
      </form>
    </Modal>
  );
}
function CancelModal({close,save}:any){const [isSaving, setIsSaving] = useState(false);const[reason,setReason]=useState("");return <Modal title="Batalkan transaksi" desc="Stok akan dikoreksi otomatis. Transaksi asli dan alasan tetap ada dalam histori." close={close}><form onSubmit={(e)=>{e.preventDefault();if(isSaving)return;setIsSaving(true);save(reason)}}><Field label="Alasan pembatalan / koreksi"><textarea required minLength={5} value={reason} onChange={(e)=>setReason(e.target.value)} placeholder="Contoh: Salah memilih produk atau jumlah"/></Field><footer className="modal-actions"><button type="button" className="secondary" onClick={close}>Kembali</button><button className="danger-button" type="submit" disabled={isSaving}><RotateCcw/>Batalkan transaksi</button></footer></form></Modal>}
function SaleDetail({ item, variants, locations, close }: any) {
  if (!item) return null;
  return (
    <Modal
      title={`Detail transaksi ${item.id}`}
      desc="Rincian lengkap transaksi penjualan."
      close={close}
    >
      <div className="detail-list">
        <p>
          <span>Waktu</span>
          <b>{new Date(item.createdAt).toLocaleString("id-ID")}</b>
        </p>
        <p>
          <span>Lokasi</span>
          <b>{locations[item.locationId]?.name}</b>
        </p>
        <p>
          <span>Kanal / pembayaran</span>
          <b>
            {item.channel} &middot; {item.payment}
          </b>
        </p>
        {item.items.map((line: any) => (
          <p key={line.variantId}>
            <span>
              {variants[line.variantId]?.productName} &middot; {variants[line.variantId]?.name}
            </span>
            <b>{qty(line.quantity, variants[line.variantId]?.unit)}</b>
          </p>
        ))}
        <p>
          <span>Total</span>
          <b>{money(item.total)}</b>
        </p>
        <p>
          <span>Status</span>
          <b>
            {item.status === "cancelled"
              ? `Dibatalkan: ${item.cancelReason}`
              : "Selesai"}
          </b>
        </p>
      </div>
      <footer className="modal-actions">
        <button type="button" className="secondary" onClick={close}>
          Tutup
        </button>
      </footer>
    </Modal>
  );
}
function TransferDetail({
  item,
  business,
  variants,
  locations,
  close,
  notify,
}: any) {
  if (!item) return null;
  const html = `<!doctype html><meta charset="utf-8"><title>Bukti ${
    item.id
  }</title><style>body{font:16px Arial;max-width:700px;margin:50px auto;color:#10233b}h1{color:#063858}table{width:100%;border-collapse:collapse}td{padding:12px;border-bottom:1px solid #ddd}td:last-child{text-align:right;font-weight:bold}</style><h1>${
    business?.name || "VEINSTOCK"
  }</h1><h2>Bukti Transfer Stok</h2><table><tr><td>Nomor</td><td>${
    item.id
  }</td></tr><tr><td>Tanggal</td><td>${new Date(item.createdAt).toLocaleString(
    "id-ID",
  )}</td></tr><tr><td>Rute</td><td>${locations[item.fromId]?.name} &rarr; ${
    locations[item.toId]?.name
  }</td></tr><tr><td>Produk</td><td>${variants[item.variantId]?.productName} &middot; ${
    variants[item.variantId]?.name
  }</td></tr><tr><td>Jumlah</td><td>${qty(
    item.quantity,
    variants[item.variantId]?.unit,
  )}</td></tr><tr><td>Status</td><td>${item.status}</td></tr></table>`;
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([html], { type: "text/html;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `bukti-transfer-${item.id}.html`;
    a.click();
    URL.revokeObjectURL(url);
    notify(
      "Bukti transfer diunduh. Cek folder Unduhan/Downloads pada perangkat Anda.",
    );
  };
  const print = () => {
    const win = window.open("", "_blank");
    if (!win) return notify("Izinkan popup browser untuk mencetak bukti.");
    win.document.write(html);
    win.document.close();
    win.print();
  };
  return (
    <Modal
      title="Bukti transfer stok"
      desc="Bukti dapat dicetak atau diunduh dan dibuka kembali."
      close={close}
    >
      <div className="detail-list">
        <p>
          <span>Nomor</span>
          <b>{item.id}</b>
        </p>
        <p>
          <span>Rute</span>
          <b>
            {locations[item.fromId]?.name} &rarr; {locations[item.toId]?.name}
          </b>
        </p>
        <p>
          <span>Produk</span>
          <b>
            {variants[item.variantId]?.productName} &middot; {variants[item.variantId]?.name}
          </b>
        </p>
        <p>
          <span>Jumlah</span>
          <b>{qty(item.quantity, variants[item.variantId]?.unit)}</b>
        </p>
        <p>
          <span>Status</span>
          <b>{item.status}</b>
        </p>
      </div>
      <footer className="modal-actions">
        <button type="button" className="secondary" onClick={close}>
          Tutup
        </button>
        <button type="button" className="secondary" onClick={print}>
          Cetak
        </button>
        <button type="button" className="primary" onClick={download}>
          <Download size={16} /> Unduh Bukti
        </button>
      </footer>
    </Modal>
  );
}
function Notifications({data,variants,locations,close,act}:any){const low=data.balances.filter((b:any)=>b.quantity<minimumFor(variants[b.variantId],b.locationId));return <Modal title="Notifikasi stok" desc="Setiap pemberitahuan dilengkapi tindakan yang dapat dilakukan." close={close}>{low.length?<div className="notification-list">{low.map((b:any)=><article key={`${b.locationId}-${b.variantId}`}><div><b>{variants[b.variantId]?.productName} · {variants[b.variantId]?.name}</b><span>{locations[b.locationId]?.name}: tersisa {qty(b.quantity,variants[b.variantId]?.unit)}, minimum {qty(minimumFor(variants[b.variantId],b.locationId),variants[b.variantId]?.unit)}</span></div><button className="small-primary" onClick={()=>act('receipts')}>Tambah stok</button></article>)}</div>:<div className="empty standalone"><Check/><b>Semua stok aman</b><span>Tidak ada saldo di bawah batas minimum.</span></div>}</Modal>}
const ListSearch=({value,setValue,placeholder}:any)=><label className="list-search"><Search/><input value={value} onChange={(e)=>setValue(e.target.value)} placeholder={placeholder}/></label>;
const Field = ({ label, children }: any) => (
  <label className="field">
    <span>{label}</span>
    {children}
  </label>
);
function ChangePasswordModal({ token, close, notify }: { token: string | null; close: () => void; notify: (msg: string) => void }) {
  const [current, setCurrent] = useState(""),
    [newPwd, setNewPwd] = useState(""),
    [confirm, setConfirm] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if(loading) return;
    setError("");
    if (newPwd !== confirm) return setError("Konfirmasi password tidak cocok");
    if (newPwd.length < 8) return setError("Password baru minimal 8 karakter");
    setLoading(true);
    try {
      const res = await fetch('/api/profile/password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: current, newPassword: newPwd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      notify(data.message);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah password');
    } finally { setLoading(false); }
  };
  return (
    <Modal title="Ganti Password" desc="Pastikan Anda ingat password baru sebelum menyimpan." close={close}>
      <form onSubmit={submit}>
        <Field label="Password Lama">
          <PasswordInput required value={current} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCurrent(e.target.value)} autoComplete="current-password" />
        </Field>
        <Field label="Password Baru">
          <PasswordInput required minLength={8} value={newPwd} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPwd(e.target.value)} autoComplete="new-password" placeholder="Minimal 8 karakter" />
        </Field>
        <Field label="Konfirmasi Password Baru">
          <PasswordInput required minLength={8} value={confirm} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirm(e.target.value)} autoComplete="new-password" placeholder="Ulangi password baru" />
        </Field>
        {error && <div className="login-error" style={{ marginTop: '4px' }}>{error}</div>}
        <ModalActions close={close}>
          <button className="primary" disabled={loading}>{loading ? 'Menyimpan...' : 'Simpan Password'}</button>
        </ModalActions>
      </form>
    </Modal>
  );
}
function PasswordInput({ value, onChange, autoComplete, minLength, required, placeholder }: any) {
  const [show, setShow] = useState(false);
  return (
    <div className="password-input-wrap">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        minLength={minLength}
        required={required}
        placeholder={placeholder}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setShow((s) => !s)}
        tabIndex={-1}
        aria-label={show ? "Sembunyikan password" : "Tampilkan password"}
      >
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}
const ModalActions = ({ close, onDelete, disabled }: any) => (
    <footer className="modal-actions">
      <button type="button" className="secondary" onClick={close}>Batal</button>
      {onDelete && <button type="button" className="danger-button" onClick={onDelete} disabled={disabled}><Trash2 size={16} /> Hapus</button>}
      <button className="primary" type="submit" disabled={disabled}>
        <Check />
        Simpan
      </button>
    </footer>
);function HelpPage({ initialSection, clearInitialSection }: { initialSection: string | null, clearInitialSection: () => void }) {
  const [openSection, setOpenSection] = useState<string | null>(initialSection);
  const [searchQuery, setSearchQuery] = useState("");
  const [readingArticle, setReadingArticle] = useState<any>(null);

  useEffect(() => {
    if (initialSection) {
      let foundArticle = null;
      let foundSection = null;
      for (const s of sections) {
        if (s.id === initialSection) foundSection = s.id;
        const art = s.articles.find((a: any) => a.id === initialSection);
        if (art) {
          foundArticle = art;
          foundSection = s.id;
          break;
        }
      }

      if (foundArticle) {
        setReadingArticle(foundArticle);
        setOpenSection(foundSection);
      } else if (foundSection) {
        setOpenSection(foundSection);
      } else {
        setOpenSection(initialSection);
      }
      clearInitialSection();
    }
  }, [initialSection]);

  const toggle = (id: string) => setOpenSection(openSection === id ? null : id);

  const filteredSections = sections.map((s: any) => {
    if (!searchQuery) return s;
    const q = searchQuery.toLowerCase();
    const matchedArticles = s.articles.filter((a: any) => a.title.toLowerCase().includes(q));
    if (s.title.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q) || matchedArticles.length > 0) {
      return { ...s, articles: matchedArticles.length > 0 ? matchedArticles : s.articles };
    }
    return null;
  }).filter(Boolean);

  const handlePopularClick = (id: string) => {
    for (const s of sections) {
      const art = s.articles.find((a: any) => a.id === id);
      if (art) {
        setReadingArticle(art);
        setOpenSection(s.id);
        return;
      }
    }
  };

  if (readingArticle) {
    return (
      <div className="help-page reading-mode">
        <div className="help-reading-header">
          <button className="back-btn" onClick={() => setReadingArticle(null)}>
            <ChevronLeft size={18} /> Kembali ke Pusat Bantuan
          </button>
        </div>
        <div className="help-reading-content">
          <h2 className="article-title">{readingArticle.title}</h2>
          <div className="article-body-wrapper">
            {readingArticle.content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="help-page">
      <div className="help-hero">
        <LifeBuoy />
        <div>
          <h2>Pusat Bantuan VEINSTOCK</h2>
          <p>Panduan ringkas penggunaan fitur aplikasi. Temukan solusi masalah Anda di bawah ini.</p>
        </div>
      </div>

      <div className="help-search">
        <Search />
        <input 
          type="text" 
          placeholder="Cari bantuan, misalnya 'stok tidak sesuai'..." 
          value={searchQuery}
          onChange={e => { setSearchQuery(e.target.value); if (e.target.value) setOpenSection(null); }}
        />
      </div>

      {!searchQuery && (
        <div className="help-popular">
          <h4>Artikel Populer</h4>
          <div className="popular-list">
            {popularArticles.map((artId: string, idx: number) => {
               let title = "";
               for (const s of sections) {
                 const a = s.articles.find((x: any) => x.id === artId);
                 if (a) title = a.title;
               }
               return (
                 <button key={idx} className="popular-btn" onClick={() => handlePopularClick(artId)}>
                   {title}
                 </button>
               );
            })}
          </div>
        </div>
      )}

      <div className="help-grid">
        {filteredSections.map((s: any) => (
          <article key={s.id} className={`help-card ${(openSection === s.id || searchQuery) ? "open" : ""}`}>
            <header onClick={() => !searchQuery && toggle(s.id)}>
              <div className="icon-wrap">{s.icon}</div>
              <div className="help-card-text">
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
                <small className="article-count">{s.articles.length} panduan</small>
              </div>
              <button className="icon-btn">
                {(openSection === s.id || searchQuery) ? <ChevronUp /> : <ChevronDown />}
              </button>
            </header>
            {(openSection === s.id || searchQuery) && (
              <div className="help-content">
                {s.articles.map((art: any, idx: number) => (
                  <div key={idx} className="help-step" onClick={() => setReadingArticle(art)}>
                    <Check />
                    <span>{art.title}</span>
                  </div>
                ))}
              </div>
            )}
          </article>
        ))}
        {filteredSections.length === 0 && (
          <div className="empty">
            <Search size={40} opacity={0.2} />
            <b>Tidak ada hasil</b>
            <span>Coba gunakan kata kunci lain.</span>
          </div>
        )}
      </div>
    </div>
  );
}

function AnalyticsPage({ data, setData }: { data: AppData, setData?: any }) {
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});
  const handleRefresh = (key: string) => {
    setRefreshing(p => ({ ...p, [key]: true }));
    setTimeout(() => {
      setRefreshing(p => ({ ...p, [key]: false }));
    }, 600);
  };

  const stats = useMemo(() => {
    let revenue = 0;
    let cogs = 0;
    
    const costMap: Record<string, number> = {};
    const variantMap: Record<string, Variant> = {};
    data.products.forEach(p => {
      p.variants.forEach(v => {
        costMap[v.id] = v.cost || 0;
        variantMap[v.id] = v;
      });
    });

    data.sales.forEach(sale => {
      if (sale.status !== "voided") {
        revenue += sale.total;
        sale.items.forEach((item: any) => {
          cogs += (item.quantity * (item.unitCost || costMap[item.variantId] || 0));
        });
      }
    });

    const grossProfit = revenue - cogs;

    let stockValue = 0;
    const lowStockAlerts: { variant: Variant, product: Product, qty: number }[] = [];
    const balancesByVariant: Record<string, number> = {};

    data.balances.forEach(b => {
      stockValue += (b.quantity * (costMap[b.variantId] || 0));
      balancesByVariant[b.variantId] = (balancesByVariant[b.variantId] || 0) + b.quantity;
    });

    Object.entries(balancesByVariant).forEach(([vid, q]) => {
      const v = variantMap[vid];
      if (v && q <= (v.minStock || 0)) {
        const p = data.products.find(prod => prod.variants.some(x => x.id === vid));
        if (p) lowStockAlerts.push({ variant: v, product: p, qty: q });
      }
    });

    // Recent Activities
    const activities = [
      ...data.sales.filter(s => s.status !== 'voided').map(s => ({ date: new Date(s.createdAt), type: 'Penjualan', desc: `Transaksi Penjualan via ${s.channel}`, amount: s.total, color: '#10b981' })),
      ...(data.receipts || []).filter(r => r.status !== 'cancelled').map(r => ({ date: new Date(r.createdAt), type: 'Stok Masuk', desc: `Penerimaan stok dari ${r.sourceType}`, amount: r.quantity * r.unitCost, color: '#3b82f6' })),
      ...data.transfers.filter(t => t.status !== 'cancelled').map(t => ({ date: new Date(t.createdAt), type: 'Transfer', desc: `Transfer stok antar lokasi`, amount: 0, color: '#f59e0b' }))
    ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 10);

    // Sales Trend (Last 7 Days)
    const salesTrend: { date: string, Omset: number, Modal: number }[] = [];
    for(let i=6; i>=0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
      salesTrend.push({ date: dateStr, Omset: 0, Modal: 0 });
    }
    
    data.sales.forEach(sale => {
      if (sale.status !== 'voided') {
        const sDate = new Date(sale.createdAt);
        const dayDiff = Math.floor((new Date().getTime() - sDate.getTime()) / (1000 * 3600 * 24));
        if (dayDiff >= 0 && dayDiff < 7) {
          const index = 6 - dayDiff;
          salesTrend[index].Omset += sale.total;
          let saleCogs = 0;
          sale.items.forEach((item: any) => { saleCogs += item.quantity * (item.unitCost || costMap[item.variantId] || 0); });
          salesTrend[index].Modal += saleCogs;
        }
      }
    });

    const salesByVariant: Record<string, number> = {};
    data.sales.forEach(s => {
      if (s.status !== "voided") {
        s.items.forEach(item => {
          salesByVariant[item.variantId] = (salesByVariant[item.variantId] || 0) + item.quantity;
        });
      }
    });

    const topProducts = Object.entries(salesByVariant)
      .map(([vid, q]) => ({
        variant: variantMap[vid],
        product: data.products.find(prod => prod.variants.some(x => x.id === vid)),
        qty: q
      }))
      .filter(x => x.variant && x.product)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
      
    // Profit / Loss Chart Data
    const profitData = [
      { name: 'Modal (HPP)', value: cogs, color: '#f87171' },
      { name: 'Estimasi Laba Kotor', value: grossProfit, color: '#10b981' }
    ];

    return {
      revenue,
      grossProfit,
      stockValue,
      lowStockAlerts,
      topProducts,
      activities,
      salesTrend,
      profitData,
      totalSalesCount: data.sales.filter(s => s.status !== 'voided').length,
      totalProductsCount: data.products.length,
      cogs
    };
  }, [data]);

  return (
    <PageBlock
      title="Dashboard Utama"
      desc="Ringkasan performa dan kesehatan bisnis Anda."
      action="Unduh Analitik Excel"
      onAction={async () => {
        const summaryData = [
          ["Total Omset", stats.revenue],
          ["Estimasi Laba Kotor", stats.grossProfit],
          ["Total Modal (HPP)", stats.cogs],
          ["Nilai Stok Saat Ini", stats.stockValue],
          ["Jumlah Transaksi Penjualan", stats.totalSalesCount],
          ["Total Varian Produk", stats.totalProductsCount]
        ];
        
        const trendData = stats.salesTrend.map((t: any) => [t.date, t.Omset, t.Modal]);
        const topProductsData = stats.topProducts.map((t: any, idx: number) => [idx + 1, t.product?.name || '-', t.variant?.name || '-', t.qty]);
        
        await downloadExcel(`Analitik_Bisnis_Veinstock_${new Date().toISOString().slice(0, 10)}`, [
          {
            name: "Ringkasan",
            columns: [
              { header: "Indikator", key: "indikator", width: 35 },
              { header: "Nilai", key: "totalnilai", width: 25 }
            ],
            data: summaryData
          },
          {
            name: "Tren 7 Hari Terakhir",
            columns: [
              { header: "Tanggal", key: "tanggal", width: 20 },
              { header: "Omset Penjualan", key: "omset", width: 25 },
              { header: "Modal (HPP)", key: "modal", width: 25 }
            ],
            data: trendData
          },
          {
            name: "Top 5 Produk Terlaris",
            columns: [
              { header: "Peringkat", key: "peringkat", width: 15 },
              { header: "Produk", key: "produk", width: 30 },
              { header: "Varian", key: "varian", width: 25 },
              { header: "Terjual (Qty)", key: "qty", width: 20 }
            ],
            data: topProductsData
          }
        ]);
        if(setData) {
           // Provide mock notify since notify is not passed to AnalyticsPage
           alert("Laporan Analitik Excel berhasil diunduh.");
        }
      }}
      secondaryAction="Cetak PDF"
      onSecondaryAction={() => {
        downloadPDF('analytics-dashboard-content', `Analitik_Bisnis_${new Date().toISOString().slice(0, 10)}`);
      }}
    >
      <div id="analytics-dashboard-content" style={{ padding: '4px', backgroundColor: 'var(--bg)' }}>
        <div className="dash-grid-top">
          {/* Aktivitas Terakhir */}
        <article className="dash-widget">
          <header>
            <h3>Aktivitas Terakhir</h3>
            <button className="icon-btn" style={{padding: 4, margin: -4}} onClick={() => handleRefresh("act")}><RotateCcw size={14} className={`text-muted ${refreshing.act ? "spin-anim" : ""}`} /></button>
          </header>
          <div className="widget-content scroll-y" style={{maxHeight: 220}}>
            {stats.activities.length === 0 ? <p className="empty-text">Belum ada aktivitas</p> : (
              <div className="timeline">
                {stats.activities.map((act, idx) => (
                  <div key={idx} className="timeline-item">
                    <div className="time-col">
                      <b>{act.date.toLocaleDateString('id-ID', {day:'2-digit'})}</b>
                      <small>{act.date.toLocaleDateString('id-ID', {month:'short'})}</small>
                    </div>
                    <div className="timeline-dot" style={{borderColor: act.color}}></div>
                    <div className="timeline-content">
                      <div className="time-badge">{act.date.toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'})}</div>
                      <p>{act.desc}</p>
                      {act.amount > 0 && <b>{money(act.amount)}</b>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </article>

        {/* Peringatan Stok */}
        <article className="dash-widget">
          <header>
            <h3>Peringatan Stok Menipis</h3>
            <button className="icon-btn" style={{padding: 4, margin: -4}} onClick={() => handleRefresh("stock")}><RotateCcw size={14} className={`text-muted ${refreshing.stock ? "spin-anim" : ""}`} /></button>
          </header>
          <div className="widget-content scroll-y" style={{maxHeight: 220}}>
            {stats.lowStockAlerts.length === 0 ? <p className="empty-text">Semua stok aman</p> : (
              <div className="timeline">
                {stats.lowStockAlerts.map((alert, idx) => (
                  <div key={idx} className="timeline-item">
                     <div className="timeline-dot" style={{borderColor: '#ef4444'}}></div>
                     <div className="timeline-content">
                        <div className="time-badge" style={{background: '#fee2e2', color: '#b91c1c'}}>Perhatian</div>
                        <p>{alert.product.name} - {alert.variant.name}</p>
                        <small>Sisa: {qty(alert.qty, alert.product.unit)} (Min: {qty(alert.variant.minStock, alert.product.unit)})</small>
                     </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </article>

        {/* Aset Saat Ini */}
        <article className="dash-widget">
          <header>
            <h3>Aset saat ini</h3>
            <button className="icon-btn" style={{padding: 4, margin: -4}} onClick={() => handleRefresh("asset")}><RotateCcw size={14} className={`text-muted ${refreshing.asset ? "spin-anim" : ""}`} /></button>
          </header>
          <div className="widget-content">
            <small style={{color:'var(--muted)'}}>Total Nilai Stok</small>
            <h2 style={{fontSize: 28, margin: '8px 0 24px', color: 'var(--navy)'}}>{money(stats.stockValue)}</h2>
            
            <div style={{display:'flex', justifyContent:'space-between', borderTop:'1px solid var(--line)', paddingTop: 16}}>
              <span className="text-muted">Total Transaksi</span>
              <b>{stats.totalSalesCount} kali</b>
            </div>
            <div style={{display:'flex', justifyContent:'space-between', marginTop: 8}}>
              <span className="text-muted">Total Barang</span>
              <b>{stats.totalProductsCount} jenis</b>
            </div>
          </div>
        </article>
      </div>

      <div className="dash-grid-middle">
        {/* Arus Kas / Bar Chart */}
        <article className="dash-widget">
          <header>
             <div>
               <h3>Penjualan vs Modal</h3>
               <small className="text-muted">Rentang Seminggu Terakhir</small>
             </div>
             <button className="icon-btn" style={{padding: 4, margin: -4}} onClick={() => handleRefresh("barchart")}><RotateCcw size={14} className={`text-muted ${refreshing.barchart ? "spin-anim" : ""}`} /></button>
          </header>
          <div className="widget-content" style={{paddingTop: 16, minWidth: 0, minHeight: 250}}>
             <ResponsiveContainer width="100%" height={250}>
               <BarChart data={stats.salesTrend} margin={{top:0, right:10, left:-20, bottom:0}}>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/>
                 <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                 <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} tickFormatter={(val) => `Rp${val/1000}k`}/>
                 <RechartsTooltip formatter={(val: any) => money(Number(val))} cursor={{fill: '#f8fafc'}}/>
                 <Legend iconType="circle" wrapperStyle={{fontSize: 12, paddingTop: 10}}/>
                 <Bar dataKey="Modal" name="Modal (HPP)" stackId="a" fill="#f87171" radius={[0,0,4,4]} barSize={24}/>
                 <Bar dataKey="Omset" name="Omset Kotor" stackId="a" fill="#34d399" radius={[4,4,0,0]} />
               </BarChart>
             </ResponsiveContainer>
          </div>
        </article>

        {/* Grafik Penjualan */}
        <article className="dash-widget">
          <header>
             <div>
               <h3>Tren Omset Penjualan</h3>
               <small className="text-muted">Rentang Seminggu Terakhir</small>
             </div>
             <button className="icon-btn" style={{padding: 4, margin: -4}} onClick={() => handleRefresh("linechart")}><RotateCcw size={14} className={`text-muted ${refreshing.linechart ? "spin-anim" : ""}`} /></button>
          </header>
          <div className="widget-content" style={{paddingTop: 16, minWidth: 0, minHeight: 250}}>
             <ResponsiveContainer width="100%" height={250}>
               <LineChart data={stats.salesTrend} margin={{top:0, right:10, left:-20, bottom:0}}>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/>
                 <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} />
                 <YAxis axisLine={false} tickLine={false} tick={{fontSize: 12, fill: '#64748b'}} tickFormatter={(val) => `Rp${val/1000}k`}/>
                 <RechartsTooltip formatter={(val: any) => money(Number(val))} />
                 <Line type="monotone" dataKey="Omset" stroke="#0ea5e9" strokeWidth={3} dot={{r: 4, fill: '#0ea5e9', strokeWidth: 2, stroke:'#fff'}} activeDot={{r: 6}} />
               </LineChart>
             </ResponsiveContainer>
          </div>
        </article>
      </div>
      
      <div className="dash-grid-bottom">
        {/* Laba Rugi */}
        <article className="dash-widget">
          <header>
             <h3>Estimasi Laba Kotor (Semua Waktu)</h3>
             <button className="icon-btn" style={{padding: 4, margin: -4}} onClick={() => handleRefresh("donut")}><RotateCcw size={14} className={`text-muted ${refreshing.donut ? "spin-anim" : ""}`} /></button>
          </header>
          <div className="widget-content" style={{display:'flex', alignItems:'center', height: 200}}>
             <div style={{width: '50%', height: '100%'}}>
               <ResponsiveContainer width="100%" height="100%">
                 <PieChart>
                   <Pie data={stats.profitData} innerRadius={55} outerRadius={75} paddingAngle={2} dataKey="value" stroke="none">
                     {stats.profitData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                   </Pie>
                   <RechartsTooltip formatter={(val: any) => money(Number(val))}/>
                 </PieChart>
               </ResponsiveContainer>
             </div>
             <div style={{width: '50%', paddingLeft: 16}}>
                <div style={{marginBottom: 12}}>
                  <div style={{display:'flex', alignItems:'center', gap: 6, fontSize: 13, color: 'var(--muted)'}}>
                    <span style={{width: 8, height: 8, borderRadius: '50%', background: '#34d399'}}></span> Omset Total
                  </div>
                  <b>{money(stats.revenue)}</b>
                </div>
                <div style={{marginBottom: 12}}>
                  <div style={{display:'flex', alignItems:'center', gap: 6, fontSize: 13, color: 'var(--muted)'}}>
                    <span style={{width: 8, height: 8, borderRadius: '50%', background: '#f87171'}}></span> Nilai HPP
                  </div>
                  <b>{money(stats.cogs)}</b>
                </div>
                <div style={{borderTop:'1px solid var(--line)', paddingTop: 8}}>
                  <div style={{fontSize: 13, color: 'var(--muted)'}}>Estimasi Laba Kotor</div>
                  <b style={{color: '#10b981', fontSize: 16}}>{money(stats.grossProfit)}</b>
                </div>
             </div>
          </div>
        </article>
        
        {/* Produk Terlaris */}
        <article className="dash-widget">
          <header>
             <h3>Produk Terlaris</h3>
             <button className="icon-btn" style={{padding: 4, margin: -4}} onClick={() => handleRefresh("top")}><RotateCcw size={14} className={`text-muted ${refreshing.top ? "spin-anim" : ""}`} /></button>
          </header>
          <div className="widget-content scroll-y" style={{height: 200, paddingRight: 8}}>
             {stats.topProducts.length === 0 ? <p className="empty-text">Belum ada data</p> : (
               <ul className="ranking-list" style={{gap: 0}}>
                 {stats.topProducts.map((p) => (
                   <li key={p.variant!.id} style={{padding: '12px 0', background: 'transparent', borderBottom: '1px solid var(--line)', borderRadius: 0, borderTop: 0, borderLeft: 0, borderRight: 0}}>
                     <div className="rank-info">
                       <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                         <b style={{margin: 0}}>{p.product!.name}</b>
                         <b style={{color:'#10b981', margin: 0}}>{qty(p.qty, p.product!.unit)}</b>
                       </div>
                       <small>{p.variant!.name}</small>
                     </div>
                   </li>
                 ))}
               </ul>
             )}
          </div>
        </article>
      </div>
      </div>
    </PageBlock>
  );
}

export default App;
