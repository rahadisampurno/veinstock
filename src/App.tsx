import { useEffect, useMemo, useRef, useState } from "react";
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
  LogOut,
  Menu,
  PackagePlus,
  Plus,
  RotateCcw,
  Search,
  Settings,
  ShoppingCart,
  Store,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import type {
  AppData,
  Channel,
  Product,
  SessionUser,
  StockUnit,
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
  | "users";
const money = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
const qty = (n: number, unit?: StockUnit) =>
  `${n.toLocaleString("id-ID")} ${unit === "pcs" ? "pcs" : unit || "unit"}`;

function App() {
  const [data, setData] = useState<AppData>(loadData);
  const [authUser, setAuthUser] = useState<SessionUser | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem("veinstock_user") || "null");
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState<string | null>(() =>
    sessionStorage.getItem("veinstock_token"),
  );
  const [hydrated, setHydrated] = useState(false);
  const [page, setPage] = useState<Page>("dashboard");
  const [sidebar, setSidebar] = useState(false);
  const [modal, setModal] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const serverVersion = useRef(0);
  const serverReady = useRef(false);
  const skipNextSync = useRef(false);
  const user = authUser;
  useEffect(() => {
    if (user) saveData(data, user.organizationId);
    if (!serverReady.current || skipNextSync.current) {
      skipNextSync.current = false;
      return;
    }
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
  const authenticate = async (endpoint: string, payload: object) => {
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
    sessionStorage.setItem("veinstock_user", JSON.stringify(result.user));
    sessionStorage.setItem("veinstock_token", result.token);
  };
  const login = (email: string, password: string) =>
    authenticate("/api/login", { email, password });
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
      sessionStorage.setItem("veinstock_user", JSON.stringify(updated));
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
    sessionStorage.removeItem("veinstock_user");
    sessionStorage.removeItem("veinstock_token");
  };
  const cancelTransaction = (kind: string, id: string, reason: string) => {
    setData((d) => {
      let balances = d.balances,
        movements = d.movements;
      if (kind === "sale") {
        const item = d.sales.find((x: any) => x.id === id);
        if (!item || item.status === "cancelled") return d;
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
              "Pembatalan penjualan",
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
                  status: "cancelled",
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
  if (!user || !token) return <Login onLogin={login} onRegister={register} />;
  if (!hydrated)
    return (
      <div className="loading-page">
        <div className="brand-mark"><img src="/veinstock-icon-192.png" alt="VEINSTOCK" /></div>
        <b>Memuat ruang usaha {user.organizationName}…</b>
      </div>
    );

  const nav = [
    ["dashboard", "Dashboard", LayoutDashboard],
    ["products", "Produk & Varian", Archive],
    ["locations", "Lokasi Usaha", Store],
    ["receipts", "Stok Masuk", ArrowDownToLine],
    ["stock", "Stok per Lokasi", Boxes],
    ["transfers", "Transfer Stok", ArrowRightLeft],
    ["sales", "Penjualan", ShoppingCart],
    ["returns", "Retur", RotateCcw],
    ["opname", "Stock Opname", ClipboardCheck],
    ["history", "Histori Stok", History],
    ["reports", "Laporan", BarChart3],
    ["business", "Profil Usaha", Settings],
    ["users", "Pengguna & Akses", Users],
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
    business: "Profil Usaha",
    users: "Pengguna & Hak Akses",
  };
  const allowed = (p: Page) =>
    user.role === "owner" ||
    (user.role === "pic"
      ? ![
          "users",
          "reports",
          "products",
          "locations",
          "receipts",
          "business",
        ].includes(p)
      : ["dashboard", "sales", "reports", "history"].includes(p));

  return (
    <div className="app-shell">
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
            <X />
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
          {nav
            .filter(([id]) => allowed(id as Page))
            .map(([id, label, Icon]) => (
              <button
                key={id}
                className={page === id ? "active" : ""}
                onClick={() => {
                  setPage(id as Page);
                  setSidebar(false);
                }}
              >
                <Icon />
                <span>{label}</span>
                {id === "transfers" &&
                  data.transfers.some((t) => t.status === "sent") && (
                    <em>
                      {data.transfers.filter((t) => t.status === "sent").length}
                    </em>
                  )}
              </button>
            ))}
        </nav>
        <div className="sidebar-user">
          <div className="avatar">{user.avatarUrl||(user.role==='owner'&&data.business?.logoUrl)?<img src={user.avatarUrl||data.business?.logoUrl} alt={user.name}/>:user.name.slice(0, 2).toUpperCase()}</div>
          <div>
            <b>{user.name}</b>
            <small>
              {user.role === "owner"
                ? "Owner"
                : user.role === "pic"
                  ? "PIC Outlet"
                  : "Keuangan"}
            </small>
          </div>
          <button className="icon-btn" aria-label="Keluar" onClick={logout}>
            <LogOut />
          </button>
        </div>
      </aside>
      <main>
        <header>
          <button
            className="icon-btn menu-btn"
            aria-label="Buka menu"
            onClick={() => setSidebar(true)}
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
                (b) => b.quantity < (variantMap[b.variantId]?.minStock || 0),
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
          </div>
        </header>
        <div className="content">
          {page === "dashboard" && (
            <Dashboard
              data={data}
              businessLogo={data.business?.logoUrl}
              variants={variantMap}
              locations={locationMap}
              setPage={setPage}
              organizationName={user.organizationName}
              canEdit={user.role !== "finance"}
            />
          )}
          {page === "products" && (
            <Products
              data={data}
              open={() => setModal("product")}
              edit={(productId: string, variantId: string) =>
                setModal(`product:${productId}:${variantId}`)
              }
            />
          )}
          {page === "locations" && (
            <LocationsPage
              data={data}
              open={() => setModal("location")}
              edit={(id: string) => setModal(`location:${id}`)}
            />
          )}
          {page === "receipts" && (
            <ReceiptsPage
              data={data}
              variants={variantMap}
              locations={locationMap}
              open={() => {
                if (
                  !data.products.some(
                    (p) =>
                      p.active && p.variants.some((v) => v.active !== false),
                  )
                )
                  return notify("Tambahkan produk aktif terlebih dahulu");
                setModal("receipt");
              }}
              cancel={(id: string) => setModal(`cancel:receipt:${id}`)}
            />
          )}
          {page === "stock" && <Stock data={data} variants={variantMap} />}
          {page === "transfers" && (
            <Transfers
              data={data}
              setData={setData}
              variants={variantMap}
              locations={locationMap}
              open={() => {
                if (data.locations.filter((l) => l.active).length < 2)
                  return notify(
                    "Tambahkan minimal dua lokasi aktif terlebih dahulu",
                  );
                if (!data.products.some((p) => p.variants.length))
                  return notify("Tambahkan produk dan varian terlebih dahulu");
                setModal("transfer");
              }}
              notify={notify}
              user={user.name}
              role={user.role}
              outletId={user.outletId}
              cancel={(id: string) => setModal(`cancel:transfer:${id}`)}
              detail={(id: string) => setModal(`transfer-detail:${id}`)}
            />
          )}
          {page === "sales" && (
            <Sales
              data={data}
              variants={variantMap}
              locations={locationMap}
              open={
                user.role === "finance"
                  ? undefined
                  : () => {
                      if (!data.products.some((p) => p.variants.length))
                        return notify(
                          "Tambahkan produk dan varian terlebih dahulu",
                        );
                      setModal("sale");
                    }
              }
              cancel={(id: string) => setModal(`cancel:sale:${id}`)}
              detail={(id: string) => setModal(`sale-detail:${id}`)}
            />
          )}
          {page === "returns" && (
            <ReturnsPage
              data={data}
              variants={variantMap}
              locations={locationMap}
              open={() => {
                if (
                  !data.products.some(
                    (p) =>
                      p.active && p.variants.some((v) => v.active !== false),
                  )
                )
                  return notify("Tambahkan produk aktif terlebih dahulu");
                setModal("return");
              }}
              cancel={(id: string) => setModal(`cancel:return:${id}`)}
            />
          )}
          {page === "opname" && (
            <Opname
              data={data}
              setData={setData}
              variants={variantMap}
              locations={locationMap}
              open={() => {
                if (!data.products.some((p) => p.variants.length))
                  return notify("Tambahkan produk dan varian terlebih dahulu");
                setModal("opname");
              }}
              notify={notify}
              user={user.name}
            />
          )}
          {page === "history" && (
            <HistoryPage
              data={data}
              variants={variantMap}
              locations={locationMap}
            />
          )}
          {page === "reports" && (
            <Reports
              data={data}
              variants={variantMap}
              locations={locationMap}
              notify={notify}
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
        </div>
      </main>
      {modal === "product" && (
        <ProductModal
          close={() => setModal(null)}
          uploadImage={uploadImage}
          save={(p: Product) => {
            setData((d) => ({ ...d, products: [...d.products, p] }));
            setModal(null);
            notify("Produk dan varian berhasil ditambahkan");
          }}
        />
      )}
      {modal?.startsWith("product:") &&
        (() => {
          const [, productId, variantId] = modal.split(":"),
            product = data.products.find((item) => item.id === productId),
            variant = product?.variants.find((item) => item.id === variantId);
          return product && variant ? (
            <ProductModal
              product={product}
              variant={variant}
              close={() => setModal(null)}
              uploadImage={uploadImage}
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
      {modal === "receipt" && (
        <ReceiptModal
          data={data}
          close={() => setModal(null)}
          save={(form: any) => {
            setData((d) => ({
              ...d,
              balances: adjustBalance(
                d.balances,
                form.locationId,
                form.variantId,
                form.quantity,
              ),
              receipts: [
                {
                  id: newId("rcv"),
                  ...form,
                  status: "completed",
                  createdAt: new Date().toISOString(),
                },
                ...(d.receipts || []),
              ],
              movements: [
                movement(
                  form.variantId,
                  form.locationId,
                  form.sourceType === "production"
                    ? "Hasil produksi"
                    : "Stok masuk",
                  form.quantity,
                  form.note || "Penerimaan barang",
                  user.name,
                ),
                ...d.movements,
              ],
            }));
            setModal(null);
            notify("Stok masuk berhasil dicatat dan saldo telah bertambah");
          }}
        />
      )}
      {modal === "return" && (
        <ReturnModal
          data={data}
          close={() => setModal(null)}
          save={(form: any) => {
            const delta =
              form.type === "customer" ? form.quantity : -form.quantity;
            if (
              delta < 0 &&
              getBalance(data.balances, form.locationId, form.variantId) <
                form.quantity
            )
              return notify("Stok tidak cukup untuk retur ke supplier");
            setData((d) => ({
              ...d,
              balances: adjustBalance(
                d.balances,
                form.locationId,
                form.variantId,
                delta,
              ),
              returns: [
                {
                  id: newId("ret"),
                  ...form,
                  status: "completed",
                  createdAt: new Date().toISOString(),
                },
                ...(d.returns || []),
              ],
              movements: [
                movement(
                  form.variantId,
                  form.locationId,
                  form.type === "customer"
                    ? "Retur pelanggan"
                    : "Retur ke supplier",
                  delta,
                  form.reason,
                  user.name,
                ),
                ...d.movements,
              ],
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
          save={(profile: any) => {
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
              save={(payload: object) => updateUser(selected.id, payload)}
            />
          ) : null;
        })()}
      {modal === "transfer" && (
        <TransferModal
          data={data}
          close={() => setModal(null)}
          save={(f: string, t: string, v: string, q: number) => {
            if (getBalance(data.balances, f, v) < q)
              return notify("Stok lokasi asal tidak mencukupi");
            setData((d) => ({
              ...d,
              balances: adjustBalance(d.balances, f, v, -q),
              transfers: [
                {
                  id: newId("trf"),
                  fromId: f,
                  toId: t,
                  variantId: v,
                  quantity: q,
                  status: "sent",
                  createdAt: new Date().toISOString(),
                },
                ...d.transfers,
              ],
              movements: [
                movement(
                  v,
                  f,
                  "Transfer keluar",
                  -q,
                  `Dikirim ke ${locationMap[t].name}`,
                  user.name,
                ),
                ...d.movements,
              ],
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
            v: string,
            amount: number,
            payment: string,
            cups?: number,
          ) => {
            const variant = variantMap[v];
            if (getBalance(data.balances, loc, v) < amount)
              return notify("Stok tidak mencukupi");
            const price =
              channel === "reseller" ? variant.resellerPrice : variant.price;
            setData((d) => ({
              ...d,
              balances: adjustBalance(d.balances, loc, v, -amount),
              sales: [
                {
                  id: newId("sale"),
                  locationId: loc,
                  channel,
                  total: amount * price,
                  payment,
                  createdAt: new Date().toISOString(),
                  items: [
                    {
                      variantId: v,
                      quantity: amount,
                      unit: variant.unit,
                      cups,
                    },
                  ],
                },
                ...d.sales,
              ],
              movements: [
                movement(
                  v,
                  loc,
                  `Penjualan ${channel}`,
                  -amount,
                  cups ? `${cups} gelas` : `${amount} ${variant.unit}`,
                  user.name,
                ),
                ...d.movements,
              ],
            }));
            setModal(null);
            notify("Penjualan tersimpan dan stok otomatis berkurang");
          }}
        />
      )}
      {modal === "opname" && (
        <OpnameModal
          data={data}
          fixedLocation={user.role === "pic" ? user.outletId : undefined}
          close={() => setModal(null)}
          save={(loc: string, v: string, actual: number, reason: string) => {
            const system = getBalance(data.balances, loc, v),
              diff = actual - system;
            setData((d) => ({
              ...d,
              balances: adjustBalance(d.balances, loc, v, diff),
              stockCounts: [
                {
                  id: newId("opn"),
                  locationId: loc,
                  variantId: v,
                  systemQty: system,
                  actualQty: actual,
                  difference: diff,
                  reason,
                  createdAt: new Date().toISOString(),
                },
                ...d.stockCounts,
              ],
              movements: [
                movement(v, loc, "Koreksi opname", diff, reason, user.name),
                ...d.movements,
              ],
            }));
            setModal(null);
            notify("Stock opname berhasil dicatat");
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
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (
    organizationName: string,
    name: string,
    email: string,
    password: string,
  ) => Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "register">("login"),
    [organization, setOrganization] = useState(""),
    [name, setName] = useState(""),
    [email, setEmail] = useState("owner@meneng.id"),
    [password, setPassword] = useState("VeinStock123!"),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const changeMode = (next: "login" | "register") => {
    setMode(next);
    setError("");
    if (next === "register") {
      setEmail("");
      setPassword("");
    }
  };
  return (
    <div className="login-page">
      <div className="login-art">
        <div className="brand light">
          <img className="brand-full-logo" src="/veinstock-logo-transparent-v2.png?v=20260724" alt="VEINSTOCK" />
        </div>
        <div className="hero-copy">
          <span>UNTUK SEMUA UMKM</span>
          <h1>
            Satu stok.
            <br />
            Semua outlet.
            <br />
            <i>Selalu sinkron.</i>
          </h1>
          <p>Setiap usaha memiliki ruang kerja dan data privatnya sendiri.</p>
        </div>
        <div className="login-stats">
          <div>
            <b>Aman</b>
            <span>Data terpisah</span>
          </div>
          <div>
            <b>Fleksibel</b>
            <span>Multi outlet</span>
          </div>
          <div>
            <b>24/7</b>
            <span>Terpantau</span>
          </div>
        </div>
      </div>
      <div className="login-panel">
        <form
          className="login-box"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            setLoading(true);
            try {
              if (mode === "login") await onLogin(email, password);
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
            <input
              type="password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
          </Field>
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
      </div>
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
}: any) {
  const today = data.sales.reduce((s: any, x: any) => s + x.total, 0);
  const low = data.balances.filter(
    (b: any) => b.quantity < (variants[b.variantId]?.minStock || 0),
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
          value={`${data.balances.length} saldo`}
          sub={`${data.products.flatMap((p: any) => p.variants).length} varian aktif`}
        />
        <Stat
          label="Transfer berjalan"
          value={data.transfers.filter((t: any) => t.status === "sent").length}
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
            {data.locations.map((l: any) => {
              return (
                <div key={l.id}>
                  <div className="location-icon">
                    {l.type === "warehouse" ? <Warehouse /> : <Store />}
                  </div>
                  <div>
                    <b>{l.name}</b>
                    <span>
                      {
                        data.balances.filter((b: any) => b.locationId === l.id)
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
              const val = data.sales
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
          <Activity data={data} variants={variants} locations={locations} />
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
function Activity({ data, variants, locations }: any) {
  return (
    <div className="activity">
      {data.movements.slice(0, 5).map((m: any) => (
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
  const [search,setSearch]=useState("");
  return (
    <PageBlock
      title="Daftar produk"
      desc="Kelola kategori, satuan, varian, dan harga jual."
      action="Tambah Produk"
      onAction={open}
    >
      <ListSearch value={search} setValue={setSearch} placeholder="Cari produk, varian, SKU, atau kategori" />
      <div className="product-grid">
        {data.products.map((p: any) =>
          p.variants.filter((v:any)=>`${p.name} ${p.category} ${v.name} ${v.sku}`.toLowerCase().includes(search.toLowerCase())).map((v: any) => (
            <article className="product-card" key={v.id}>
              <button
                className="card-edit"
                aria-label={`Edit ${p.name} ${v.name}`}
                onClick={() => edit(p.id, v.id)}
              >
                <Settings />
              </button>
              <div className="product-img">
                {v.imageUrl || (p.variants.length === 1 ? p.imageUrl : undefined) ? (
                  <img src={v.imageUrl || p.imageUrl} alt={`${p.name} ${v.name}`} loading="lazy" />
                ) : (
                  v.name.slice(0, 2).toUpperCase()
                )}
              </div>
              <span className="badge">{p.category}</span>
              {(!p.active||v.active===false)&&<span className="status danger">Nonaktif</span>}
              <h3>
                {p.name} · {v.name}
              </h3>
              <code>{v.sku}</code>
              <div>
                <small>Harga jual per {p.unit}</small>
                <b>{money(v.price)}</b>
              </div>
              <footer>
                <span>
                  {p.unit === "gram" && v.gramsPerCup
                    ? `1 gelas = ${v.gramsPerCup} gr`
                    : `Satuan: ${p.unit}`}
                </span>
                <span>Min. {qty(v.minStock, p.unit)}</span>
              </footer>
            </article>
          )),
        )}
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
          <article key={location.id}>
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
              onClick={() => edit(location.id)}
            >
              <Settings />
            </button>
          </article>
        ))}
      </div>
    </PageBlock>
  );
}
function ReceiptsPage({ data, variants, locations, open, cancel }: any) {
  const [search, setSearch] = useState("");
  const rows = (data.receipts || []).filter((x: any) =>
    `${x.supplierName || ""} ${locations[x.locationId]?.name || ""} ${variants[x.variantId]?.name || ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <PageBlock
      title="Stok masuk"
      desc="Catat pembelian supplier atau hasil produksi tanpa menggunakan stock opname."
      action="Catat Stok Masuk"
      onAction={open}
    >
      <ListSearch
        value={search}
        setValue={setSearch}
        placeholder="Cari supplier, lokasi, atau produk"
      />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Sumber</th>
              <th>Lokasi</th>
              <th>Produk</th>
              <th>Jumlah</th>
              <th>Nilai</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((item: any) => (
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
              <Empty text="Belum ada stok masuk." />
            )}
          </tbody>
        </table>
      </div>
    </PageBlock>
  );
}
function ReturnsPage({ data, variants, locations, open, cancel }: any) {
  const [search, setSearch] = useState("");
  const rows = (data.returns || []).filter((x: any) =>
    `${x.reason} ${locations[x.locationId]?.name || ""} ${variants[x.variantId]?.name || ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <PageBlock
      title="Retur barang"
      desc="Retur pelanggan menambah stok; retur supplier mengurangi stok."
      action="Catat Retur"
      onAction={open}
    >
      <ListSearch
        value={search}
        setValue={setSearch}
        placeholder="Cari produk, lokasi, atau alasan"
      />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Jenis</th>
              <th>Lokasi</th>
              <th>Produk</th>
              <th>Jumlah</th>
              <th>Alasan</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((item: any) => (
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
function Stock({ data, variants }: any) {
  const [loc, setLoc] = useState(data.locations[0].id),
    [search, setSearch] = useState("");
  const rows = data.balances.filter(
    (b: any) =>
      b.locationId === loc &&
      `${variants[b.variantId]?.name} ${variants[b.variantId]?.sku}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <PageBlock
      title="Saldo stok aktual"
      desc="Saldo dihitung otomatis dari seluruh pergerakan."
    >
      <div className="filters">
        <select value={loc} onChange={(e) => setLoc(e.target.value)}>
          {data.locations.map((l: any) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <label>
          <Search />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari varian atau SKU"
          />
        </label>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Varian</th>
              <th>SKU</th>
              <th>Saldo aktual</th>
              <th>Minimum</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((b: any) => {
                const v = variants[b.variantId],
                  low = b.quantity < v.minStock;
                return (
                  <tr key={`${b.locationId}-${b.variantId}`}>
                    <td>
                      <b>{v.name}</b>
                    </td>
                    <td>
                      <code>{v.sku}</code>
                    </td>
                    <td>
                      <strong>{qty(b.quantity, v.unit)}</strong>
                    </td>
                    <td>{qty(v.minStock, v.unit)}</td>
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
}: any) {
  const [search, setSearch] = useState("");
  const rows = data.transfers.filter((t: any) =>
    `${locations[t.fromId]?.name} ${locations[t.toId]?.name} ${variants[t.variantId]?.name}`
      .toLowerCase()
      .includes(search.toLowerCase()),
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
      action={role === "owner" ? "Buat Transfer" : undefined}
      onAction={open}
    >
      <ListSearch
        value={search}
        setValue={setSearch}
        placeholder="Cari rute atau produk"
      />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Rute</th>
              <th>Varian</th>
              <th>Jumlah</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((t: any) => (
                <tr key={t.id}>
                  <td>{new Date(t.createdAt).toLocaleDateString("id-ID")}</td>
                  <td>
                    <b>{locations[t.fromId]?.name}</b>
                    <br />
                    <small>ke {locations[t.toId]?.name}</small>
                  </td>
                  <td>{variants[t.variantId]?.name}</td>
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
    </PageBlock>
  );
}
function Sales({ data, variants, locations, open, cancel, detail }: any) {
  const [search, setSearch] = useState(""),
    [channel, setChannel] = useState("all");
  const rows = data.sales.filter(
    (s: any) =>
      (channel === "all" || s.channel === channel) &&
      `${locations[s.locationId]?.name} ${s.channel} ${variants[s.items[0]?.variantId]?.name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <PageBlock
      title="Transaksi penjualan"
      desc="Offline, online, dan reseller tercatat dalam satu laporan."
      action="Catat Penjualan"
      onAction={open}
    >
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
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Waktu</th>
              <th>Lokasi</th>
              <th>Kanal</th>
              <th>Item</th>
              <th>Pembayaran</th>
              <th>Total</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((s: any) => (
                <tr key={s.id}>
                  <td>{new Date(s.createdAt).toLocaleString("id-ID")}</td>
                  <td>{locations[s.locationId]?.name}</td>
                  <td>
                    <span className="status info">{s.channel}</span>
                  </td>
                  <td>
                    {variants[s.items[0].variantId]?.name}
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
                      className={`status ${s.status === "cancelled" ? "danger" : "ok"}`}
                    >
                      {s.status === "cancelled" ? "Dibatalkan" : "Selesai"}
                    </span>
                  </td>
                  <td className="actions-cell">
                    <button
                      className="table-action"
                      onClick={() => detail(s.id)}
                    >
                      Detail
                    </button>
                    {s.status !== "cancelled" && (
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
    </PageBlock>
  );
}
function Opname({ data, variants, locations, open }: any) {
  return (
    <PageBlock
      title="Stock opname"
      desc="Bandingkan stok sistem dan fisik tanpa menghapus histori."
      action="Mulai Opname"
      onAction={open}
    >
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Lokasi</th>
              <th>Varian</th>
              <th>Sistem</th>
              <th>Fisik</th>
              <th>Selisih</th>
              <th>Alasan</th>
            </tr>
          </thead>
          <tbody>
            {data.stockCounts.length ? (
              data.stockCounts.map((o: any) => (
                <tr>
                  <td>{new Date(o.createdAt).toLocaleString("id-ID")}</td>
                  <td>{locations[o.locationId].name}</td>
                  <td>{variants[o.variantId].name}</td>
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
                  <td>{o.reason}</td>
                </tr>
              ))
            ) : (
              <Empty text="Belum ada stock opname." />
            )}
          </tbody>
        </table>
      </div>
    </PageBlock>
  );
}
function HistoryPage({ data, variants, locations }: any) {
  return (
    <PageBlock
      title="Jejak stok"
      desc="Setiap perubahan tersimpan permanen untuk audit operasional."
    >
      <div className="timeline">
        {data.movements.map((m: any) => (
          <div>
            <i className={m.quantity >= 0 ? "in" : "out"} />
            <time>{new Date(m.createdAt).toLocaleString("id-ID")}</time>
            <section>
              <b>{m.type}</b>
              <span>
                {variants[m.variantId]?.name} · {locations[m.locationId]?.name}
              </span>
              <small>
                {m.note} · oleh {m.user}
              </small>
            </section>
            <strong className={m.quantity >= 0 ? "positive" : "negative"}>
              {m.quantity > 0 ? "+" : ""}
              {qty(m.quantity, variants[m.variantId]?.unit)}
            </strong>
          </div>
        ))}
      </div>
    </PageBlock>
  );
}
function Reports({ data, variants, locations, notify }: any) {
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
  const sales = data.sales.filter(
      (s: any) =>
        s.status !== "cancelled" &&
        new Date(s.createdAt).getTime() >= start &&
        (location === "all" || s.locationId === location) &&
        (channel === "all" || s.channel === channel) &&
        (product === "all" ||
          s.items.some((i: any) => i.variantId === product)),
    ),
    total = sales.reduce((a: number, s: any) => a + s.total, 0),
    sold: Record<string, number> = {};
  sales.forEach((s: any) =>
    s.items.forEach(
      (i: any) => (sold[i.variantId] = (sold[i.variantId] || 0) + i.quantity),
    ),
  );
  const top = Object.entries(sold).sort((a, b) => b[1] - a[1])[0],
    stockout = Object.entries(variants)
      .map(([id, v]: any) => {
        const balance = data.balances
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
  const download = () => {
    const clean = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`,
      rows = [
        [
          "Tanggal",
          "Outlet",
          "Kanal",
          "Produk",
          "Jumlah",
          "Pembayaran",
          "Total",
          "Status",
        ],
        ...sales.map((s: any) => [
          new Date(s.createdAt).toLocaleString("id-ID"),
          locations[s.locationId]?.name,
          s.channel,
          variants[s.items[0]?.variantId]?.name,
          s.items.reduce((a: number, i: any) => a + i.quantity, 0),
          s.payment,
          s.total,
          "Selesai",
        ]),
      ],
      blob = new Blob(
        ["\ufeff" + rows.map((r) => r.map(clean).join(",")).join("\n")],
        { type: "text/csv;charset=utf-8" },
      ),
      url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = `laporan-veinstock-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    notify(
      "Laporan berhasil diunduh. Cek folder Unduhan/Downloads pada perangkat Anda.",
    );
  };
  return (
    <PageBlock
      title="Laporan & analisis stok"
      desc="Saring per periode, outlet, produk, dan kanal."
      action="Unduh CSV"
      onAction={download}
    >
      <div className="filters report-filters">
        <select value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="day">Hari ini</option>
          <option value="week">7 hari</option>
          <option value="month">30 hari</option>
          <option value="all">Semua waktu</option>
        </select>
        <select value={location} onChange={(e) => setLocation(e.target.value)}>
          <option value="all">Semua outlet</option>
          {data.locations.map((l: any) => (
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
      <div className="report-hero">
        <div>
          <small>TOTAL PENJUALAN</small>
          <h2>{money(total)}</h2>
          <p>{sales.length} transaksi sesuai filter.</p>
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
          label="Nilai penjualan"
          value={money(total)}
          sub="Tidak termasuk transaksi batal"
        />
        <Stat
          label="Stok tertua"
          value={
            data.movements.length
              ? variants[data.movements[data.movements.length - 1]?.variantId]
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
            <article key={u.id}>
              <div className={`avatar ${u.role}`}>
                {u.avatarUrl||(u.role==='owner'&&businessLogo)?<img src={u.avatarUrl||businessLogo} alt={u.name}/>:u.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h3>{u.name}</h3>
                <p>{u.email}</p>
                <span className={`status ${u.active ? "ok" : "danger"}`}>
                  {u.active ? u.role : "nonaktif"}
                </span>
              </div>
              <button
                className="icon-btn user-edit"
                aria-label={`Edit ${u.name}`}
                onClick={() => edit(u.id)}
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
const PageBlock = ({ title, desc, action, onAction, children }: any) => (
  <>
    <section className="page-head">
      <div>
        <h2>{title}</h2>
        <p>{desc}</p>
      </div>
      {action && onAction && (
        <button className="primary" onClick={onAction}>
          <Plus />
          {action}
        </button>
      )}
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

const Modal = ({ title, desc, close, children }: any) => (
  <div className="modal-backdrop">
    <div className="modal">
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
  variant: initialVariant,
}: any) {
  const editing = Boolean(product && initialVariant),
    [name, setName] = useState(product?.name || ""),
    [category, setCategory] = useState(product?.category || "Umum"),
    [unit, setUnit] = useState<StockUnit>(product?.unit || "pcs"),
    [variantName, setVariantName] = useState(initialVariant?.name || ""),
    [sku, setSku] = useState(initialVariant?.sku || ""),
    [cost, setCost] = useState(initialVariant?.cost || 0),
    [price, setPrice] = useState(initialVariant?.price || 0),
    [resellerPrice, setResellerPrice] = useState(
      initialVariant?.resellerPrice || 0,
    ),
    [minimum, setMinimum] = useState(initialVariant?.minStock || 0),
    [cup, setCup] = useState(initialVariant?.gramsPerCup || 40),
    [additionalVariants, setAdditionalVariants] = useState(""),
    [active, setActive] = useState(product?.active ?? true),
    [variantActive, setVariantActive] = useState(initialVariant?.active ?? true),
    [file, setFile] = useState<File | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  return (
    <Modal
      title={editing ? "Edit produk & varian" : "Tambah produk"}
      desc="Atur produk sesuai jenis usaha dan satuan stoknya."
      close={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setLoading(true);
          try {
            const uploadedUrl = file ? await uploadImage(file) : undefined,
              updatedVariant = {
                id: initialVariant?.id || newId("v"),
                name: variantName,
                sku:
                  sku ||
                  `VST-${variantName.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-3)}`,
                cost,
                price,
                resellerPrice: resellerPrice || price,
                minStock: minimum,
                gramsPerCup: unit === "gram" ? cup : 0,
                active: variantActive,
                imageUrl: uploadedUrl || initialVariant?.imageUrl || (editing ? product.imageUrl : undefined),
              },
              updatedProduct: Product = editing
                ? {
                    ...product,
                    name,
                    category,
                    unit,
                    active,
                    imageUrl: uploadedUrl ? undefined : product.imageUrl,
                    variants: product.variants.map((item: any) =>
                      item.id === initialVariant.id ? updatedVariant : item,
                    ),
                  }
                : {
                    id: newId("prod"),
                    name,
                    category,
                    unit,
                    active: true,
                    imageUrl: undefined,
                    variants: [updatedVariant, ...additionalVariants.split(",").map((value:string)=>value.trim()).filter(Boolean).map((value:string,index:number)=>({...updatedVariant,id:newId("v"),name:value,sku:`VST-${value.slice(0,3).toUpperCase()}-${(Date.now()+index).toString().slice(-3)}`}))],
                  };
            save(updatedProduct);
          } catch (err) {
            setError(
              err instanceof Error ? err.message : "Gagal menyimpan produk",
            );
            setLoading(false);
          }
        }}
      >
        <Field label="Gambar produk (opsional)">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </Field>
        <small className="upload-hint">
          {editing && (initialVariant?.imageUrl || product.imageUrl)
            ? "Gambar lama tetap digunakan jika tidak memilih file baru. "
            : ""}
          Maksimal 5 MB, WebP 1200×1200 px.
        </small>
        <div className="form-grid">
          <Field label="Nama produk">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Kaos Polos"
            />
          </Field>
          <Field label="Kategori">
            <input
              required
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Contoh: Fashion"
            />
          </Field>
        </div>
        {!editing && <Field label="Varian tambahan sekaligus (pisahkan dengan koma)"><input value={additionalVariants} onChange={(e)=>setAdditionalVariants(e.target.value)} placeholder="Contoh: Hitam / M, Putih / L, Merah / XL"/></Field>}
        {editing && <div className="form-grid"><label className="toggle-field"><input type="checkbox" checked={active} onChange={(e)=>setActive(e.target.checked)}/><span>Produk aktif dan masih dijual</span></label><label className="toggle-field"><input type="checkbox" checked={variantActive} onChange={(e)=>setVariantActive(e.target.checked)}/><span>Varian aktif</span></label></div>}
        <div className="form-grid">
          <Field label="Nama varian">
            <input
              required
              value={variantName}
              onChange={(e) => setVariantName(e.target.value)}
              placeholder="Contoh: Hitam / L"
            />
          </Field>
          <Field label="SKU">
            <input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="Otomatis jika kosong"
            />
          </Field>
        </div>
        <Field label="Satuan stok">
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as StockUnit)}
          >
            <option value="pcs">Pcs</option>
            <option value="gram">Gram</option>
            <option value="ml">Mililiter</option>
          </select>
        </Field>
        {unit === "gram" && (
          <Field label="Gram per gelas">
            <input
              type="number"
              min="1"
              value={cup}
              onChange={(e) => setCup(+e.target.value)}
            />
          </Field>
        )}
        <div className="form-grid">
          <Field label={`Harga modal per ${unit}`}>
            <input
              type="number"
              min="0"
              required
              value={cost}
              onChange={(e) => setCost(+e.target.value)}
            />
          </Field>
          <Field label={`Harga jual per ${unit}`}>
            <input
              type="number"
              min="0"
              required
              value={price}
              onChange={(e) => setPrice(+e.target.value)}
            />
          </Field>
        </div>
        <div className="form-grid">
          <Field label={`Harga reseller per ${unit}`}>
            <input
              type="number"
              min="0"
              value={resellerPrice}
              onChange={(e) => setResellerPrice(+e.target.value)}
            />
          </Field>
          <Field label={`Minimum stok (${unit})`}>
            <input
              type="number"
              min="0"
              value={minimum}
              onChange={(e) => setMinimum(+e.target.value)}
            />
          </Field>
        </div>
        {error && <div className="login-error">{error}</div>}
        <footer className="modal-actions">
          <button type="button" className="secondary" onClick={close}>
            Batal
          </button>
          <button className="primary" disabled={loading}>
            <Check />
            {loading
              ? "Mengoptimalkan..."
              : editing
                ? "Simpan Perubahan"
                : "Simpan"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
function LocationModal({ close, save, location }: any) {
  const editing=Boolean(location),[name, setName] = useState(location?.name||""),
    [type, setType] = useState<"warehouse" | "outlet">(location?.type||"outlet"),[address,setAddress]=useState(location?.address||""),[active,setActive]=useState(location?.active??true);
  return (
    <Modal
      title={editing?"Edit lokasi usaha":"Tambah lokasi usaha"}
      desc="Stok lokasi ini akan dihitung dan diaudit secara terpisah."
      close={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(name, type, address, active);
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
        <ModalActions close={close} />
      </form>
    </Modal>
  );
}
function UserModal({ data, close, save, user, uploadImage }: any) {
  const editing = Boolean(user),
    isOwner = user?.role === "owner",
    [name, setName] = useState(user?.name || ""),
    [email, setEmail] = useState(user?.email || ""),
    [password, setPassword] = useState(""),
    [role, setRole] = useState<"owner" | "pic" | "finance">(
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
    [loading, setLoading] = useState(false);
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
              outletId: role === "pic" ? outletId : undefined,
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
        <Field label="Foto profil (opsional)"><input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={(e)=>setFile(e.target.files?.[0]||null)}/></Field>
        <small className="upload-hint">Foto otomatis dikompresi. {editing&&user.avatarUrl?'Kosongkan jika foto tidak diubah.':''}</small>
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
        <Field label={editing ? "Password baru (opsional)" : "Password awal"}>
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            required={!editing}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={editing ? "Kosongkan jika tidak diubah" : ""}
          />
        </Field>
        <Field label="Peran">
          <select
            value={role}
            disabled={isOwner}
            onChange={(e) => setRole(e.target.value as "pic" | "finance")}
          >
            {isOwner && <option value="owner">Owner</option>}
            <option value="pic">PIC Outlet</option>
            <option value="finance">Keuangan</option>
          </select>
        </Field>
        {role === "pic" && (
          <Field label="Outlet PIC">
            <select
              required
              value={outletId}
              onChange={(e) => setOutletId(e.target.value)}
            >
              {data.locations
                .filter((item: any) => item.type === "outlet")
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
          <button type="button" className="secondary" onClick={close}>
            Batal
          </button>
          <button className="primary" disabled={loading}>
            <Check />
            {loading ? "Menyimpan..." : editing ? "Simpan Perubahan" : "Simpan"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
function ReceiptModal({ data, close, save }: any) {
  const variants = data.products
      .filter((p: any) => p.active)
      .flatMap((p: any) =>
        p.variants
          .filter((v: any) => v.active !== false)
          .map((v: any) => ({ ...v, unit: p.unit, productName: p.name })),
      ),
    [sourceType, setSourceType] = useState<"supplier" | "production">(
      "supplier",
    ),
    [supplierName, setSupplierName] = useState(""),
    [locationId, setLocationId] = useState(
      data.locations.find((l: any) => l.active)?.id || "",
    ),
    [variantId, setVariantId] = useState(variants[0]?.id || ""),
    [quantity, setQuantity] = useState(1),
    [unitCost, setUnitCost] = useState(variants[0]?.cost || 0),
    [note, setNote] = useState(""),
    selected = variants.find((v: any) => v.id === variantId);
  return (
    <Modal
      title="Catat stok masuk"
      desc="Saldo langsung bertambah dan aktivitas tercatat dalam histori."
      close={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save({
            sourceType,
            supplierName: sourceType === "supplier" ? supplierName : undefined,
            locationId,
            variantId,
            quantity,
            unitCost,
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
              .filter((l: any) => l.active)
              .map((l: any) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Produk / varian">
          <select
            value={variantId}
            onChange={(e) => {
              const id = e.target.value;
              setVariantId(id);
              setUnitCost(variants.find((v: any) => v.id === id)?.cost || 0);
            }}
          >
            {variants.map((v: any) => (
              <option key={v.id} value={v.id}>
                {v.productName} · {v.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="form-grid">
          <Field label={`Jumlah (${selected?.unit || "unit"})`}>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(+e.target.value)}
            />
          </Field>
          <Field label={`Harga modal per ${selected?.unit || "unit"}`}>
            <input
              type="number"
              min="0"
              value={unitCost}
              onChange={(e) => setUnitCost(+e.target.value)}
            />
          </Field>
        </div>
        <Field label="Catatan">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Nomor faktur, batch, atau catatan produksi"
          />
        </Field>
        <ModalActions close={close} />
      </form>
    </Modal>
  );
}
function ReturnModal({ data, close, save }: any) {
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
    [variantId, setVariantId] = useState(variants[0]?.id || ""),
    [quantity, setQuantity] = useState(1),
    [reason, setReason] = useState(""),
    selected = variants.find((v: any) => v.id === variantId);
  return (
    <Modal
      title="Catat retur"
      desc="Perubahan stok dicatat otomatis tanpa menghapus transaksi asal."
      close={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save({ type, locationId, variantId, quantity, reason });
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
        <Field label="Produk / varian">
          <select
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
          >
            {variants.map((v: any) => (
              <option key={v.id} value={v.id}>
                {v.productName} · {v.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Jumlah (${selected?.unit || "unit"})`}>
          <input
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(+e.target.value)}
          />
        </Field>
        <Field label="Alasan retur">
          <textarea
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Contoh: Barang rusak atau salah kirim"
          />
        </Field>
        <ModalActions close={close} />
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
            save({ name, ownerName, phone, email, address, logoUrl });
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
        <Field label="Alamat usaha">
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </Field>
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
function TransferModal({ data, close, save }: any) {
  const activeLocations=data.locations.filter((l:any)=>l.active),variants = data.products.filter((p:any)=>p.active).flatMap((p: any) =>
      p.variants.filter((item:any)=>item.active!==false).map((item: any) => ({
        ...item,
        unit: p.unit,
        productName: p.name,
      })),
    ),
    [from, setFrom] = useState(activeLocations[0].id),
    [to, setTo] = useState(activeLocations[1].id),
    [v, setV] = useState(variants[0].id),
    [q, setQ] = useState(1),
    selected = variants.find((item: any) => item.id === v);
  return (
    <Modal
      title="Buat transfer stok"
      desc="Lokasi tujuan harus mengonfirmasi barang yang diterima."
      close={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(from, to, v, q);
        }}
      >
        <Field label="Lokasi asal">
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
        <Field label="Produk / varian">
          <select value={v} onChange={(e) => setV(e.target.value)}>
            {variants.map((item: any) => (
              <option key={item.id} value={item.id}>
                {item.productName} · {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Jumlah (${selected.unit})`}>
          <input
            type="number"
            min="1"
            value={q}
            onChange={(e) => setQ(+e.target.value)}
          />
        </Field>
        <ModalActions close={close} />
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
      fixedLocation || activeLocations[1]?.id || activeLocations[0].id,
    ),
    [channel, setChannel] = useState<Channel>("offline"),
    [v, setV] = useState(variants[0].id),
    [amount, setAmount] = useState(1),
    [useCups, setUseCups] = useState(false),
    [payment, setPayment] = useState("QRIS"),
    selected = variants.find((item: any) => item.id === v),
    canUseCups = selected.unit === "gram" && Boolean(selected.gramsPerCup);
  return (
    <Modal
      title="Catat penjualan"
      desc="Gunakan jumlah satuan stok atau konversi gelas untuk produk mix."
      close={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const baseAmount =
            useCups && canUseCups
              ? Math.round(amount * selected.gramsPerCup)
              : amount;
          save(
            loc,
            channel,
            v,
            baseAmount,
            payment,
            useCups ? amount : undefined,
          );
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
        <Field label="Produk / varian">
          <select
            value={v}
            onChange={(e) => {
              setV(e.target.value);
              setUseCups(false);
            }}
          >
            {variants.map((item: any) => (
              <option key={item.id} value={item.id}>
                {item.productName} · {item.name}
              </option>
            ))}
          </select>
        </Field>
        {canUseCups && (
          <Field label="Cara input">
            <select
              value={useCups ? "cups" : "base"}
              onChange={(e) => setUseCups(e.target.value === "cups")}
            >
              <option value="base">Gram langsung</option>
              <option value="cups">
                Jumlah gelas ({selected.gramsPerCup} gr/gelas)
              </option>
            </select>
          </Field>
        )}
        <div className="form-grid">
          <Field label={useCups ? "Jumlah gelas" : `Jumlah (${selected.unit})`}>
            <input
              type="number"
              step={useCups ? "0.25" : "1"}
              min={useCups ? "0.25" : "1"}
              value={amount}
              onChange={(e) => setAmount(+e.target.value)}
            />
          </Field>
          <Field label="Pembayaran">
            <select
              value={payment}
              onChange={(e) => setPayment(e.target.value)}
            >
              <option>QRIS</option>
              <option>Tunai</option>
              <option>Transfer</option>
            </select>
          </Field>
        </div>
        <ModalActions close={close} />
      </form>
    </Modal>
  );
}
function OpnameModal({ data, close, save, fixedLocation }: any) {
  const variants = data.products.flatMap((p: any) =>
      p.variants.map((item: any) => ({
        ...item,
        unit: p.unit,
        productName: p.name,
      })),
    ),
    [loc, setLoc] = useState(
      fixedLocation || data.locations[1]?.id || data.locations[0].id,
    ),
    [v, setV] = useState(variants[0].id),
    [actual, setActual] = useState(0),
    [reason, setReason] = useState("Hasil hitung fisik akhir hari"),
    selected = variants.find((item: any) => item.id === v);
  return (
    <Modal
      title="Catat stock opname"
      desc="Selisih akan menjadi koreksi dengan jejak audit."
      close={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(loc, v, actual, reason);
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
        <Field label="Produk / varian">
          <select value={v} onChange={(e) => setV(e.target.value)}>
            {variants.map((item: any) => (
              <option key={item.id} value={item.id}>
                {item.productName} · {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Stok fisik (${selected.unit})`}>
          <input
            type="number"
            min="0"
            value={actual}
            onChange={(e) => setActual(+e.target.value)}
          />
        </Field>
        <Field label="Alasan / catatan">
          <textarea
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <ModalActions close={close} />
      </form>
    </Modal>
  );
}
function CancelModal({close,save}:any){const[reason,setReason]=useState("");return <Modal title="Batalkan transaksi" desc="Stok akan dikoreksi otomatis. Transaksi asli dan alasan tetap ada dalam histori." close={close}><form onSubmit={(e)=>{e.preventDefault();save(reason)}}><Field label="Alasan pembatalan / koreksi"><textarea required minLength={5} value={reason} onChange={(e)=>setReason(e.target.value)} placeholder="Contoh: Salah memilih produk atau jumlah"/></Field><footer className="modal-actions"><button type="button" className="secondary" onClick={close}>Kembali</button><button className="danger-button" type="submit"><RotateCcw/>Batalkan transaksi</button></footer></form></Modal>}
function SaleDetail({item,variants,locations,close}:any){if(!item)return null;return <Modal title={`Detail transaksi ${item.id}`} desc="Rincian lengkap transaksi penjualan." close={close}><div className="detail-list"><p><span>Waktu</span><b>{new Date(item.createdAt).toLocaleString('id-ID')}</b></p><p><span>Lokasi</span><b>{locations[item.locationId]?.name}</b></p><p><span>Kanal / pembayaran</span><b>{item.channel} · {item.payment}</b></p>{item.items.map((line:any)=><p key={line.variantId}><span>{variants[line.variantId]?.productName} · {variants[line.variantId]?.name}</span><b>{qty(line.quantity,variants[line.variantId]?.unit)}</b></p>)}<p><span>Total</span><b>{money(item.total)}</b></p><p><span>Status</span><b>{item.status==='cancelled'?`Dibatalkan: ${item.cancelReason}`:'Selesai'}</b></p></div></Modal>}
function TransferDetail({item,business,variants,locations,close,notify}:any){if(!item)return null;const html=`<!doctype html><meta charset="utf-8"><title>Bukti ${item.id}</title><style>body{font:16px Arial;max-width:700px;margin:50px auto;color:#10233b}h1{color:#063858}table{width:100%;border-collapse:collapse}td{padding:12px;border-bottom:1px solid #ddd}td:last-child{text-align:right;font-weight:bold}</style><h1>${business?.name||'VEINSTOCK'}</h1><h2>Bukti Transfer Stok</h2><table><tr><td>Nomor</td><td>${item.id}</td></tr><tr><td>Tanggal</td><td>${new Date(item.createdAt).toLocaleString('id-ID')}</td></tr><tr><td>Rute</td><td>${locations[item.fromId]?.name} → ${locations[item.toId]?.name}</td></tr><tr><td>Produk</td><td>${variants[item.variantId]?.productName} · ${variants[item.variantId]?.name}</td></tr><tr><td>Jumlah</td><td>${qty(item.quantity,variants[item.variantId]?.unit)}</td></tr><tr><td>Status</td><td>${item.status}</td></tr></table>`;const download=()=>{const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`bukti-transfer-${item.id}.html`;a.click();URL.revokeObjectURL(url);notify('Bukti transfer diunduh. Cek folder Unduhan/Downloads pada perangkat Anda.')};const print=()=>{const win=window.open('','_blank');if(!win)return notify('Izinkan popup browser untuk mencetak bukti.');win.document.write(html);win.document.close();win.print()};return <Modal title="Bukti transfer stok" desc="Bukti dapat dicetak atau diunduh dan dibuka kembali." close={close}><div className="detail-list"><p><span>Nomor</span><b>{item.id}</b></p><p><span>Rute</span><b>{locations[item.fromId]?.name} → {locations[item.toId]?.name}</b></p><p><span>Produk</span><b>{variants[item.variantId]?.productName} · {variants[item.variantId]?.name}</b></p><p><span>Jumlah</span><b>{qty(item.quantity,variants[item.variantId]?.unit)}</b></p><p><span>Status</span><b>{item.status}</b></p></div><footer className="modal-actions"><button className="secondary" onClick={print}>Cetak</button><button className="primary" onClick={download}><Download/>Unduh Bukti</button></footer></Modal>}
function Notifications({data,variants,locations,close,act}:any){const low=data.balances.filter((b:any)=>b.quantity<(variants[b.variantId]?.minStock||0));return <Modal title="Notifikasi stok" desc="Setiap pemberitahuan dilengkapi tindakan yang dapat dilakukan." close={close}>{low.length?<div className="notification-list">{low.map((b:any)=><article key={`${b.locationId}-${b.variantId}`}><div><b>{variants[b.variantId]?.productName} · {variants[b.variantId]?.name}</b><span>{locations[b.locationId]?.name}: tersisa {qty(b.quantity,variants[b.variantId]?.unit)}, minimum {qty(variants[b.variantId]?.minStock,variants[b.variantId]?.unit)}</span></div><button className="small-primary" onClick={()=>act('receipts')}>Tambah stok</button></article>)}</div>:<div className="empty standalone"><Check/><b>Semua stok aman</b><span>Tidak ada saldo di bawah batas minimum.</span></div>}</Modal>}
const ListSearch=({value,setValue,placeholder}:any)=><label className="list-search"><Search/><input value={value} onChange={(e)=>setValue(e.target.value)} placeholder={placeholder}/></label>;
const Field = ({ label, children }: any) => (
  <label className="field">
    <span>{label}</span>
    {children}
  </label>
);
const ModalActions = ({ close }: any) => (
  <footer className="modal-actions">
    <button type="button" className="secondary" onClick={close}>
      Batal
    </button>
    <button className="primary" type="submit">
      <Check />
      Simpan
    </button>
  </footer>
);
export default App;
