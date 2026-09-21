/* =========================================================
   PORTAL KOM 3 - FRONTEND V1.6.0
   GitHub Pages + Google Apps Script API

   FITUR V1.1 TETAP:
   - Login / logout
   - Daftar akun
   - Dashboard personal
   - Agenda / pengumuman
   - Aktivasi anggota
   - Role / jabatan
   - Absensi Admin/Pengurus
   - Kehadiran Saya

   TAMBAHAN V1.2:
   - Admin Center
   - Ringkasan admin
   - Izin Tidak Hadir
   - Upload bukti izin
   - Riwayat izin
   - Verifikasi izin

   TAMBAHAN V1.2.3 TETAP:
   - Arsip Rapat & Materi
   - Materi / Notulen / Hasil Rapat / Dokumentasi
   - Link Drive/Docs/URL berbagi

   TAMBAHAN V1.2.4:
   - Mobile Compact UI (maks. 3-5 item awal)
   - Agenda anggota: Akan Datang / Aktif / Riwayat
   - Search, filter, tab, dan Muat lainnya
   - Jadwal salat ringkas di dashboard
   - Fondasi QRIS Kas dari pengaturan Portal

   TAMBAHAN V1.2.5:
   - Konfirmasi pembayaran kas QRIS
   - Riwayat kas anggota compact
   - Verifikasi khusus Admin/Bendahara
   - Status pembayaran tampil pada dashboard

   TAMBAHAN V1.3:
   - Keuangan MGMP lengkap
   - Saldo, pemasukan, pengeluaran, tunggakan kas
   - Rekap kas anggota per bulan
   - Laporan bulanan/tahun ajaran

   TAMBAHAN V1.4:
   - Kartu Anggota Digital
   - QR token unik per anggota
   - Scanner QR kehadiran
   - Absensi manual tetap dipertahankan

   TAMBAHAN V1.4.1:
   - Laporan keuangan umum read-only untuk anggota
   - Kartu digital premium menampilkan jabatan organisasi
   - Scanner QR: Admin, Ketua, Sekretaris, Bendahara

   TAMBAHAN V1.4.2:
   - Cache client-side untuk mempercepat buka ulang fitur
   - Dedup request agar request yang sama tidak dikirim ganda
   - Keuangan Manager: lazy-load data berat per tab
   - Scanner QR tanpa refresh dashboard setiap peserta
   - Premium scan bell + toggle suara

   TAMBAHAN V1.4.3:
   - Lupa password via OTP email
   - Ikon mata pada password pendaftaran/reset
   - Foto profil dikompres WebP sebelum dikirim
   - Avatar dashboard + pembaruan foto lewat menu Profil

   HOTFIX V1.4.3.2:
   - Bridge foto profil PRIVATE dari Apps Script ke browser
   - Foto Drive tidak perlu dibagikan publik
   - Base64 private hanya dipakai untuk display akun yang sedang login
   - Cache ringan agar foto tidak diambil ulang terus-menerus

   TAMBAHAN V1.5:
   - Bank Berbagi / Perangkat Pembelajaran
   - Kontribusi link Drive dari seluruh anggota
   - Review Admin/Pengurus sebelum terbit
   - Search + filter + pagination 5 item per halaman

   TAMBAHAN V1.6:
   - Hari Belajar Guru: jadwal, giliran sekolah/guru, dan riwayat
   - Bank Praktik Baik dari sesi yang telah selesai
   - Materi/video memakai link eksternal agar Portal tetap ringan
   - Terhubung ke Agenda/Absensi lama melalui AGENDA_ID
   - Admin/Pengurus dapat melihat daftar peserta dari absensi
========================================================= */

const APP_CONFIG = {
  apiUrl: "https://script.google.com/macros/s/AKfycbzAZZn-ZT12OhGoAkULfvS_gtP29fUSvrrEME6xNJXaY2Wn9UFtBQLwOLC6pw1cusHLug/exec",
  maxProofBytes: 2 * 1024 * 1024
};

let currentUser = null;
let sessionToken = localStorage.getItem("kom3_token") || "";
let toastTimer = null;
let prayerWidgetData = null;

const COMPACT_PAGE_SIZE = 5;

const compactUI = {
  users: { items: [], tab: "PENDING", query: "", visible: 5 },
  agendaManager: { items: [], tab: "RENCANA", query: "", visible: 5 },
  announcements: { items: [], tab: "AKTIF", query: "", visible: 5 },
  publicAgenda: { items: [], documents: [], tab: "UPCOMING", visible: 3 },
  archive: {
    documents: [],
    agendas: [],
    isManager: false,
    query: "",
    type: "ALL",
    year: "ALL",
    visible: 5,
    detailVisible: 5,
    agendaFilter: "",
    currentAgendaId: "",
    title: "Arsip Rapat & Materi"
  },
  attendance: { items: [], agenda: null, tab: "BELUM", query: "", visible: 5 },
  myAttendance: { items: [], visible: 5 },
  leave: { agendas: [], history: [], filter: "ALL", visible: 5 },
  leaveReview: { items: [], tab: "PENDING", query: "", visible: 5 },
  publicAnnouncements: { items: [], visible: 5 },
  kas: { payments: [], periods: [], currentPeriod: "", currentStatus: "BELUM_BAYAR", visible: 5 },
  kasReview: { items: [], tab: "MENUNGGU", query: "", visible: 5 },
  finance: {
    summary: null, ledger: [], members: [], monthly: [], periods: [],
    tahunAjaran: "", period: "", tab: "SUMMARY",
    transactionFilter: "ALL", transactionQuery: "", transactionVisible: 5,
    memberStatus: "BELUM_BAYAR", memberQuery: "", memberVisible: 5,
    reportVisible: 5,
    ledgerLoaded: false, membersLoaded: false
  },
  financePublic: { summary: null, monthly: [], years: [], tahunAjaran: "", page: 1 },
  qr: {
    card: null, stream: null, detector: null, scanning: false, lastPayload: "",
    soundEnabled: localStorage.getItem("kom3_scan_sound") !== "off"
  },
  bank: {
    published: [], mine: [], review: [], isManager: false,
    tab: "BANK", query: "", type: "ALL", kelas: "ALL", semester: "ALL",
    page: 1, myPage: 1, reviewPage: 1, reviewStatus: "MENUNGGU"
  },
  hbg: {
    items: [], agendas: [], isManager: false, defaultYear: "",
    tab: "NEXT", query: "", year: "ALL", manageStatus: "ALL", page: 1,
    participants: [], participantPage: 1, participantProgram: null
  },
  portalSettings: null
};

let scanAudioContext = null;
let portalWarmupStarted = false;
let pendingRegisterPhoto = null;
let pendingProfilePhoto = null;
let forgotResetState = { identifier: "", maskedEmail: "" };

// V1.4.3.2 - foto profil private hanya hidup pada sesi browser aktif.
// Data URL tidak ditulis ke sheet dan tidak mengganti PHOTO_URL/PHOTO_FILE_ID.
let resolvedProfilePhotoDataUrl = "";
let resolvedProfilePhotoFileId = "";
let profilePhotoLoadPromise = null;


/* =========================================================
   API
========================================================= */

const API_CACHE_PREFIX = "kom3_v150_cache_";
const API_READ_TTL = {
  dashboard: 30000,
  adminSummary: 20000,
  listUsers: 45000,
  listAgendas: 60000,
  listAnnouncements: 60000,
  attendanceManager: 15000,
  myAttendance: 30000,
  agendaOptions: 60000,
  myLeaves: 30000,
  listLeavesManager: 20000,
  listMeetingDocuments: 60000,
  listAgendasPublic: 90000,
  listAnnouncementsPublic: 90000,
  portalSettings: 300000,
  prayerTimes: 600000,
  kasMySummary: 20000,
  listKasPaymentsManager: 20000,
  financeSummary: 20000,
  financeTransactions: 20000,
  financeMemberRecap: 20000,
  financePublicSummary: 30000,
  myDigitalCard: 300000,
  getMyProfilePhoto: 300000,
  qrAttendanceContext: 15000,
  listLearningResources: 45000
};

const API_MUTATION_ACTIONS = new Set([
  "approveUser", "rejectUser", "updateUserAccess", "resetUserPassword",
  "markAttendance", "submitLeave", "reviewLeave",
  "saveAgenda", "setAgendaStatus",
  "saveAnnouncement", "setAnnouncementStatus",
  "saveMeetingDocument", "setMeetingDocumentStatus",
  "savePortalSettings", "submitKasPayment", "reviewKasPayment",
  "saveFinanceTransaction", "setFinanceTransactionStatus",
  "rotateMyQrToken", "scanAttendanceQr",
  "resetPasswordWithOtp", "updateProfilePhoto",
  "submitLearningResource", "reviewLearningResource", "setLearningResourceStatus"
]);

const apiMemoryCache = new Map();
const apiInflightRequests = new Map();

function stableApiPayload_(payload) {
  const source = payload || {};
  const copy = {};
  Object.keys(source).sort().forEach(key => {
    if (key === "token") return;
    copy[key] = source[key];
  });
  return JSON.stringify(copy);
}

function simpleHash_(text) {
  let hash = 2166136261;
  const value = String(text || "");
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function apiCacheKey_(action, payload) {
  const userKey = currentUser && currentUser.id ? currentUser.id : "anon";
  return action + "|" + userKey + "|" + stableApiPayload_(payload);
}

function readApiCache_(key, ttl) {
  const now = Date.now();
  const memory = apiMemoryCache.get(key);
  if (memory && now - memory.time <= ttl) return memory.value;

  try {
    const raw = sessionStorage.getItem(API_CACHE_PREFIX + simpleHash_(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.key !== key || now - Number(parsed.time || 0) > ttl) {
      sessionStorage.removeItem(API_CACHE_PREFIX + simpleHash_(key));
      return null;
    }
    apiMemoryCache.set(key, { time: parsed.time, value: parsed.value });
    return parsed.value;
  } catch (e) {
    return null;
  }
}

function writeApiCache_(key, value) {
  const item = { time: Date.now(), value };
  apiMemoryCache.set(key, item);
  try {
    sessionStorage.setItem(
      API_CACHE_PREFIX + simpleHash_(key),
      JSON.stringify({ key, time: item.time, value })
    );
  } catch (e) {
    // Jika storage browser penuh, cache memory tetap bekerja.
  }
}

function clearApiReadCache() {
  apiMemoryCache.clear();
  apiInflightRequests.clear();
  try {
    const removeKeys = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.indexOf(API_CACHE_PREFIX) === 0) removeKeys.push(key);
    }
    removeKeys.forEach(key => sessionStorage.removeItem(key));
  } catch (e) {}
}

function primeApiReadCache_(action, payload, value) {
  if (!API_READ_TTL[action] || !value || !value.success) return;
  writeApiCache_(apiCacheKey_(action, payload || {}), value);
}

function schedulePortalWarmup() {
  if (portalWarmupStarted || !sessionToken || !currentUser) return;
  portalWarmupStarted = true;
  setTimeout(() => portalWarmup_().catch(() => {}), 700);
}

async function portalWarmup_() {
  const res = await performApiRequest_("performancePrefetch", { token: sessionToken });
  if (!res || !res.success || !res.payloads) return;
  const p = res.payloads;
  const tokenPayload = { token: sessionToken };

  if (p.listAgendasPublic) primeApiReadCache_("listAgendasPublic", tokenPayload, p.listAgendasPublic);
  if (p.listAnnouncementsPublic) primeApiReadCache_("listAnnouncementsPublic", tokenPayload, p.listAnnouncementsPublic);
  if (p.myAttendance) primeApiReadCache_("myAttendance", tokenPayload, p.myAttendance);
  if (p.kasMySummary) primeApiReadCache_("kasMySummary", tokenPayload, p.kasMySummary);
  if (p.financePublicSummary) primeApiReadCache_("financePublicSummary", { token: sessionToken, tahunAjaran: "" }, p.financePublicSummary);

  if (p.adminSummary) primeApiReadCache_("adminSummary", tokenPayload, p.adminSummary);
  if (p.listAgendas) primeApiReadCache_("listAgendas", tokenPayload, p.listAgendas);
  if (p.listAnnouncements) primeApiReadCache_("listAnnouncements", tokenPayload, p.listAnnouncements);
  if (p.listMeetingDocuments) primeApiReadCache_("listMeetingDocuments", tokenPayload, p.listMeetingDocuments);
  if (p.financeSummary) primeApiReadCache_("financeSummary", tokenPayload, p.financeSummary);
}

async function performApiRequest_(action, payload) {
  if (!APP_CONFIG.apiUrl || APP_CONFIG.apiUrl.includes("PASTE_URL_APPS_SCRIPT")) {
    throw new Error("URL Apps Script belum dimasukkan pada app.js.");
  }

  const response = await fetch(APP_CONFIG.apiUrl, {
    method: "POST",
    redirect: "follow",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({ action, ...payload })
  });

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("Server response:", text);
    throw new Error("Server tidak memberikan response yang valid.");
  }
}

async function apiRequest(action, payload = {}) {
  const ttl = Number(API_READ_TTL[action] || 0);
  const cacheKey = ttl ? apiCacheKey_(action, payload) : "";

  if (ttl) {
    const cached = readApiCache_(cacheKey, ttl);
    if (cached) return cached;
    if (apiInflightRequests.has(cacheKey)) return apiInflightRequests.get(cacheKey);
  }

  const task = performApiRequest_(action, payload)
    .then(result => {
      if (ttl && result && result.success) writeApiCache_(cacheKey, result);
      if (API_MUTATION_ACTIONS.has(action) && result && result.success) clearApiReadCache();
      return result;
    })
    .finally(() => {
      if (ttl) apiInflightRequests.delete(cacheKey);
    });

  if (ttl) apiInflightRequests.set(cacheKey, task);
  return task;
}


/* =========================================================
   PAGE
========================================================= */

function hideAllPages() {
  ["loginPage", "registerPage", "dashboardPage"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  });
}

function showLogin() {
  hideAllPages();
  document.getElementById("loginPage").classList.remove("hidden");
  window.scrollTo(0, 0);
}

function showRegister() {
  hideAllPages();
  document.getElementById("registerPage").classList.remove("hidden");
  window.scrollTo(0, 0);
}

function showDashboard() {
  hideAllPages();
  document.getElementById("dashboardPage").classList.remove("hidden");
  window.scrollTo(0, 0);
}


/* =========================================================
   PASSWORD
========================================================= */

function togglePassword() {
  togglePasswordField("loginPassword");
}

function togglePasswordField(inputId, button) {
  const input = document.getElementById(inputId);
  if (!input) return;

  const show = input.type === "password";
  input.type = show ? "text" : "password";

  const btn = button || (input.parentElement ? input.parentElement.querySelector(".eye-button") : null);
  if (btn) {
    btn.textContent = show ? "🙈" : "👁";
    btn.setAttribute("aria-label", show ? "Sembunyikan password" : "Tampilkan password");
  }
}



/* =========================================================
   V1.4.3 - LUPA PASSWORD VIA OTP EMAIL
========================================================= */

function openForgotPassword() {
  forgotResetState = { identifier: "", maskedEmail: "" };

  setModalHtml(`
    <div class="modal-handle"></div>
    <button class="modal-close" type="button" onclick="closeModal()">×</button>
    <div class="modal-icon">🔐</div>
    <h3>Lupa Password</h3>
    <p class="modal-subtitle">Masukkan username atau email. Kode OTP akan dikirim ke email yang terdaftar.</p>

    <div class="forgot-step-card">
      <label class="modal-label">Username / Email</label>
      <input id="forgotIdentifier" class="portal-input" type="text" placeholder="contoh: candra atau email@gmail.com" autocomplete="username">
      <button id="forgotOtpButton" class="primary-button" type="button" onclick="requestPasswordResetOtp()">KIRIM OTP</button>
    </div>

    <div class="secure-note compact-secure-note">
      <span class="secure-icon">🛡️</span>
      <span>Password lama tidak pernah ditampilkan. Reset hanya dapat dilakukan dengan OTP email.</span>
    </div>
  `);

  setTimeout(() => {
    const el = document.getElementById("forgotIdentifier");
    if (el) el.focus();
  }, 80);
}


async function requestPasswordResetOtp() {
  const identifier = valueOf("forgotIdentifier");

  if (!identifier) {
    showToast("Masukkan username atau email.");
    return;
  }

  setButtonLoading("forgotOtpButton", true, "Mengirim OTP...");

  try {
    const res = await apiRequest("requestPasswordReset", { identifier });

    if (!res.success) {
      showToast(res.message || "OTP belum dapat dikirim.");
      return;
    }

    forgotResetState.identifier = identifier;
    forgotResetState.maskedEmail = res.maskedEmail || "";
    renderForgotPasswordResetForm();
    showToast(res.message || "Periksa email untuk kode OTP.");
  } catch (err) {
    showToast(err.message);
  } finally {
    setButtonLoading("forgotOtpButton", false, "KIRIM OTP");
  }
}


function renderForgotPasswordResetForm() {
  const target = forgotResetState.maskedEmail
    ? `OTP dikirim ke ${escapeHtml(forgotResetState.maskedEmail)}`
    : "Jika akun ditemukan, periksa email yang terdaftar.";

  setModalHtml(`
    <div class="modal-handle"></div>
    <button class="modal-close" type="button" onclick="closeModal()">×</button>
    <div class="modal-icon">✉️</div>
    <h3>Masukkan OTP</h3>
    <p class="modal-subtitle">${target}<br>Kode berlaku 10 menit.</p>

    <div class="forgot-step-card">
      <label class="modal-label">Kode OTP 6 Angka</label>
      <input id="forgotOtp" class="portal-input otp-input" type="text" inputmode="numeric" maxlength="6" pattern="[0-9]*" placeholder="000000" autocomplete="one-time-code">

      <label class="modal-label">Password Baru</label>
      <div class="input-wrap modal-password-wrap">
        <span class="input-icon">🔒</span>
        <input id="forgotNewPassword" type="password" placeholder="Minimal 6 karakter" autocomplete="new-password">
        <button type="button" class="eye-button" onclick="togglePasswordField('forgotNewPassword',this)" aria-label="Tampilkan password">👁</button>
      </div>

      <label class="modal-label top-gap-small">Konfirmasi Password Baru</label>
      <div class="input-wrap modal-password-wrap">
        <span class="input-icon">🔐</span>
        <input id="forgotNewPassword2" type="password" placeholder="Ulangi password" autocomplete="new-password">
        <button type="button" class="eye-button" onclick="togglePasswordField('forgotNewPassword2',this)" aria-label="Tampilkan konfirmasi password">👁</button>
      </div>

      <button id="forgotResetButton" class="primary-button" type="button" onclick="submitForgotPasswordReset()">SIMPAN PASSWORD BARU</button>
      <button class="secondary-button" type="button" onclick="openForgotPassword()">Minta OTP Baru</button>
    </div>
  `);

  setTimeout(() => {
    const el = document.getElementById("forgotOtp");
    if (el) el.focus();
  }, 80);
}


async function submitForgotPasswordReset() {
  const otp = valueOf("forgotOtp");
  const password = document.getElementById("forgotNewPassword")?.value || "";
  const password2 = document.getElementById("forgotNewPassword2")?.value || "";

  if (!/^\d{6}$/.test(otp)) {
    showToast("OTP harus 6 angka.");
    return;
  }

  if (password.length < 6) {
    showToast("Password baru minimal 6 karakter.");
    return;
  }

  if (password !== password2) {
    showToast("Konfirmasi password tidak sama.");
    return;
  }

  setButtonLoading("forgotResetButton", true, "Menyimpan...");

  try {
    const res = await apiRequest("resetPasswordWithOtp", {
      identifier: forgotResetState.identifier,
      otp,
      newPassword: password
    });

    showToast(res.message || (res.success ? "Password diperbarui." : "Reset password gagal."));

    if (res.success) {
      const loginUser = document.getElementById("loginUser");
      if (loginUser) loginUser.value = forgotResetState.identifier;
      closeModal();
      setTimeout(() => {
        const pass = document.getElementById("loginPassword");
        if (pass) pass.focus();
      }, 120);
    }
  } catch (err) {
    showToast(err.message);
  } finally {
    setButtonLoading("forgotResetButton", false, "SIMPAN PASSWORD BARU");
  }
}


/* =========================================================
   V1.4.3 - FOTO PROFIL: KOMPRES DI BROWSER
========================================================= */

async function handleRegisterPhotoChange(event) {
  const file = event && event.target && event.target.files ? event.target.files[0] : null;
  if (!file) return;

  try {
    pendingRegisterPhoto = await compressProfilePhoto(file);
    updatePhotoPreview("registerPhotoPreviewImg", "registerPhotoInitials", pendingRegisterPhoto.dataUrl);
    const info = document.getElementById("regPhotoInfo");
    if (info) info.textContent = `Siap diunggah • ${formatFileSize(pendingRegisterPhoto.bytes)} • WebP 180×180`;
    const submitBtn = document.getElementById("registerSubmitButton");
    if (submitBtn) submitBtn.disabled = false;
  } catch (err) {
    pendingRegisterPhoto = null;
    if (event.target) event.target.value = "";
    const submitBtn = document.getElementById("registerSubmitButton");
    if (submitBtn) submitBtn.disabled = true;
    showToast(err.message || "Foto tidak dapat diproses.");
  }
}


async function handleProfilePhotoChange(event) {
  const file = event && event.target && event.target.files ? event.target.files[0] : null;
  if (!file) return;

  try {
    pendingProfilePhoto = await compressProfilePhoto(file);
    updatePhotoPreview("profileModalPhotoImg", "profileModalInitials", pendingProfilePhoto.dataUrl);
    const info = document.getElementById("profilePhotoInfo");
    if (info) info.textContent = `Siap disimpan • ${formatFileSize(pendingProfilePhoto.bytes)} • WebP 180×180`;
    const saveBtn = document.getElementById("saveProfilePhotoButton");
    if (saveBtn) saveBtn.disabled = false;
  } catch (err) {
    pendingProfilePhoto = null;
    if (event.target) event.target.value = "";
    showToast(err.message || "Foto tidak dapat diproses.");
  }
}


function compressProfilePhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith("image/")) {
      reject(new Error("Pilih file gambar JPG, PNG, atau WEBP."));
      return;
    }

    if (file.size > 12 * 1024 * 1024) {
      reject(new Error("Foto asli terlalu besar. Maksimal 12 MB sebelum kompres."));
      return;
    }

    const reader = new FileReader();

    reader.onerror = () => reject(new Error("Foto tidak dapat dibaca."));
    reader.onload = () => {
      const img = new Image();

      img.onerror = () => reject(new Error("Format foto tidak didukung browser. Gunakan JPG, PNG, atau WEBP."));
      img.onload = () => {
        const size = 180;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) {
          reject(new Error("Browser tidak mendukung pemrosesan foto."));
          return;
        }

        const sourceSize = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = Math.max(0, (img.naturalWidth - sourceSize) / 2);
        const sy = Math.max(0, (img.naturalHeight - sourceSize) / 2);

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, sx, sy, sourceSize, sourceSize, 0, 0, size, size);

        canvas.toBlob(blob => {
          if (!blob) {
            reject(new Error("Gagal mengompres foto."));
            return;
          }

          if (blob.size > 180 * 1024) {
            reject(new Error("Foto hasil kompres masih terlalu besar. Pilih foto lain."));
            return;
          }

          const blobReader = new FileReader();
          blobReader.onerror = () => reject(new Error("Gagal menyiapkan foto."));
          blobReader.onload = () => {
            const dataUrl = String(blobReader.result || "");
            const base64 = dataUrl.split(",")[1] || "";

            resolve({
              mimeType: blob.type || "image/webp",
              base64,
              bytes: blob.size,
              dataUrl
            });
          };
          blobReader.readAsDataURL(blob);
        }, "image/webp", 0.72);
      };

      img.src = String(reader.result || "");
    };

    reader.readAsDataURL(file);
  });
}


function updatePhotoPreview(imageId, initialsId, dataUrl) {
  const img = document.getElementById(imageId);
  const initials = document.getElementById(initialsId);

  if (img && dataUrl) {
    img.src = dataUrl;
    img.classList.remove("hidden");
  }
  if (initials) initials.classList.add("hidden");
}


function formatFileSize(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return value + " B";
  return Math.max(1, Math.round(value / 1024)) + " KB";
}


function initialsFromName(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "K3";
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
  return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
}


function profilePhotoFileIdFromUser_(user) {
  if (!user) return "";

  const rawUrl = String(user.photoUrl || "");
  const privatePrefix = "private://profile/";
  if (rawUrl.startsWith(privatePrefix)) {
    return rawUrl.substring(privatePrefix.length).trim();
  }

  return String(user.photoFileId || "").trim();
}


function profilePhotoSourceForUser_(user) {
  if (!user) return "";

  const fileId = profilePhotoFileIdFromUser_(user);
  if (fileId && resolvedProfilePhotoFileId === fileId && resolvedProfilePhotoDataUrl) {
    return resolvedProfilePhotoDataUrl;
  }

  const rawUrl = String(user.photoUrl || "");
  if (rawUrl.startsWith("private://profile/")) return "";

  // Kompatibilitas foto versi lama yang masih memakai URL publik Drive.
  return rawUrl;
}


function applyResolvedProfilePhoto_() {
  if (!currentUser) return;
  const source = profilePhotoSourceForUser_(currentUser);

  setAvatarDisplay(
    "dashboardAvatarImg",
    "dashboardAvatarInitials",
    source,
    currentUser.nama
  );

  // Jika modal Profil sedang terbuka, perbarui juga tanpa membuka ulang modal.
  if (document.getElementById("profileModalPhotoImg")) {
    setAvatarDisplay(
      "profileModalPhotoImg",
      "profileModalInitials",
      source,
      currentUser.nama
    );
  }

  // V1.4.3.4: sinkronkan foto private yang sama ke Kartu Anggota Digital.
  if (document.getElementById("digitalCardPhotoImg")) {
    setAvatarDisplay(
      "digitalCardPhotoImg",
      "digitalCardInitials",
      source,
      currentUser.nama
    );
  }
}


async function ensurePrivateProfilePhotoLoaded_(force = false) {
  if (!currentUser || !sessionToken) return "";

  const fileId = profilePhotoFileIdFromUser_(currentUser);
  if (!fileId) {
    resolvedProfilePhotoDataUrl = "";
    resolvedProfilePhotoFileId = "";
    return "";
  }

  if (!force && resolvedProfilePhotoFileId === fileId && resolvedProfilePhotoDataUrl) {
    return resolvedProfilePhotoDataUrl;
  }

  if (!force && profilePhotoLoadPromise) return profilePhotoLoadPromise;

  profilePhotoLoadPromise = (async () => {
    try {
      const res = await apiRequest("getMyProfilePhoto", { token: sessionToken });

      if (!res || !res.success) {
        if (res && res.sessionExpired) forceLogout();
        return "";
      }

      if (!res.hasPhoto || !res.base64) {
        resolvedProfilePhotoDataUrl = "";
        resolvedProfilePhotoFileId = "";
        applyResolvedProfilePhoto_();
        return "";
      }

      const responseFileId = String(res.fileId || fileId);
      const mimeType = String(res.mimeType || "image/webp");
      const dataUrl = `data:${mimeType};base64,${res.base64}`;

      resolvedProfilePhotoFileId = responseFileId;
      resolvedProfilePhotoDataUrl = dataUrl;

      // Sinkronkan ID file di memori/browser, tanpa mengganti PHOTO_URL private.
      currentUser.photoFileId = responseFileId;
      localStorage.setItem("kom3_user", JSON.stringify(currentUser));

      applyResolvedProfilePhoto_();
      return dataUrl;
    } catch (err) {
      // Foto tidak boleh menghambat fitur Portal. Avatar inisial tetap menjadi fallback.
      return "";
    } finally {
      profilePhotoLoadPromise = null;
    }
  })();

  return profilePhotoLoadPromise;
}


function resetResolvedProfilePhoto_() {
  resolvedProfilePhotoDataUrl = "";
  resolvedProfilePhotoFileId = "";
  profilePhotoLoadPromise = null;
}


function setAvatarDisplay(imageId, initialsId, photoUrl, name) {
  const img = document.getElementById(imageId);
  const initials = document.getElementById(initialsId);

  if (initials) {
    initials.textContent = initialsFromName(name);
    initials.classList.remove("hidden");
  }

  if (!img) return;

  img.classList.add("hidden");
  img.removeAttribute("src");

  if (!photoUrl) return;

  img.onload = () => {
    img.classList.remove("hidden");
    if (initials) initials.classList.add("hidden");
  };

  img.onerror = () => {
    img.classList.add("hidden");
    if (initials) initials.classList.remove("hidden");
  };

  img.src = photoUrl;
}


function openMyProfile() {
  if (!currentUser) return;

  pendingProfilePhoto = null;
  const roleText = currentUser.jabatan && currentUser.jabatan !== "Anggota"
    ? currentUser.jabatan
    : (currentUser.role || "Anggota");

  setModalHtml(`
    <div class="modal-handle"></div>
    <button class="modal-close" type="button" onclick="closeModal()">×</button>

    <div class="profile-modal-head">
      <div class="profile-photo-preview profile-photo-large">
        <img id="profileModalPhotoImg" class="hidden" alt="Foto profil">
        <span id="profileModalInitials">${escapeHtml(initialsFromName(currentUser.nama))}</span>
      </div>
      <div>
        <small>PROFIL ANGGOTA</small>
        <h3>${escapeHtml(currentUser.nama || "-")}</h3>
        <p>${escapeHtml(currentUser.sekolah || "-")}</p>
        <span>${escapeHtml(roleText)}</span>
      </div>
    </div>

    <div class="profile-data-grid">
      <div><small>Member ID</small><strong>${escapeHtml(currentUser.id || "-")}</strong></div>
      <div><small>Username</small><strong>${escapeHtml(currentUser.username || "-")}</strong></div>
      <div><small>Email</small><strong>${escapeHtml(currentUser.email || "-")}</strong></div>
      <div><small>WhatsApp</small><strong>${escapeHtml(currentUser.wa || "-")}</strong></div>
    </div>

    <div class="profile-photo-editor">
      <strong>Foto Profil</strong>
      <small>Foto otomatis dipotong persegi dan dikompres ke WebP 180×180. Foto lama diganti agar penyimpanan tetap hemat.</small>
      <label class="photo-select-button full-photo-button" for="profilePhotoInput">Pilih / Ganti Foto</label>
      <input id="profilePhotoInput" class="photo-file-input" type="file" accept="image/jpeg,image/png,image/webp" onchange="handleProfilePhotoChange(event)">
      <div id="profilePhotoInfo" class="photo-file-info">Pilih foto baru jika ingin mengganti.</div>
      <button id="saveProfilePhotoButton" class="primary-button" type="button" onclick="saveProfilePhotoUpdate()" disabled>SIMPAN FOTO</button>
    </div>

    <button class="secondary-button" type="button" onclick="closeModal()">Tutup</button>
  `);

  setAvatarDisplay(
    "profileModalPhotoImg",
    "profileModalInitials",
    profilePhotoSourceForUser_(currentUser),
    currentUser.nama
  );

  // V1.4.3.2: ambil foto private di background; modal tetap responsif.
  ensurePrivateProfilePhotoLoaded_().catch(() => {});
}


async function saveProfilePhotoUpdate() {
  if (!pendingProfilePhoto) {
    showToast("Pilih foto terlebih dahulu.");
    return;
  }

  setButtonLoading("saveProfilePhotoButton", true, "Menyimpan...");

  try {
    const res = await apiRequest("updateProfilePhoto", {
      token: sessionToken,
      profilePhoto: {
        mimeType: pendingProfilePhoto.mimeType,
        base64: pendingProfilePhoto.base64
      }
    });

    showToast(res.message || (res.success ? "Foto profil diperbarui." : "Foto gagal disimpan."));

    if (!res.success) return;

    currentUser.photoUrl = res.photoUrl || "";
    // Backend V1.4.3.1 mengembalikan private://profile/FILE_ID.
    // Ambil FILE_ID dari URL agar tidak tertahan ID foto lama di session browser.
    currentUser.photoFileId = profilePhotoFileIdFromUser_(currentUser);
    localStorage.setItem("kom3_user", JSON.stringify(currentUser));

    clearApiReadCache();
    resetResolvedProfilePhoto_();
    updateProfileDisplay(currentUser);
    pendingProfilePhoto = null;

    // Ambil foto private terbaru sebelum/ketika profil dibuka ulang.
    ensurePrivateProfilePhotoLoaded_(true).catch(() => {});
    setTimeout(openMyProfile, 250);
  } catch (err) {
    showToast(err.message);
  } finally {
    setButtonLoading("saveProfilePhotoButton", false, "SIMPAN FOTO");
  }
}


/* =========================================================
   LOGIN
========================================================= */

async function handleLogin(event) {
  event.preventDefault();

  const user = valueOf("loginUser");
  const password = document.getElementById("loginPassword").value;

  if (!user || !password) {
    showToast("Isi username/email dan password.");
    return;
  }

  setButtonLoading("loginSubmitButton", true, "Memeriksa...");

  try {
    const res = await apiRequest("login", {
      user,
      password
    });

    if (!res.success) {
      showToast(res.message || "Login gagal.");
      return;
    }

    sessionToken = res.token;
    currentUser = res.user;

    localStorage.setItem("kom3_token", sessionToken);
    localStorage.setItem("kom3_user", JSON.stringify(currentUser));

    await loadDashboard();
    showDashboard();
    setupRoleInterface();

    showToast("Selamat datang, " + currentUser.nama + ".");
  } catch (err) {
    showToast(err.message);
  } finally {
    setButtonLoading("loginSubmitButton", false, "MASUK →");
  }
}


/* =========================================================
   REGISTER
========================================================= */

async function handleRegister(event) {
  event.preventDefault();

  const nama = valueOf("regName");
  const nip = valueOf("regNip");
  const sekolah = valueOf("regSchool");
  const email = valueOf("regEmail");
  const wa = valueOf("regWa");
  const username = valueOf("regUsername");
  const password = document.getElementById("regPassword").value;
  const password2 = document.getElementById("regPassword2").value;

  if (!pendingRegisterPhoto || !pendingRegisterPhoto.base64) {
    showToast("Foto profil wajib diisi sebelum mendaftar.");
    const photoInput = document.getElementById("regPhoto");
    if (photoInput) photoInput.focus();
    return;
  }

  if (!nama || !sekolah || !email || !username || !password) {
    showToast("Lengkapi data wajib.");
    return;
  }

  if (password.length < 6) {
    showToast("Password minimal 6 karakter.");
    return;
  }

  if (password !== password2) {
    showToast("Konfirmasi password tidak sama.");
    return;
  }

  setButtonLoading("registerSubmitButton", true, "Mengirim...");

  try {
    const res = await apiRequest("register", {
      nama,
      nip,
      sekolah,
      email,
      wa,
      username,
      password,
      profilePhoto: pendingRegisterPhoto ? {
        mimeType: pendingRegisterPhoto.mimeType,
        base64: pendingRegisterPhoto.base64
      } : null
    });

    showToast(res.message || "Pendaftaran selesai.");

    if (res.success) {
      document.getElementById("registerForm").reset();
      pendingRegisterPhoto = null;
      const previewImg = document.getElementById("registerPhotoPreviewImg");
      const previewInitials = document.getElementById("registerPhotoInitials");
      const info = document.getElementById("regPhotoInfo");
      if (previewImg) { previewImg.classList.add("hidden"); previewImg.removeAttribute("src"); }
      if (previewInitials) previewInitials.classList.remove("hidden");
      if (info) info.textContent = "Foto profil wajib diisi.";
      const submitBtn = document.getElementById("registerSubmitButton");
      if (submitBtn) submitBtn.disabled = true;
      setTimeout(showLogin, 1000);
    }
  } catch (err) {
    showToast(err.message);
  } finally {
    setButtonLoading("registerSubmitButton", false, "DAFTAR SEKARANG");
  }
}


/* =========================================================
   DASHBOARD
========================================================= */

async function loadDashboard() {
  if (!sessionToken) return;

  const res = await apiRequest("dashboard", {
    token: sessionToken
  });

  if (!res.success) {
    if (res.sessionExpired) {
      forceLogout();
    }
    return;
  }

  currentUser = res.user;
  localStorage.setItem("kom3_user", JSON.stringify(currentUser));

  updateProfileDisplay(res.user);
  updateStats(res.stats || {});
  updateAgenda(res.nextAgenda || res.agenda);
  updateAnnouncements(res.pengumuman || []);

  // Tidak menahan proses login. Jika API jadwal salat gagal,
  // seluruh fungsi Portal tetap berjalan seperti V1.2.3.
  loadPrayerWidget().catch(() => {});
  schedulePortalWarmup();
}

function updateProfileDisplay(user) {
  setText("dashboardName", user.nama);
  setAvatarDisplay(
    "dashboardAvatarImg",
    "dashboardAvatarInitials",
    profilePhotoSourceForUser_(user),
    user.nama
  );

  // V1.4.3.2: foto private dimuat setelah data dashboard tampil,
  // sehingga kecepatan login/dashboard tidak ditahan oleh foto.
  ensurePrivateProfilePhotoLoaded_().catch(() => {});

  const schoolText =
    user.role === "Pengurus" && user.jabatan && user.jabatan !== "Pengurus"
      ? user.sekolah + " • " + user.jabatan
      : user.sekolah;

  setText("dashboardSchool", schoolText);
  setText("dashboardRole", String(user.role || "Anggota").toUpperCase());

  const member = document.querySelector(".member-id strong");
  if (member) member.textContent = user.id || "-";

  const adminButton = document.getElementById("adminCenterButton");
  if (adminButton) {
    adminButton.classList.toggle(
      "hidden",
      !(user.role === "Admin" || user.role === "Pengurus")
    );
  }
}

function updateStats(stats) {
  const point = document.querySelector(".points-value strong");
  if (point) point.textContent = stats.points || 0;

  const values = document.querySelectorAll(".mini-stat strong");

  if (values[0]) values[0].textContent = stats.attendance || "0 / 0";
  if (values[1]) values[1].textContent = stats.certificates || 0;
  if (values[2]) values[2].textContent = (stats.streak || 0) + "x";
  if (values[3]) values[3].textContent = stats.kas || "Belum ada";

  const izinBadge = document.getElementById("izinPendingBadge");
  if (izinBadge) {
    const count = Number(stats.pendingLeave || 0);
    izinBadge.textContent = count;
    izinBadge.classList.toggle("hidden", count < 1);
  }
}


/* =========================================================
   ROLE / HEADER INTERFACE
========================================================= */

function setupRoleInterface() {
  const adminButton = document.getElementById("adminCenterButton");

  if (adminButton) {
    adminButton.classList.toggle(
      "hidden",
      !(currentUser && (currentUser.role === "Admin" || currentUser.role === "Pengurus"))
    );
  }
}


/* =========================================================
   ADMIN CENTER V1.2
========================================================= */

async function openAdminCenter() {
  if (!currentUser || (currentUser.role !== "Admin" && currentUser.role !== "Pengurus")) {
    showToast("Menu ini khusus Admin/Pengurus.");
    return;
  }

  showLoadingModal("Admin Center");

  try {
    const res = await apiRequest("adminSummary", {
      token: sessionToken
    });

    if (!res.success) {
      showToast(res.message);
      closeModal();
      return;
    }

    const s = res.summary || {};
    const settingButton = currentUser.role === "Admin" ? `
      <button type="button" class="admin-action" onclick="openPortalSettings()">
        <span class="admin-action-icon">🎛️</span>
        <span><b>Pengaturan Portal</b><small>QRIS Kas, lokasi jadwal salat, dan tahun ajaran</small></span>
        <span>›</span>
      </button>
    ` : "";

    setModalHtml(`
      <div class="modal-handle"></div>
      <button class="modal-close" type="button" onclick="closeModal()">×</button>

      <div class="modal-title-row">
        <div class="modal-icon compact">⚙️</div>
        <div>
          <h3>Admin Center</h3>
          <p class="modal-subtitle">Ringkas di depan, detail hanya saat diperlukan.</p>
        </div>
      </div>

      <div class="admin-stat-grid">
        ${adminStatCard("Anggota Aktif", s.activeUsers || 0, "👥")}
        ${adminStatCard("Menunggu Aktivasi", s.pendingUsers || 0, "⏳")}
        ${adminStatCard("Pengurus", s.pengurus || 0, "🛡️")}
        ${adminStatCard("Izin Menunggu", s.pendingLeaves || 0, "📝")}
      </div>

      <div class="admin-menu-list compact-admin-menu">
        <button type="button" class="admin-action" onclick="openUserCenter()">
          <span class="admin-action-icon">👥</span>
          <span><b>Manajemen Anggota</b><small>Cari, filter, aktivasi, role, dan password</small></span>
          <span>›</span>
        </button>

        <button type="button" class="admin-action" onclick="openAttendanceManager()">
          <span class="admin-action-icon">✅</span>
          <span><b>Absensi Pertemuan</b><small>Prioritas anggota yang belum tercatat</small></span>
          <span>›</span>
        </button>

        <button type="button" class="admin-action" onclick="openLeaveReview()">
          <span class="admin-action-icon">📝</span>
          <span><b>Verifikasi Izin</b><small>${escapeHtml(String(s.pendingLeaves || 0))} pengajuan menunggu</small></span>
          <span>›</span>
        </button>

        <button type="button" class="admin-action" onclick="openAgendaManager()">
          <span class="admin-action-icon">📅</span>
          <span><b>Agenda MGMP</b><small>Agenda aktif: ${escapeHtml(s.activeAgenda ? s.activeAgenda.nama : "Belum ada")}</small></span>
          <span>›</span>
        </button>

        <button type="button" class="admin-action" onclick="openAnnouncementManager()">
          <span class="admin-action-icon">📢</span>
          <span><b>Pengumuman</b><small>Informasi resmi Portal KOM 3</small></span>
          <span>›</span>
        </button>

        ${(currentUser.role === "Admin" || String(currentUser.jabatan || "").toLowerCase() === "bendahara") ? `
        <button type="button" class="admin-action" onclick="openKasVerification()">
          <span class="admin-action-icon">💳</span>
          <span><b>Verifikasi Kas</b><small>${escapeHtml(String(s.pendingKas || 0))} pembayaran menunggu verifikasi</small></span>
          <span>›</span>
        </button>

        <button type="button" class="admin-action" onclick="openFinanceCenter()">
          <span class="admin-action-icon">📊</span>
          <span><b>Keuangan MGMP</b><small>Saldo, pemasukan, pengeluaran, rekap, dan laporan</small></span>
          <span>›</span>
        </button>` : ""}

        <button type="button" class="admin-action" onclick="openMeetingArchive()">
          <span class="admin-action-icon">🗂️</span>
          <span><b>Arsip Rapat & Materi</b><small>Arsip per kegiatan, tidak menumpuk panjang</small></span>
          <span>›</span>
        </button>

        ${settingButton}
      </div>

      <button class="secondary-button" type="button" onclick="closeModal()">Tutup</button>
    `);
  } catch (err) {
    showToast(err.message);
    closeModal();
  }
}

function adminStatCard(label, value, icon) {
  return `
    <div class="admin-stat-card">
      <span>${icon}</span>
      <small>${escapeHtml(label)}</small>
      <strong>${escapeHtml(String(value))}</strong>
    </div>
  `;
}


/* =========================================================
   USER CENTER - FITUR LAMA TETAP
========================================================= */

async function openUserCenter() {
  showLoadingModal("Manajemen Anggota");

  try {
    const res = await apiRequest("listUsers", {
      token: sessionToken
    });

    if (!res.success) {
      showToast(res.message);
      closeModal();
      return;
    }

    compactUI.users.items = res.users || [];
    compactUI.users.query = "";
    compactUI.users.visible = COMPACT_PAGE_SIZE;

    const pending = compactUI.users.items.filter(u => String(u.status).toUpperCase() === "PENDING").length;
    compactUI.users.tab = pending ? "PENDING" : "ACTIVE";

    renderUserCenterModal();
  } catch (err) {
    showToast(err.message);
    closeModal();
  }
}

function userCardHtml(user, pending) {
  let controls = "";

  if (pending) {
    controls += `
      <button type="button" class="primary-button small-action" onclick="approveMember('${escapeJs(user.id)}')">
        ✓ Aktifkan Anggota
      </button>
    `;
  }

  if (currentUser && currentUser.role === "Admin" && user.id !== currentUser.id) {
    controls += `
      <div class="two-col-inputs">
        <select id="role-${escapeHtml(user.id)}" class="portal-select">
          <option value="Anggota" ${user.role === "Anggota" ? "selected" : ""}>Anggota</option>
          <option value="Pengurus" ${user.role === "Pengurus" ? "selected" : ""}>Pengurus</option>
        </select>

        <select id="jabatan-${escapeHtml(user.id)}" class="portal-select">
          ${jabatanOptions(user.jabatan)}
        </select>
      </div>

      <button type="button" class="outline-button" onclick="saveUserRole('${escapeJs(user.id)}')">
        Simpan Role & Jabatan
      </button>

      <button type="button" class="outline-button password-reset-button" onclick="resetMemberPassword('${escapeJs(user.id)}','${escapeJs(user.nama)}')">
        🔑 Reset Password
      </button>
    `;
  }

  return `
    <div class="management-card">
      <div class="management-card-head">
        <div>
          <strong>${escapeHtml(user.nama)}</strong>
          <small>${escapeHtml(user.sekolah || "-")}</small>
          <small>${escapeHtml(user.id)}</small>
          <small><b>Username:</b> ${escapeHtml(user.username || "-")}</small>
          <small>${escapeHtml(user.email || "-")}</small>
        </div>
        <span class="status-pill ${statusClass(user.status)}">${escapeHtml(user.status)}</span>
      </div>
      <div class="user-role-line">${escapeHtml(user.role)} • ${escapeHtml(user.jabatan || "Anggota")}</div>
      ${controls}
    </div>
  `;
}

function jabatanOptions(selected) {
  const list = [
    "Anggota",
    "Ketua",
    "Sekretaris",
    "Bendahara",
    "Bidang"
  ];

  return list
    .map(x => `<option value="${x}" ${x === selected ? "selected" : ""}>${x}</option>`)
    .join("");
}

async function approveMember(id) {
  try {
    const res = await apiRequest("approveUser", {
      token: sessionToken,
      userId: id
    });

    showToast(res.message);

    if (res.success) {
      await openUserCenter();
    }
  } catch (err) {
    showToast(err.message);
  }
}

async function saveUserRole(userId) {
  const roleEl = document.getElementById("role-" + userId);
  const jabatanEl = document.getElementById("jabatan-" + userId);

  if (!roleEl || !jabatanEl) return;

  try {
    const res = await apiRequest("updateUserAccess", {
      token: sessionToken,
      userId,
      role: roleEl.value,
      jabatan: jabatanEl.value
    });

    showToast(res.message);

    if (res.success) {
      await openUserCenter();
    }
  } catch (err) {
    showToast(err.message);
  }
}



/* =========================================================
   RESET PASSWORD - V1.2.1
========================================================= */

async function resetMemberPassword(userId, nama) {
  if (!currentUser || currentUser.role !== "Admin") {
    showToast("Hanya Admin yang dapat mereset password.");
    return;
  }

  const newPassword = window.prompt(
    "Masukkan password baru untuk " + nama + " (minimal 6 karakter):"
  );

  if (newPassword === null) return;

  if (String(newPassword).length < 6) {
    showToast("Password baru minimal 6 karakter.");
    return;
  }

  if (!window.confirm("Reset password untuk " + nama + "?")) return;

  try {
    const res = await apiRequest("resetUserPassword", {
      token: sessionToken,
      userId,
      newPassword
    });

    showToast(res.message);
  } catch (err) {
    showToast(err.message);
  }
}


/* =========================================================
   KELOLA AGENDA - V1.2.1
========================================================= */

async function openAgendaManager() {
  showLoadingModal("Kelola Agenda MGMP");

  try {
    const res = await apiRequest("listAgendas", {
      token: sessionToken
    });

    if (!res.success) {
      showToast(res.message);
      closeModal();
      return;
    }

    compactUI.agendaManager.items = res.agendas || [];
    compactUI.agendaManager.query = "";
    compactUI.agendaManager.visible = COMPACT_PAGE_SIZE;

    if (compactUI.agendaManager.items.some(x => String(x.status).toUpperCase() === "AKTIF")) {
      compactUI.agendaManager.tab = "AKTIF";
    } else {
      compactUI.agendaManager.tab = "RENCANA";
    }

    renderAgendaManagerModal();
  } catch (err) {
    showToast(err.message);
    closeModal();
  }
}


async function saveAgendaFromModal(event) {
  event.preventDefault();

  const payload = {
    token: sessionToken,
    nama: valueOf("agendaName"),
    tanggal: valueOf("agendaDate"),
    jam: valueOf("agendaTime"),
    moda: document.getElementById("agendaMode").value,
    lokasi: valueOf("agendaLocation"),
    status: document.getElementById("agendaStatus").value
  };

  setButtonLoading("agendaSaveButton", true, "Menyimpan...");

  try {
    const res = await apiRequest("saveAgenda", payload);
    showToast(res.message);

    if (res.success) {
      await loadDashboard();
      await openAgendaManager();
    }
  } catch (err) {
    showToast(err.message);
  } finally {
    setButtonLoading("agendaSaveButton", false, "+ TAMBAH AGENDA");
  }
}


async function setAgendaStatus(id, status) {
  try {
    const res = await apiRequest("setAgendaStatus", {
      token: sessionToken,
      id,
      status
    });

    showToast(res.message);

    if (res.success) {
      await loadDashboard();
      await openAgendaManager();
    }
  } catch (err) {
    showToast(err.message);
  }
}


function agendaStatusClass(status) {
  const value = String(status || "").toUpperCase();
  if (value === "AKTIF") return "approved";
  if (value === "RENCANA") return "pending";
  if (value === "SELESAI") return "neutral";
  return "neutral";
}


/* =========================================================
   KELOLA PENGUMUMAN - V1.2.1
========================================================= */

async function openAnnouncementManager() {
  showLoadingModal("Kelola Pengumuman");

  try {
    const res = await apiRequest("listAnnouncements", {
      token: sessionToken
    });

    if (!res.success) {
      showToast(res.message);
      closeModal();
      return;
    }

    compactUI.announcements.items = res.announcements || [];
    compactUI.announcements.query = "";
    compactUI.announcements.visible = COMPACT_PAGE_SIZE;
    compactUI.announcements.tab = "AKTIF";

    renderAnnouncementManagerModal();
  } catch (err) {
    showToast(err.message);
    closeModal();
  }
}


async function saveAnnouncementFromModal(event) {
  event.preventDefault();

  const payload = {
    token: sessionToken,
    judul: valueOf("announcementTitle"),
    isi: document.getElementById("announcementBody").value.trim(),
    kategori: document.getElementById("announcementCategory").value,
    tanggal: valueOf("announcementDate"),
    status: document.getElementById("announcementStatus").value
  };

  setButtonLoading("announcementSaveButton", true, "Menyimpan...");

  try {
    const res = await apiRequest("saveAnnouncement", payload);
    showToast(res.message);

    if (res.success) {
      await loadDashboard();
      await openAnnouncementManager();
    }
  } catch (err) {
    showToast(err.message);
  } finally {
    setButtonLoading("announcementSaveButton", false, "+ TAMBAH PENGUMUMAN");
  }
}


async function setAnnouncementStatus(id, status) {
  try {
    const res = await apiRequest("setAnnouncementStatus", {
      token: sessionToken,
      id,
      status
    });

    showToast(res.message);

    if (res.success) {
      await loadDashboard();
      await openAnnouncementManager();
    }
  } catch (err) {
    showToast(err.message);
  }
}


/* =========================================================
   ARSIP RAPAT & MATERI - V1.2.3
========================================================= */

async function openMeetingArchive(options = {}) {
  const agendaFilter = options.agendaId || "";
  const title = options.title || "Arsip Rapat & Materi";

  showLoadingModal(title);

  try {
    const res = await apiRequest("listMeetingDocuments", {
      token: sessionToken
    });

    if (!res.success) {
      showToast(res.message);
      closeModal();
      return;
    }

    compactUI.archive.documents = res.documents || [];
    compactUI.archive.agendas = res.agendas || [];
    compactUI.archive.isManager = !!res.isManager;
    compactUI.archive.query = "";
    compactUI.archive.type = "ALL";
    compactUI.archive.year = "ALL";
    compactUI.archive.visible = COMPACT_PAGE_SIZE;
    compactUI.archive.detailVisible = COMPACT_PAGE_SIZE;
    compactUI.archive.agendaFilter = agendaFilter;
    compactUI.archive.title = title;

    renderMeetingArchiveModal();
  } catch (err) {
    showToast(err.message);
    closeModal();
  }
}


function renderMeetingArchiveList(documents, isManager) {
  // Dipertahankan sebagai helper kompatibilitas V1.2.3.
  // V1.2.4 menggunakan renderMeetingArchiveModal() agar daftar tidak memanjang.
  if (!documents || !documents.length) {
    return `<div class="empty-panel">Belum ada arsip tersimpan.</div>`;
  }

  return documents.slice(0, COMPACT_PAGE_SIZE).map(item => `
    <div class="archive-card">
      <div class="archive-card-top">
        <span class="archive-type-icon">${documentTypeIcon(item.jenis)}</span>
        <div class="archive-card-title">
          <span class="archive-type-label">${escapeHtml(formatDocumentType(item.jenis))}</span>
          <strong>${escapeHtml(item.judul)}</strong>
          <small>${escapeHtml(item.tanggal)}</small>
        </div>
        ${isManager ? `<span class="status-pill ${item.status === "AKTIF" ? "approved" : "neutral"}">${escapeHtml(item.status)}</span>` : ""}
      </div>
    </div>
  `).join("");
}


async function saveMeetingDocumentFromModal(event) {
  event.preventDefault();

  const payload = {
    token: sessionToken,
    agendaId: document.getElementById("meetingDocAgenda").value,
    jenis: document.getElementById("meetingDocType").value,
    judul: valueOf("meetingDocTitle"),
    deskripsi: document.getElementById("meetingDocDescription").value.trim(),
    link: valueOf("meetingDocLink"),
    tanggal: valueOf("meetingDocDate"),
    status: document.getElementById("meetingDocStatus").value
  };

  setButtonLoading(
    "meetingDocSaveButton",
    true,
    "Menyimpan..."
  );

  try {
    const res = await apiRequest(
      "saveMeetingDocument",
      payload
    );

    showToast(res.message);

    if (res.success) {
      await openMeetingArchive();
    }

  } catch (err) {
    showToast(err.message);

  } finally {
    setButtonLoading(
      "meetingDocSaveButton",
      false,
      "+ SIMPAN ARSIP"
    );
  }
}


async function setMeetingDocumentStatus(id, status) {
  try {
    const res = await apiRequest(
      "setMeetingDocumentStatus",
      {
        token: sessionToken,
        id,
        status
      }
    );

    showToast(res.message);

    if (res.success) {
      await openMeetingArchive();
    }

  } catch (err) {
    showToast(err.message);
  }
}


async function openAgendaPublic() {
  showLoadingModal("Agenda MGMP");

  try {
    const [agendaRes, archiveRes] = await Promise.all([
      apiRequest("listAgendasPublic", { token: sessionToken }),
      apiRequest("listMeetingDocuments", { token: sessionToken })
    ]);

    if (!agendaRes.success) {
      showToast(agendaRes.message);
      closeModal();
      return;
    }

    compactUI.publicAgenda.items = agendaRes.agendas || [];
    compactUI.publicAgenda.documents = archiveRes.success ? archiveRes.documents || [] : [];
    compactUI.publicAgenda.visible = 3;

    const hasActive = compactUI.publicAgenda.items.some(x => String(x.status).toUpperCase() === "AKTIF");
    compactUI.publicAgenda.tab = hasActive ? "ACTIVE" : "UPCOMING";

    renderPublicAgendaModal();
  } catch (err) {
    showToast(err.message);
    closeModal();
  }
}


function formatDocumentType(type) {
  const value = String(type || "").toUpperCase();

  if (value === "MATERI") return "Materi";
  if (value === "NOTULEN") return "Notulen";
  if (value === "HASIL_RAPAT") return "Hasil Rapat";
  if (value === "DOKUMENTASI") return "Dokumentasi";

  return value || "Dokumen";
}


function documentTypeIcon(type) {
  const value = String(type || "").toUpperCase();

  if (value === "MATERI") return "📚";
  if (value === "NOTULEN") return "📝";
  if (value === "HASIL_RAPAT") return "✅";
  if (value === "DOKUMENTASI") return "📷";

  return "📄";
}


function openExternalLink(url) {
  try {
    const parsed = new URL(url);

    if (
      parsed.protocol !== "https:" &&
      parsed.protocol !== "http:"
    ) {
      throw new Error("URL tidak aman.");
    }

    window.open(
      parsed.href,
      "_blank",
      "noopener,noreferrer"
    );

  } catch (err) {
    showToast("Link tidak valid.");
  }
}


/* =========================================================
   ABSENSI - FITUR LAMA TETAP
========================================================= */

async function openAttendanceManager() {
  showLoadingModal("Absensi Pertemuan");

  try {
    const res = await apiRequest("attendanceManager", {
      token: sessionToken
    });

    if (!res.success) {
      showToast(res.message);
      closeModal();
      return;
    }

    compactUI.attendance.items = res.users || [];
    compactUI.attendance.agenda = res.agenda || null;
    compactUI.attendance.tab = "BELUM";
    compactUI.attendance.query = "";
    compactUI.attendance.visible = COMPACT_PAGE_SIZE;

    renderAttendanceManagerModal();
  } catch (err) {
    showToast(err.message);
    closeModal();
  }
}

async function markPresent(userId) {
  showToast("Menyimpan kehadiran...");

  try {
    const res = await apiRequest("markAttendance", {
      token: sessionToken,
      userId
    });

    showToast(res.message);

    if (res.success) {
      await openAttendanceManager();
      await loadDashboard();
    }
  } catch (err) {
    showToast(err.message);
  }
}

async function openMyAttendance() {
  showLoadingModal("Kehadiran Saya");

  try {
    const res = await apiRequest("myAttendance", {
      token: sessionToken
    });

    if (!res.success) {
      showToast(res.message);
      closeModal();
      return;
    }

    compactUI.myAttendance.items = res.history || [];
    compactUI.myAttendance.visible = COMPACT_PAGE_SIZE;
    renderMyAttendanceModal();
  } catch (err) {
    showToast(err.message);
    closeModal();
  }
}


/* =========================================================
   IZIN TIDAK HADIR V1.2
========================================================= */

async function openLeaveCenter() {
  showLoadingModal("Izin Tidak Hadir");

  try {
    const [agendaRes, leaveRes] = await Promise.all([
      apiRequest("agendaOptions", { token: sessionToken }),
      apiRequest("myLeaves", { token: sessionToken })
    ]);

    if (!agendaRes.success) {
      showToast(agendaRes.message);
      closeModal();
      return;
    }

    compactUI.leave.agendas = agendaRes.agendas || [];
    compactUI.leave.history = leaveRes.success ? leaveRes.history || [] : [];
    compactUI.leave.filter = "ALL";
    compactUI.leave.visible = COMPACT_PAGE_SIZE;

    renderLeaveCenterModal();
  } catch (err) {
    showToast(err.message);
    closeModal();
  }
}

async function submitLeaveFromModal(event) {
  event.preventDefault();

  const agendaId = document.getElementById("leaveAgenda").value;
  const jenisIzin = document.getElementById("leaveType").value;
  const keterangan = document.getElementById("leaveDescription").value.trim();
  const fileInput = document.getElementById("leaveFile");

  if (!agendaId || !jenisIzin || !keterangan) {
    showToast("Lengkapi data izin.");
    return;
  }

  let filePayload = null;

  if (fileInput && fileInput.files && fileInput.files[0]) {
    const file = fileInput.files[0];

    if (file.size > APP_CONFIG.maxProofBytes) {
      showToast("Ukuran bukti maksimal 2 MB.");
      return;
    }

    try {
      filePayload = await fileToPayload(file);
    } catch (err) {
      showToast("Bukti gagal dibaca.");
      return;
    }
  }

  setButtonLoading("leaveSubmitButton", true, "Mengirim...");

  try {
    const res = await apiRequest("submitLeave", {
      token: sessionToken,
      agendaId,
      jenisIzin,
      keterangan,
      file: filePayload
    });

    showToast(res.message);

    if (res.success) {
      await loadDashboard();
      await openLeaveCenter();
    }
  } catch (err) {
    showToast(err.message);
  } finally {
    setButtonLoading("leaveSubmitButton", false, "KIRIM IZIN");
  }
}

function fileToPayload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || "");
      const commaIndex = result.indexOf(",");

      if (commaIndex < 0) {
        reject(new Error("Format file tidak valid."));
        return;
      }

      resolve({
        name: file.name,
        mimeType: file.type,
        base64: result.substring(commaIndex + 1)
      });
    };

    reader.onerror = () => reject(reader.error || new Error("File gagal dibaca."));
    reader.readAsDataURL(file);
  });
}


/* =========================================================
   VERIFIKASI IZIN V1.2
========================================================= */

async function openLeaveReview() {
  showLoadingModal("Verifikasi Izin");

  try {
    const res = await apiRequest("listLeavesManager", {
      token: sessionToken
    });

    if (!res.success) {
      showToast(res.message);
      closeModal();
      return;
    }

    compactUI.leaveReview.items = res.leaves || [];
    compactUI.leaveReview.query = "";
    compactUI.leaveReview.visible = COMPACT_PAGE_SIZE;
    compactUI.leaveReview.tab = compactUI.leaveReview.items.some(x => String(x.status).toUpperCase() === "PENDING")
      ? "PENDING"
      : "APPROVED";

    renderLeaveReviewModal();
  } catch (err) {
    showToast(err.message);
    closeModal();
  }
}


async function openLeaveProof(izinId) {
  const previewWindow = window.open("", "_blank");

  if (previewWindow) {
    previewWindow.document.write("<p style='font-family:Arial;padding:20px'>Memuat bukti izin...</p>");
  }

  try {
    const res = await apiRequest("getLeaveProof", {
      token: sessionToken,
      izinId
    });

    if (!res.success || !res.file) {
      if (previewWindow) previewWindow.close();
      showToast(res.message || "Bukti tidak tersedia.");
      return;
    }

    const blob = base64ToBlob(res.file.base64, res.file.mimeType);
    const objectUrl = URL.createObjectURL(blob);

    if (previewWindow) {
      previewWindow.location.href = objectUrl;
    } else {
      window.location.href = objectUrl;
    }

    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  } catch (err) {
    if (previewWindow) previewWindow.close();
    showToast(err.message);
  }
}

function base64ToBlob(base64, mimeType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: mimeType || "application/octet-stream" });
}

async function reviewLeave(izinId, decision) {
  const noteEl = document.getElementById("review-note-" + izinId);
  const catatan = noteEl ? noteEl.value.trim() : "";

  try {
    const res = await apiRequest("reviewLeave", {
      token: sessionToken,
      izinId,
      decision,
      catatan
    });

    showToast(res.message);

    if (res.success) {
      await loadDashboard();
      await openLeaveReview();
    }
  } catch (err) {
    showToast(err.message);
  }
}



/* =========================================================
   V1.2.4 - MOBILE COMPACT UI HELPERS
========================================================= */

function compactTabButton(label, value, active, count, onclickName) {
  return `
    <button
      type="button"
      class="compact-tab ${active === value ? "active" : ""}"
      onclick="${onclickName}('${escapeJs(value)}')"
    >
      ${escapeHtml(label)}${count == null ? "" : ` <b>${escapeHtml(String(count))}</b>`}
    </button>
  `;
}


function compactSearchHtml(value, handler, placeholder) {
  return `
    <div class="compact-search-wrap">
      <span>🔎</span>
      <input
        class="compact-search"
        type="search"
        value="${escapeHtml(value || "")}"
        placeholder="${escapeHtml(placeholder || "Cari...")}"
        oninput="${handler}(this.value)"
      >
    </div>
  `;
}


function renderLoadMoreButton(hasMore, onclickName, label = "Muat 5 lainnya") {
  if (!hasMore) return "";
  return `<button type="button" class="compact-more-button" onclick="${onclickName}()">${escapeHtml(label)}</button>`;
}

function refocusCompactSearch() {
  requestAnimationFrame(() => {
    const input = document.querySelector("#featureModal .compact-search");
    if (!input) return;
    input.focus();
    try { input.setSelectionRange(input.value.length, input.value.length); } catch (e) {}
  });
}


/* -------------------------
   USER CENTER COMPACT
------------------------- */

function renderUserCenterModal() {
  const all = compactUI.users.items || [];
  const pendingCount = all.filter(u => String(u.status).toUpperCase() === "PENDING").length;
  const activeCount = all.filter(u => String(u.status).toUpperCase() === "ACTIVE").length;
  const pengurusCount = all.filter(u => String(u.status).toUpperCase() === "ACTIVE" && u.role === "Pengurus").length;
  const query = String(compactUI.users.query || "").toLowerCase();

  let filtered = all.filter(user => {
    const status = String(user.status || "").toUpperCase();
    if (compactUI.users.tab === "PENDING" && status !== "PENDING") return false;
    if (compactUI.users.tab === "ACTIVE" && status !== "ACTIVE") return false;
    if (compactUI.users.tab === "PENGURUS" && !(status === "ACTIVE" && user.role === "Pengurus")) return false;

    if (!query) return true;
    return [user.nama, user.sekolah, user.username, user.email]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });

  const visible = filtered.slice(0, compactUI.users.visible);
  let listHtml = visible.map(user => `
    <div class="compact-row-card">
      <div class="compact-row-main">
        <strong>${escapeHtml(user.nama)}</strong>
        <small>${escapeHtml(user.sekolah || "-")}</small>
        <span>${escapeHtml(user.role)} • ${escapeHtml(user.jabatan || "Anggota")}</span>
      </div>
      <button type="button" class="compact-detail-button" onclick="openUserDetail('${escapeJs(user.id)}')">Detail ›</button>
    </div>
  `).join("");

  if (!listHtml) listHtml = `<div class="empty-panel">Tidak ada data pada filter ini.</div>`;

  setModalHtml(`
    <div class="modal-handle"></div>
    <button class="modal-close" type="button" onclick="closeModal()">×</button>
    <h3>Manajemen Anggota</h3>
    <p class="modal-subtitle">Tampilkan seperlunya. Gunakan pencarian atau filter untuk data lama.</p>

    ${compactSearchHtml(compactUI.users.query, "filterUserCenter", "Cari nama, sekolah, username...")}

    <div class="compact-tabs">
      ${compactTabButton("Menunggu", "PENDING", compactUI.users.tab, pendingCount, "setUserCenterTab")}
      ${compactTabButton("Aktif", "ACTIVE", compactUI.users.tab, activeCount, "setUserCenterTab")}
      ${compactTabButton("Pengurus", "PENGURUS", compactUI.users.tab, pengurusCount, "setUserCenterTab")}
    </div>

    <div class="compact-list">${listHtml}</div>
    ${renderLoadMoreButton(filtered.length > compactUI.users.visible, "loadMoreUsers")}

    <button class="secondary-button" type="button" onclick="openAdminCenter()">← Kembali ke Admin Center</button>
  `);
}


function setUserCenterTab(tab) {
  compactUI.users.tab = tab;
  compactUI.users.visible = COMPACT_PAGE_SIZE;
  renderUserCenterModal();
}


function filterUserCenter(query) {
  compactUI.users.query = query || "";
  compactUI.users.visible = COMPACT_PAGE_SIZE;
  renderUserCenterModal();
  const input = document.querySelector(".compact-search");
  if (input) {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}


function loadMoreUsers() {
  compactUI.users.visible += COMPACT_PAGE_SIZE;
  renderUserCenterModal();
}


function openUserDetail(userId) {
  const user = (compactUI.users.items || []).find(x => x.id === userId);
  if (!user) return;

  let controls = "";

  if (String(user.status).toUpperCase() === "PENDING") {
    controls += `
      <button type="button" class="primary-button" onclick="approveMember('${escapeJs(user.id)}')">✓ Aktifkan Anggota</button>
    `;
  }

  if (currentUser && currentUser.role === "Admin" && user.id !== currentUser.id) {
    controls += `
      <div class="two-col-inputs">
        <select id="role-${escapeHtml(user.id)}" class="portal-select">
          <option value="Anggota" ${user.role === "Anggota" ? "selected" : ""}>Anggota</option>
          <option value="Pengurus" ${user.role === "Pengurus" ? "selected" : ""}>Pengurus</option>
        </select>
        <select id="jabatan-${escapeHtml(user.id)}" class="portal-select">${jabatanOptions(user.jabatan)}</select>
      </div>
      <button type="button" class="outline-button" onclick="saveUserRole('${escapeJs(user.id)}')">Simpan Role & Jabatan</button>
      <button type="button" class="outline-button password-reset-button" onclick="resetMemberPassword('${escapeJs(user.id)}','${escapeJs(user.nama)}')">🔑 Reset Password</button>
    `;
  }

  setModalHtml(`
    <div class="modal-handle"></div>
    <button class="modal-close" type="button" onclick="closeModal()">×</button>
    <div class="compact-detail-header">
      <button type="button" class="compact-back-button" onclick="renderUserCenterModal()">←</button>
      <div>
        <h3>${escapeHtml(user.nama)}</h3>
        <p class="modal-subtitle">${escapeHtml(user.sekolah || "-")}</p>
      </div>
    </div>

    <div class="compact-detail-grid">
      <div><small>Member ID</small><strong>${escapeHtml(user.id)}</strong></div>
      <div><small>Status</small><strong>${escapeHtml(user.status)}</strong></div>
      <div><small>Username</small><strong>${escapeHtml(user.username || "-")}</strong></div>
      <div><small>Email</small><strong>${escapeHtml(user.email || "-")}</strong></div>
      <div><small>Role</small><strong>${escapeHtml(user.role || "Anggota")}</strong></div>
      <div><small>Jabatan</small><strong>${escapeHtml(user.jabatan || "Anggota")}</strong></div>
    </div>

    ${controls}
    <button class="secondary-button" type="button" onclick="renderUserCenterModal()">← Kembali ke Daftar</button>
  `);
}


/* -------------------------
   AGENDA MANAGER COMPACT
------------------------- */

function renderAgendaManagerModal() {
  const all = compactUI.agendaManager.items || [];
  const query = String(compactUI.agendaManager.query || "").toLowerCase();
  const statuses = ["RENCANA", "AKTIF", "SELESAI"];
  const counts = {};
  statuses.forEach(s => counts[s] = all.filter(x => String(x.status).toUpperCase() === s).length);

  const filtered = all.filter(item => {
    if (String(item.status).toUpperCase() !== compactUI.agendaManager.tab) return false;
    if (!query) return true;
    return [item.nama, item.tanggal, item.lokasi, item.moda].join(" ").toLowerCase().includes(query);
  });

  let listHtml = filtered.slice(0, compactUI.agendaManager.visible).map(item => {
    const nextStatus = item.status === "AKTIF" ? "SELESAI" : "AKTIF";
    const buttonText = item.status === "AKTIF" ? "Tandai Selesai" : "Jadikan Aktif";
    return `
      <div class="compact-row-card stack-mobile">
        <div class="compact-row-main">
          <strong>${escapeHtml(item.nama)}</strong>
          <small>${escapeHtml(item.tanggal)} • ${escapeHtml(item.jam)}</small>
          <span>${escapeHtml(item.moda)} • ${escapeHtml(item.lokasi)}</span>
        </div>
        <div class="compact-row-actions">
          <span class="status-pill ${agendaStatusClass(item.status)}">${escapeHtml(item.status)}</span>
          <button type="button" class="compact-detail-button" onclick="setAgendaStatus('${escapeJs(item.id)}','${escapeJs(nextStatus)}')">${escapeHtml(buttonText)}</button>
        </div>
      </div>
    `;
  }).join("");

  if (!listHtml) listHtml = `<div class="empty-panel">Belum ada agenda pada kategori ini.</div>`;

  setModalHtml(`
    <div class="modal-handle"></div>
    <button class="modal-close" type="button" onclick="closeModal()">×</button>
    <h3>Agenda MGMP</h3>
    <p class="modal-subtitle">Agenda dipisah berdasarkan status agar tetap pendek di HP.</p>

    <details class="compact-disclosure">
      <summary>＋ Tambah Agenda Baru</summary>
      <form id="agendaManagerForm" class="manager-form compact-form" onsubmit="saveAgendaFromModal(event)">
        <label class="modal-label">Nama Kegiatan</label>
        <input id="agendaName" class="portal-input" type="text" placeholder="Contoh: Hari Belajar Guru Oktober" required>
        <div class="two-col-inputs">
          <div><label class="modal-label">Tanggal</label><input id="agendaDate" class="portal-input" type="date" required></div>
          <div><label class="modal-label">Moda</label><select id="agendaMode" class="portal-select full"><option value="Luring">Luring</option><option value="Daring">Daring</option><option value="Hybrid">Hybrid</option></select></div>
        </div>
        <label class="modal-label">Jam</label>
        <input id="agendaTime" class="portal-input" type="text" placeholder="Contoh: 13.00 - 15.00 WIB" required>
        <label class="modal-label">Lokasi / Media</label>
        <input id="agendaLocation" class="portal-input" type="text" placeholder="Lokasi atau link/media daring" required>
        <label class="modal-label">Status</label>
        <select id="agendaStatus" class="portal-select full"><option value="RENCANA">Rencana</option><option value="AKTIF">Aktif</option><option value="SELESAI">Selesai</option></select>
        <button id="agendaSaveButton" type="submit" class="primary-button">+ TAMBAH AGENDA</button>
      </form>
    </details>

    ${compactSearchHtml(compactUI.agendaManager.query, "filterAgendaManager", "Cari agenda atau lokasi...")}
    <div class="compact-tabs">
      ${compactTabButton("Rencana", "RENCANA", compactUI.agendaManager.tab, counts.RENCANA, "setAgendaManagerTab")}
      ${compactTabButton("Aktif", "AKTIF", compactUI.agendaManager.tab, counts.AKTIF, "setAgendaManagerTab")}
      ${compactTabButton("Selesai", "SELESAI", compactUI.agendaManager.tab, counts.SELESAI, "setAgendaManagerTab")}
    </div>

    <div class="compact-list">${listHtml}</div>
    ${renderLoadMoreButton(filtered.length > compactUI.agendaManager.visible, "loadMoreAgendaManager")}
    <button class="secondary-button" type="button" onclick="openAdminCenter()">← Kembali ke Admin Center</button>
  `);
}


function setAgendaManagerTab(tab) {
  compactUI.agendaManager.tab = tab;
  compactUI.agendaManager.visible = COMPACT_PAGE_SIZE;
  renderAgendaManagerModal();
}

function filterAgendaManager(query) {
  compactUI.agendaManager.query = query || "";
  compactUI.agendaManager.visible = COMPACT_PAGE_SIZE;
  renderAgendaManagerModal();
  refocusCompactSearch();
}

function loadMoreAgendaManager() {
  compactUI.agendaManager.visible += COMPACT_PAGE_SIZE;
  renderAgendaManagerModal();
}


/* -------------------------
   ANNOUNCEMENT MANAGER COMPACT
------------------------- */

function renderAnnouncementManagerModal() {
  const all = compactUI.announcements.items || [];
  const query = String(compactUI.announcements.query || "").toLowerCase();
  const activeCount = all.filter(x => String(x.status).toUpperCase() === "AKTIF").length;
  const inactiveCount = all.filter(x => String(x.status).toUpperCase() !== "AKTIF").length;

  const filtered = all.filter(item => {
    const status = String(item.status || "").toUpperCase();
    if (compactUI.announcements.tab === "AKTIF" && status !== "AKTIF") return false;
    if (compactUI.announcements.tab === "NONAKTIF" && status === "AKTIF") return false;
    if (!query) return true;
    return [item.judul, item.kategori, item.isi].join(" ").toLowerCase().includes(query);
  });

  let listHtml = filtered.slice(0, compactUI.announcements.visible).map(item => {
    const nextStatus = item.status === "AKTIF" ? "NONAKTIF" : "AKTIF";
    const buttonText = item.status === "AKTIF" ? "Nonaktifkan" : "Aktifkan";
    return `
      <div class="compact-row-card stack-mobile">
        <div class="compact-row-main">
          <strong>${escapeHtml(item.judul)}</strong>
          <small>${escapeHtml(item.kategori)} • ${escapeHtml(item.tanggal)}</small>
          <span class="compact-clamp-2">${escapeHtml(item.isi)}</span>
        </div>
        <div class="compact-row-actions">
          <span class="status-pill ${item.status === "AKTIF" ? "approved" : "neutral"}">${escapeHtml(item.status)}</span>
          <button type="button" class="compact-detail-button" onclick="setAnnouncementStatus('${escapeJs(item.id)}','${escapeJs(nextStatus)}')">${escapeHtml(buttonText)}</button>
        </div>
      </div>
    `;
  }).join("");

  if (!listHtml) listHtml = `<div class="empty-panel">Belum ada pengumuman pada kategori ini.</div>`;

  setModalHtml(`
    <div class="modal-handle"></div>
    <button class="modal-close" type="button" onclick="closeModal()">×</button>
    <h3>Pengumuman</h3>
    <p class="modal-subtitle">Dashboard hanya menampilkan yang terbaru. Arsip tetap dapat dicari.</p>

    <details class="compact-disclosure">
      <summary>＋ Tambah Pengumuman</summary>
      <form id="announcementManagerForm" class="manager-form compact-form" onsubmit="saveAnnouncementFromModal(event)">
        <label class="modal-label">Judul</label>
        <input id="announcementTitle" class="portal-input" type="text" placeholder="Judul pengumuman" required>
        <div class="two-col-inputs">
          <div><label class="modal-label">Kategori</label><select id="announcementCategory" class="portal-select full"><option value="Umum">Umum</option><option value="Penting">Penting</option><option value="Agenda">Agenda</option><option value="Hari Belajar Guru">Hari Belajar Guru</option><option value="FLS">FLS</option></select></div>
          <div><label class="modal-label">Tanggal</label><input id="announcementDate" class="portal-input" type="date"></div>
        </div>
        <label class="modal-label">Isi Pengumuman</label>
        <textarea id="announcementBody" class="portal-textarea" rows="4" placeholder="Tulis isi pengumuman..." required></textarea>
        <label class="modal-label">Status</label>
        <select id="announcementStatus" class="portal-select full"><option value="AKTIF">Aktif</option><option value="NONAKTIF">Nonaktif</option></select>
        <button id="announcementSaveButton" type="submit" class="primary-button">+ TAMBAH PENGUMUMAN</button>
      </form>
    </details>

    ${compactSearchHtml(compactUI.announcements.query, "filterAnnouncementManager", "Cari judul atau isi...")}
    <div class="compact-tabs">
      ${compactTabButton("Aktif", "AKTIF", compactUI.announcements.tab, activeCount, "setAnnouncementManagerTab")}
      ${compactTabButton("Arsip", "NONAKTIF", compactUI.announcements.tab, inactiveCount, "setAnnouncementManagerTab")}
    </div>

    <div class="compact-list">${listHtml}</div>
    ${renderLoadMoreButton(filtered.length > compactUI.announcements.visible, "loadMoreAnnouncementManager")}
    <button class="secondary-button" type="button" onclick="openAdminCenter()">← Kembali ke Admin Center</button>
  `);
}

function setAnnouncementManagerTab(tab) {
  compactUI.announcements.tab = tab;
  compactUI.announcements.visible = COMPACT_PAGE_SIZE;
  renderAnnouncementManagerModal();
}

function filterAnnouncementManager(query) {
  compactUI.announcements.query = query || "";
  compactUI.announcements.visible = COMPACT_PAGE_SIZE;
  renderAnnouncementManagerModal();
  refocusCompactSearch();
}

function loadMoreAnnouncementManager() {
  compactUI.announcements.visible += COMPACT_PAGE_SIZE;
  renderAnnouncementManagerModal();
}


/* -------------------------
   PUBLIC AGENDA COMPACT
------------------------- */

function jakartaTodayKey() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const map = {};
  parts.forEach(p => { if (p.type !== "literal") map[p.type] = p.value; });
  return `${map.year}-${map.month}-${map.day}`;
}

function sortAgendaAsc(a, b) {
  return String(a.tanggalInput || "9999-12-31").localeCompare(String(b.tanggalInput || "9999-12-31"));
}

function sortAgendaDesc(a, b) {
  return String(b.tanggalInput || "").localeCompare(String(a.tanggalInput || ""));
}

function classifyPublicAgenda() {
  const today = jakartaTodayKey();
  const items = compactUI.publicAgenda.items || [];
  return {
    active: items.filter(x => String(x.status).toUpperCase() === "AKTIF").sort(sortAgendaAsc),
    upcoming: items.filter(x => String(x.status).toUpperCase() === "RENCANA" && String(x.tanggalInput || "") >= today).sort(sortAgendaAsc),
    history: items.filter(x => String(x.status).toUpperCase() === "SELESAI" || String(x.tanggalInput || "") < today).sort(sortAgendaDesc)
  };
}

function renderPublicAgendaModal() {
  const groups = classifyPublicAgenda();
  let body = "";

  if (compactUI.publicAgenda.tab === "ACTIVE") {
    body = renderPublicAgendaCards(groups.active.slice(0, compactUI.publicAgenda.visible));
    body += renderLoadMoreButton(groups.active.length > compactUI.publicAgenda.visible, "loadMorePublicAgenda", "Muat lainnya");
  } else if (compactUI.publicAgenda.tab === "UPCOMING") {
    body = renderPublicAgendaCards(groups.upcoming.slice(0, compactUI.publicAgenda.visible));
    body += renderLoadMoreButton(groups.upcoming.length > compactUI.publicAgenda.visible, "loadMorePublicAgenda", "Muat 3 lainnya");
  } else {
    body = renderAgendaHistoryMonths(groups.history);
  }

  setModalHtml(`
    <div class="modal-handle"></div>
    <button class="modal-close" type="button" onclick="closeModal()">×</button>
    <h3>Agenda MGMP</h3>
    <p class="modal-subtitle">Agenda saat ini tetap singkat. Riwayat disusun per bulan.</p>
    <div class="compact-tabs">
      ${compactTabButton("Akan Datang", "UPCOMING", compactUI.publicAgenda.tab, groups.upcoming.length, "setPublicAgendaTab")}
      ${compactTabButton("Aktif", "ACTIVE", compactUI.publicAgenda.tab, groups.active.length, "setPublicAgendaTab")}
      ${compactTabButton("Riwayat", "HISTORY", compactUI.publicAgenda.tab, groups.history.length, "setPublicAgendaTab")}
    </div>
    <div class="compact-list">${body || `<div class="empty-panel">Belum ada agenda.</div>`}</div>
    <button class="secondary-button" type="button" onclick="closeModal()">Tutup</button>
  `);
}

function renderPublicAgendaCards(items) {
  if (!items.length) return `<div class="empty-panel">Tidak ada agenda pada bagian ini.</div>`;
  return items.map(item => `
    <button type="button" class="agenda-list-card" onclick="openAgendaDetail('${escapeJs(item.id)}')">
      <div class="agenda-list-date"><b>${escapeHtml((item.tanggal || "-").split(" ")[0])}</b><span>${escapeHtml(((item.tanggal || "").split(" ")[1] || "").slice(0,3).toUpperCase())}</span></div>
      <div class="agenda-list-main"><strong>${escapeHtml(item.nama)}</strong><small>${escapeHtml(item.jam)} • ${escapeHtml(item.moda)}</small><span>${escapeHtml(item.lokasi)}</span></div>
      <span class="agenda-list-arrow">›</span>
    </button>
  `).join("");
}

function renderAgendaHistoryMonths(items) {
  if (!items.length) return `<div class="empty-panel">Belum ada riwayat agenda.</div>`;
  const map = {};
  items.forEach(item => {
    const key = String(item.tanggalInput || "").slice(0, 7) || "LAINNYA";
    if (!map[key]) map[key] = [];
    map[key].push(item);
  });
  const keys = Object.keys(map).sort().reverse().slice(0, compactUI.publicAgenda.visible);
  const rows = keys.map(key => {
    const first = map[key][0];
    const label = first && first.tanggal ? monthYearFromIndonesianDate(first.tanggal) : key;
    return `<button type="button" class="history-month-card" onclick="openAgendaHistoryMonth('${escapeJs(key)}')"><span>📁</span><div><strong>${escapeHtml(label)}</strong><small>${map[key].length} kegiatan</small></div><b>›</b></button>`;
  }).join("");
  return rows + renderLoadMoreButton(Object.keys(map).length > compactUI.publicAgenda.visible, "loadMorePublicAgenda", "Muat bulan lainnya");
}

function monthYearFromIndonesianDate(text) {
  const parts = String(text || "").split(" ");
  return parts.length >= 3 ? `${parts[1]} ${parts[2]}` : text;
}

function setPublicAgendaTab(tab) {
  compactUI.publicAgenda.tab = tab;
  compactUI.publicAgenda.visible = tab === "HISTORY" ? 5 : 3;
  renderPublicAgendaModal();
}

function loadMorePublicAgenda() {
  compactUI.publicAgenda.visible += compactUI.publicAgenda.tab === "HISTORY" ? 5 : 3;
  renderPublicAgendaModal();
}

function openAgendaHistoryMonth(key) {
  const history = classifyPublicAgenda().history.filter(x => String(x.tanggalInput || "").slice(0,7) === key);
  setModalHtml(`
    <div class="modal-handle"></div>
    <button class="modal-close" type="button" onclick="closeModal()">×</button>
    <div class="compact-detail-header"><button class="compact-back-button" type="button" onclick="renderPublicAgendaModal()">←</button><div><h3>Riwayat Agenda</h3><p class="modal-subtitle">${escapeHtml(history.length ? monthYearFromIndonesianDate(history[0].tanggal) : key)}</p></div></div>
    <div class="compact-list">${renderPublicAgendaCards(history)}</div>
    <button class="secondary-button" type="button" onclick="renderPublicAgendaModal()">← Kembali</button>
  `);
}

function openAgendaDetail(id) {
  const item = (compactUI.publicAgenda.items || []).find(x => x.id === id);
  if (!item) return;
  const docs = (compactUI.publicAgenda.documents || []).filter(x => x.agendaId === id && String(x.status).toUpperCase() === "AKTIF");
  const docPreview = docs.slice(0, 5).map(doc => `
    <button type="button" class="agenda-resource-row" onclick="${doc.link ? `openExternalLink('${escapeJs(doc.link)}')` : `openMeetingArchive({agendaId:'${escapeJs(id)}',title:'Arsip Kegiatan'})`}">
      <span>${documentTypeIcon(doc.jenis)}</span><div><strong>${escapeHtml(formatDocumentType(doc.jenis))}</strong><small>${escapeHtml(doc.judul)}</small></div><b>›</b>
    </button>
  `).join("");

  setModalHtml(`
    <div class="modal-handle"></div>
    <button class="modal-close" type="button" onclick="closeModal()">×</button>
    <div class="compact-detail-header"><button class="compact-back-button" type="button" onclick="renderPublicAgendaModal()">←</button><div><h3>${escapeHtml(item.nama)}</h3><p class="modal-subtitle">${escapeHtml(item.tanggal)} • ${escapeHtml(item.jam)}</p></div></div>
    <div class="agenda-detail-box">
      <div><span>📍</span><p><small>Lokasi / Media</small><strong>${escapeHtml(item.lokasi || "-")}</strong></p></div>
      <div><span>🟦</span><p><small>Moda</small><strong>${escapeHtml(item.moda || "-")}</strong></p></div>
      <div><span>📌</span><p><small>Status</small><strong>${escapeHtml(item.status || "-")}</strong></p></div>
    </div>
    <div class="section-mini-title top-gap">Arsip Kegiatan</div>
    ${docPreview || `<div class="empty-panel">Materi/notulen kegiatan belum tersedia.</div>`}
    ${docs.length > 5 ? `<button class="compact-more-button" type="button" onclick="openMeetingArchive({agendaId:'${escapeJs(id)}',title:'Arsip Kegiatan'})">Buka semua arsip</button>` : ""}
    <button class="secondary-button" type="button" onclick="renderPublicAgendaModal()">← Kembali ke Agenda</button>
  `);
}


/* -------------------------
   ARCHIVE COMPACT
------------------------- */

function meetingArchiveAgendaOptions(selected = "") {
  let html = `<option value="">Pilih agenda/kegiatan...</option>`;
  (compactUI.archive.agendas || []).forEach(item => {
    html += `<option value="${escapeHtml(item.id)}" ${item.id === selected ? "selected" : ""}>${escapeHtml(item.tanggal)} — ${escapeHtml(item.nama)}</option>`;
  });
  return html;
}

function archiveYearOptions() {
  const years = new Set();
  (compactUI.archive.documents || []).forEach(item => {
    const y = String(item.agendaTanggalInput || item.tanggalInput || "").slice(0,4);
    if (y) years.add(y);
  });
  const list = Array.from(years).sort().reverse();
  return `<option value="ALL">Semua Tahun</option>` + list.map(y => `<option value="${escapeHtml(y)}" ${compactUI.archive.year === y ? "selected" : ""}>${escapeHtml(y)}</option>`).join("");
}

function getFilteredArchiveGroups() {
  const q = String(compactUI.archive.query || "").toLowerCase();
  const groups = {};

  (compactUI.archive.documents || []).forEach(item => {
    if (compactUI.archive.agendaFilter && item.agendaId !== compactUI.archive.agendaFilter) return;
    if (compactUI.archive.type !== "ALL" && String(item.jenis).toUpperCase() !== compactUI.archive.type) return;
    const year = String(item.agendaTanggalInput || item.tanggalInput || "").slice(0,4);
    if (compactUI.archive.year !== "ALL" && year !== compactUI.archive.year) return;
    if (q && ![item.agendaNama, item.judul, item.deskripsi, item.dibuatOleh].join(" ").toLowerCase().includes(q)) return;

    const key = item.agendaId || "LAINNYA";
    if (!groups[key]) groups[key] = { agendaId:key, agendaNama:item.agendaNama || "Kegiatan MGMP", agendaTanggal:item.agendaTanggal || "", agendaTanggalInput:item.agendaTanggalInput || "", items:[] };
    groups[key].items.push(item);
  });

  return Object.values(groups).sort((a,b) => String(b.agendaTanggalInput || "").localeCompare(String(a.agendaTanggalInput || "")));
}

function renderMeetingArchiveModal() {
  const groups = getFilteredArchiveGroups();
  const visible = groups.slice(0, compactUI.archive.visible);
  const managerForm = compactUI.archive.isManager ? `
    <details class="compact-disclosure archive-manager-box">
      <summary>＋ Tambah Materi / Notulen / Hasil / Dokumentasi</summary>
      <form id="meetingArchiveForm" class="compact-form" onsubmit="saveMeetingDocumentFromModal(event)">
        <label class="modal-label">Agenda / Kegiatan</label>
        <select id="meetingDocAgenda" class="portal-select full" required>${meetingArchiveAgendaOptions(compactUI.archive.agendaFilter)}</select>
        <div class="two-col-inputs"><div><label class="modal-label">Jenis</label><select id="meetingDocType" class="portal-select full" required><option value="MATERI">Materi</option><option value="NOTULEN">Notulen</option><option value="HASIL_RAPAT">Hasil Rapat</option><option value="DOKUMENTASI">Dokumentasi</option></select></div><div><label class="modal-label">Tanggal</label><input id="meetingDocDate" class="portal-input" type="date"></div></div>
        <label class="modal-label">Judul</label><input id="meetingDocTitle" class="portal-input" type="text" placeholder="Judul arsip" required>
        <label class="modal-label">Ringkasan / Deskripsi</label><textarea id="meetingDocDescription" class="portal-textarea" rows="3" placeholder="Ringkasan, keputusan, tindak lanjut..."></textarea>
        <label class="modal-label">Link Berbagi</label><input id="meetingDocLink" class="portal-input" type="url" placeholder="https://drive.google.com/...">
        <div class="file-note">Portal hanya menyimpan link. File tetap di Drive/Docs/Slides/YouTube.</div>
        <label class="modal-label">Status</label><select id="meetingDocStatus" class="portal-select full"><option value="AKTIF">Aktif</option><option value="NONAKTIF">Nonaktif</option></select>
        <button id="meetingDocSaveButton" type="submit" class="primary-button">+ SIMPAN ARSIP</button>
      </form>
    </details>
  ` : "";

  let list = visible.map(group => {
    const types = Array.from(new Set(group.items.map(x => formatDocumentType(x.jenis)))).slice(0,4).join(" • ");
    return `<button type="button" class="archive-folder-card" onclick="openArchiveAgendaDetail('${escapeJs(group.agendaId)}')"><span class="archive-folder-icon">📁</span><div><strong>${escapeHtml(group.agendaNama)}</strong><small>${escapeHtml(group.agendaTanggal)} • ${group.items.length} arsip</small><p>${escapeHtml(types || "Arsip kegiatan")}</p></div><b>›</b></button>`;
  }).join("");
  if (!list) list = `<div class="empty-panel">Belum ada arsip sesuai filter.</div>`;

  setModalHtml(`
    <div class="modal-handle"></div><button class="modal-close" type="button" onclick="closeModal()">×</button>
    <div class="modal-title-row"><div class="modal-icon compact">🗂️</div><div><h3>${escapeHtml(compactUI.archive.title)}</h3><p class="modal-subtitle">Arsip dikelompokkan per kegiatan agar tidak menjadi daftar panjang.</p></div></div>
    ${managerForm}
    ${compactSearchHtml(compactUI.archive.query, "filterMeetingArchive", "Cari kegiatan, judul, atau materi...")}
    <div class="compact-filter-grid">
      <select class="portal-select" onchange="setArchiveType(this.value)"><option value="ALL" ${compactUI.archive.type === "ALL" ? "selected" : ""}>Semua Jenis</option><option value="MATERI" ${compactUI.archive.type === "MATERI" ? "selected" : ""}>Materi</option><option value="NOTULEN" ${compactUI.archive.type === "NOTULEN" ? "selected" : ""}>Notulen</option><option value="HASIL_RAPAT" ${compactUI.archive.type === "HASIL_RAPAT" ? "selected" : ""}>Hasil Rapat</option><option value="DOKUMENTASI" ${compactUI.archive.type === "DOKUMENTASI" ? "selected" : ""}>Dokumentasi</option></select>
      <select class="portal-select" onchange="setArchiveYear(this.value)">${archiveYearOptions()}</select>
    </div>
    <div class="compact-list">${list}</div>
    ${renderLoadMoreButton(groups.length > compactUI.archive.visible, "loadMoreMeetingArchive")}
    <button class="secondary-button" type="button" onclick="closeModal()">Tutup</button>
  `);
}

function filterMeetingArchive(query) { compactUI.archive.query = query || ""; compactUI.archive.visible = COMPACT_PAGE_SIZE; renderMeetingArchiveModal(); refocusCompactSearch(); }
function setArchiveType(type) { compactUI.archive.type = type; compactUI.archive.visible = COMPACT_PAGE_SIZE; renderMeetingArchiveModal(); }
function setArchiveYear(year) { compactUI.archive.year = year; compactUI.archive.visible = COMPACT_PAGE_SIZE; renderMeetingArchiveModal(); }
function loadMoreMeetingArchive() { compactUI.archive.visible += COMPACT_PAGE_SIZE; renderMeetingArchiveModal(); }

function openArchiveAgendaDetail(agendaId) {
  compactUI.archive.currentAgendaId = agendaId;
  const docs = (compactUI.archive.documents || []).filter(x => x.agendaId === agendaId).slice(0, compactUI.archive.detailVisible);
  const allDocs = (compactUI.archive.documents || []).filter(x => x.agendaId === agendaId);
  const first = allDocs[0] || {};
  let cards = docs.map(item => {
    const nextStatus = item.status === "AKTIF" ? "NONAKTIF" : "AKTIF";
    return `
      <div class="archive-card">
        <div class="archive-card-top"><span class="archive-type-icon">${documentTypeIcon(item.jenis)}</span><div class="archive-card-title"><span class="archive-type-label">${escapeHtml(formatDocumentType(item.jenis))}</span><strong>${escapeHtml(item.judul)}</strong><small>${escapeHtml(item.tanggal)}${item.dibuatOleh ? " • " + escapeHtml(item.dibuatOleh) : ""}</small></div>${compactUI.archive.isManager ? `<span class="status-pill ${item.status === "AKTIF" ? "approved" : "neutral"}">${escapeHtml(item.status)}</span>` : ""}</div>
        ${item.deskripsi ? `<p class="archive-description">${escapeHtml(item.deskripsi)}</p>` : ""}
        <div class="archive-actions">${item.link ? `<button type="button" class="archive-open-button" onclick="openExternalLink('${escapeJs(item.link)}')">🔗 Buka Link</button>` : `<span class="archive-no-link">Tanpa link</span>`}${compactUI.archive.isManager ? `<button type="button" class="archive-toggle-button" onclick="setMeetingDocumentStatus('${escapeJs(item.id)}','${escapeJs(nextStatus)}')">${item.status === "AKTIF" ? "Nonaktifkan" : "Aktifkan"}</button>` : ""}</div>
      </div>`;
  }).join("");
  if (!cards) cards = `<div class="empty-panel">Belum ada arsip pada kegiatan ini.</div>`;

  setModalHtml(`
    <div class="modal-handle"></div><button class="modal-close" type="button" onclick="closeModal()">×</button>
    <div class="compact-detail-header"><button class="compact-back-button" type="button" onclick="renderMeetingArchiveModal()">←</button><div><h3>${escapeHtml(first.agendaNama || "Arsip Kegiatan")}</h3><p class="modal-subtitle">${escapeHtml(first.agendaTanggal || "")}</p></div></div>
    <div class="compact-list">${cards}</div>
    ${renderLoadMoreButton(allDocs.length > compactUI.archive.detailVisible, "loadMoreArchiveDetail")}
    <button class="secondary-button" type="button" onclick="renderMeetingArchiveModal()">← Kembali ke Arsip</button>
  `);
}

function loadMoreArchiveDetail() {
  compactUI.archive.detailVisible += COMPACT_PAGE_SIZE;
  if (compactUI.archive.currentAgendaId) {
    openArchiveAgendaDetail(compactUI.archive.currentAgendaId);
  }
}


/* -------------------------
   ATTENDANCE COMPACT
------------------------- */

function renderAttendanceManagerModal() {
  const all = compactUI.attendance.items || [];
  const q = String(compactUI.attendance.query || "").toLowerCase();
  const counts = {
    BELUM: all.filter(x => !String(x.statusAbsen || "").trim()).length,
    HADIR: all.filter(x => String(x.statusAbsen).toUpperCase() === "HADIR").length,
    IZIN: all.filter(x => ["IZIN", "DINAS"].includes(String(x.statusAbsen).toUpperCase())).length
  };

  const filtered = all.filter(user => {
    const status = String(user.statusAbsen || "").toUpperCase();
    if (compactUI.attendance.tab === "BELUM" && status) return false;
    if (compactUI.attendance.tab === "HADIR" && status !== "HADIR") return false;
    if (compactUI.attendance.tab === "IZIN" && !["IZIN", "DINAS"].includes(status)) return false;
    if (!q) return true;
    return [user.nama, user.sekolah].join(" ").toLowerCase().includes(q);
  });

  let rows = filtered.slice(0, compactUI.attendance.visible).map(user => {
    const status = String(user.statusAbsen || "").toUpperCase();
    const action = status ? `<span class="attendance-status ${attendanceStatusClass(status)}">${statusIcon(status)} ${escapeHtml(status)}</span>` : `<button type="button" class="attendance-button" onclick="markPresent('${escapeJs(user.id)}')">HADIR</button>`;
    return `<div class="attendance-row"><div><strong>${escapeHtml(user.nama)}</strong><small>${escapeHtml(user.sekolah)}</small></div>${action}</div>`;
  }).join("");
  if (!rows) rows = `<div class="empty-panel">Tidak ada anggota pada filter ini.</div>`;

  const agenda = compactUI.attendance.agenda || {};
  setModalHtml(`
    <div class="modal-handle"></div><button class="modal-close" type="button" onclick="closeModal()">×</button>
    <h3>Absensi Pertemuan</h3><p class="modal-subtitle"><b>${escapeHtml(agenda.nama || "Agenda Aktif")}</b><br>${escapeHtml(agenda.tanggal || "")} • ${escapeHtml(agenda.jam || "")}</p>
    <div class="compact-counter-strip"><span>Belum <b>${counts.BELUM}</b></span><span>Hadir <b>${counts.HADIR}</b></span><span>Izin/Dinas <b>${counts.IZIN}</b></span></div>
    ${canUseQrAttendanceScannerClient() ? `<button class="qr-scan-launch" type="button" onclick="openQrAttendanceScanner()"><span>▣</span><div><b>Scan QR Anggota</b><small>Admin, Ketua, Sekretaris, Bendahara</small></div><strong>›</strong></button>` : ""}
    ${compactSearchHtml(compactUI.attendance.query, "filterAttendanceManager", "Cari nama atau sekolah...")}
    <div class="compact-tabs">${compactTabButton("Belum", "BELUM", compactUI.attendance.tab, counts.BELUM, "setAttendanceTab")}${compactTabButton("Hadir", "HADIR", compactUI.attendance.tab, counts.HADIR, "setAttendanceTab")}${compactTabButton("Izin/Dinas", "IZIN", compactUI.attendance.tab, counts.IZIN, "setAttendanceTab")}</div>
    <div class="compact-list">${rows}</div>
    ${renderLoadMoreButton(filtered.length > compactUI.attendance.visible, "loadMoreAttendance")}
    <button class="secondary-button" type="button" onclick="openAdminCenter()">← Kembali ke Admin Center</button>
  `);
}

function setAttendanceTab(tab) { compactUI.attendance.tab = tab; compactUI.attendance.visible = COMPACT_PAGE_SIZE; renderAttendanceManagerModal(); }
function filterAttendanceManager(q) { compactUI.attendance.query = q || ""; compactUI.attendance.visible = COMPACT_PAGE_SIZE; renderAttendanceManagerModal(); refocusCompactSearch(); }
function loadMoreAttendance() { compactUI.attendance.visible += COMPACT_PAGE_SIZE; renderAttendanceManagerModal(); }


/* -------------------------
   MY ATTENDANCE COMPACT
------------------------- */

function renderMyAttendanceModal() {
  const all = compactUI.myAttendance.items || [];
  const visible = all.slice(0, compactUI.myAttendance.visible);
  let rows = visible.map(item => {
    const status = String(item.status || "").toUpperCase();
    return `<div class="history-card"><div class="history-topline"><strong>${escapeHtml(item.agenda)}</strong><span class="attendance-status ${attendanceStatusClass(status)}">${statusIcon(status)} ${escapeHtml(status)}</span></div><small>${escapeHtml(item.tanggal)} • ${escapeHtml(item.jam)}</small></div>`;
  }).join("");
  if (!rows) rows = `<div class="empty-panel">Belum ada riwayat kehadiran.</div>`;

  setModalHtml(`
    <div class="modal-handle"></div><button class="modal-close" type="button" onclick="closeModal()">×</button>
    <h3>Kehadiran Saya</h3><p class="modal-subtitle">Hanya 5 riwayat ditampilkan terlebih dahulu.</p>
    <div class="compact-list">${rows}</div>
    ${renderLoadMoreButton(all.length > compactUI.myAttendance.visible, "loadMoreMyAttendance")}
    <button class="secondary-button" type="button" onclick="closeModal()">Tutup</button>
  `);
}

function loadMoreMyAttendance() { compactUI.myAttendance.visible += COMPACT_PAGE_SIZE; renderMyAttendanceModal(); }


/* -------------------------
   LEAVE CENTER COMPACT
------------------------- */

function renderLeaveCenterModal() {
  let agendaOptions = `<option value="">Pilih kegiatan...</option>`;
  (compactUI.leave.agendas || []).forEach(item => { agendaOptions += `<option value="${escapeHtml(item.id)}">${escapeHtml(item.tanggal)} — ${escapeHtml(item.nama)}</option>`; });

  const filter = compactUI.leave.filter;
  const filtered = (compactUI.leave.history || []).filter(item => {
    const status = String(item.status || "").toUpperCase();
    if (filter === "PENDING") return status === "PENDING";
    if (filter === "DONE") return status !== "PENDING";
    return true;
  });

  let history = filtered.slice(0, compactUI.leave.visible).map(item => `<div class="history-card"><div class="history-topline"><strong>${escapeHtml(item.agenda)}</strong><span class="status-pill ${leaveStatusClass(item.status)}">${leaveStatusLabel(item.status)}</span></div><small>${escapeHtml(item.jenisIzin)} • ${escapeHtml(item.tanggalKirim)}</small><p class="compact-clamp-2">${escapeHtml(item.keterangan)}</p>${item.catatan ? `<small>Catatan: ${escapeHtml(item.catatan)}</small>` : ""}</div>`).join("");
  if (!history) history = `<div class="empty-panel">Belum ada riwayat izin pada filter ini.</div>`;

  const all = compactUI.leave.history || [];
  const pendingCount = all.filter(x => String(x.status).toUpperCase() === "PENDING").length;
  const doneCount = all.length - pendingCount;

  setModalHtml(`
    <div class="modal-handle"></div><button class="modal-close" type="button" onclick="closeModal()">×</button>
    <h3>Izin Tidak Hadir</h3><p class="modal-subtitle">Form disimpan ringkas; riwayat tidak ditampilkan sekaligus.</p>
    <details class="compact-disclosure" ${all.length ? "" : "open"}>
      <summary>＋ Ajukan Izin Baru</summary>
      <form id="leaveForm" class="compact-form" onsubmit="submitLeaveFromModal(event)">
        <label class="modal-label">Kegiatan</label><select id="leaveAgenda" class="portal-select full" required>${agendaOptions}</select>
        <label class="modal-label">Jenis Izin</label><select id="leaveType" class="portal-select full" required><option value="SAKIT">Sakit</option><option value="DINAS">Dinas</option><option value="KELUARGA">Kepentingan Keluarga</option><option value="LAINNYA">Lainnya</option></select>
        <label class="modal-label">Keterangan</label><textarea id="leaveDescription" class="portal-textarea" rows="3" placeholder="Tuliskan alasan singkat..." required></textarea>
        <label class="modal-label">Bukti Foto / Surat <span class="optional-text">opsional, maks. 2 MB</span></label><input id="leaveFile" class="portal-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf"><div class="file-note">Format: JPG, PNG, WEBP, atau PDF.</div>
        <button id="leaveSubmitButton" type="submit" class="primary-button">KIRIM IZIN</button>
      </form>
    </details>
    <div class="section-mini-title top-gap">Riwayat Izin</div>
    <div class="compact-tabs">${compactTabButton("Semua", "ALL", compactUI.leave.filter, all.length, "setLeaveFilter")}${compactTabButton("Menunggu", "PENDING", compactUI.leave.filter, pendingCount, "setLeaveFilter")}${compactTabButton("Selesai", "DONE", compactUI.leave.filter, doneCount, "setLeaveFilter")}</div>
    <div class="compact-list">${history}</div>
    ${renderLoadMoreButton(filtered.length > compactUI.leave.visible, "loadMoreLeaveHistory")}
    <button class="secondary-button" type="button" onclick="closeModal()">Tutup</button>
  `);
}

function setLeaveFilter(filter) { compactUI.leave.filter = filter; compactUI.leave.visible = COMPACT_PAGE_SIZE; renderLeaveCenterModal(); }
function loadMoreLeaveHistory() { compactUI.leave.visible += COMPACT_PAGE_SIZE; renderLeaveCenterModal(); }


/* -------------------------
   LEAVE REVIEW COMPACT
------------------------- */

function renderLeaveReviewModal() {
  const all = compactUI.leaveReview.items || [];
  const q = String(compactUI.leaveReview.query || "").toLowerCase();
  const counts = { PENDING:0, APPROVED:0, REJECTED:0 };
  all.forEach(x => { const s=String(x.status || "PENDING").toUpperCase(); if (counts[s] != null) counts[s]++; });
  const filtered = all.filter(item => {
    if (String(item.status || "PENDING").toUpperCase() !== compactUI.leaveReview.tab) return false;
    if (!q) return true;
    return [item.nama, item.sekolah, item.agenda, item.keterangan].join(" ").toLowerCase().includes(q);
  });

  let rows = filtered.slice(0, compactUI.leaveReview.visible).map(item => {
    const pending = String(item.status).toUpperCase() === "PENDING";
    return `<div class="management-card"><div class="management-card-head"><div><strong>${escapeHtml(item.nama)}</strong><small>${escapeHtml(item.sekolah)}</small></div><span class="status-pill ${leaveStatusClass(item.status)}">${leaveStatusLabel(item.status)}</span></div><div class="leave-detail"><b>${escapeHtml(item.agenda)}</b><span>${escapeHtml(item.jenisIzin)} • ${escapeHtml(item.tanggalKirim)}</span><p class="compact-clamp-2">${escapeHtml(item.keterangan)}</p></div>${item.hasBukti ? `<button type="button" class="proof-link proof-button" onclick="openLeaveProof('${escapeJs(item.id)}')">📎 Lihat Bukti</button>` : ""}${pending ? `<textarea id="review-note-${escapeHtml(item.id)}" class="portal-textarea" rows="2" placeholder="Catatan verifikasi (opsional)"></textarea><div class="review-buttons"><button type="button" class="approve-button" onclick="reviewLeave('${escapeJs(item.id)}','APPROVE')">✓ Setujui</button><button type="button" class="reject-button" onclick="reviewLeave('${escapeJs(item.id)}','REJECT')">✕ Tolak</button></div>` : item.catatan ? `<small class="review-note-readonly">Catatan: ${escapeHtml(item.catatan)}</small>` : ""}</div>`;
  }).join("");
  if (!rows) rows = `<div class="empty-panel">Tidak ada data pada kategori ini.</div>`;

  setModalHtml(`
    <div class="modal-handle"></div><button class="modal-close" type="button" onclick="closeModal()">×</button>
    <h3>Verifikasi Izin</h3><p class="modal-subtitle">Default fokus pada yang perlu tindakan.</p>
    ${compactSearchHtml(compactUI.leaveReview.query, "filterLeaveReview", "Cari nama, sekolah, kegiatan...")}
    <div class="compact-tabs">${compactTabButton("Menunggu", "PENDING", compactUI.leaveReview.tab, counts.PENDING, "setLeaveReviewTab")}${compactTabButton("Disetujui", "APPROVED", compactUI.leaveReview.tab, counts.APPROVED, "setLeaveReviewTab")}${compactTabButton("Ditolak", "REJECTED", compactUI.leaveReview.tab, counts.REJECTED, "setLeaveReviewTab")}</div>
    <div class="compact-list">${rows}</div>
    ${renderLoadMoreButton(filtered.length > compactUI.leaveReview.visible, "loadMoreLeaveReview")}
    <button class="secondary-button" type="button" onclick="openAdminCenter()">← Kembali ke Admin Center</button>
  `);
}

function setLeaveReviewTab(tab) { compactUI.leaveReview.tab = tab; compactUI.leaveReview.visible = COMPACT_PAGE_SIZE; renderLeaveReviewModal(); }
function filterLeaveReview(q) { compactUI.leaveReview.query = q || ""; compactUI.leaveReview.visible = COMPACT_PAGE_SIZE; renderLeaveReviewModal(); refocusCompactSearch(); }
function loadMoreLeaveReview() { compactUI.leaveReview.visible += COMPACT_PAGE_SIZE; renderLeaveReviewModal(); }


/* -------------------------
   PUBLIC ANNOUNCEMENTS
------------------------- */

async function openAnnouncementPublic() {
  showLoadingModal("Pengumuman");
  try {
    const res = await apiRequest("listAnnouncementsPublic", { token: sessionToken });
    if (!res.success) { showToast(res.message); closeModal(); return; }
    compactUI.publicAnnouncements.items = res.announcements || [];
    compactUI.publicAnnouncements.visible = COMPACT_PAGE_SIZE;
    renderAnnouncementPublicModal();
  } catch (err) { showToast(err.message); closeModal(); }
}

function renderAnnouncementPublicModal() {
  const all = compactUI.publicAnnouncements.items || [];
  let rows = all.slice(0, compactUI.publicAnnouncements.visible).map(item => `<div class="public-announcement-card"><div class="announcement-label">${escapeHtml(item.kategori || "UMUM")}</div><strong>${escapeHtml(item.judul)}</strong><small>${escapeHtml(item.tanggal)}</small><p>${escapeHtml(item.isi)}</p></div>`).join("");
  if (!rows) rows = `<div class="empty-panel">Belum ada pengumuman aktif.</div>`;
  setModalHtml(`<div class="modal-handle"></div><button class="modal-close" type="button" onclick="closeModal()">×</button><h3>Pengumuman</h3><p class="modal-subtitle">Menampilkan 5 informasi terlebih dahulu.</p><div class="compact-list">${rows}</div>${renderLoadMoreButton(all.length > compactUI.publicAnnouncements.visible, "loadMorePublicAnnouncements")}<button class="secondary-button" type="button" onclick="closeModal()">Tutup</button>`);
}

function loadMorePublicAnnouncements() { compactUI.publicAnnouncements.visible += COMPACT_PAGE_SIZE; renderAnnouncementPublicModal(); }


/* -------------------------
   PRAYER WIDGET
------------------------- */

async function loadPrayerWidget() {
  const section = document.getElementById("prayerSection");
  if (!section || !sessionToken) return;

  // V1.2.5.2: tampilkan kartu segera agar tidak terlihat hilang saat request berjalan.
  // Kartu hanya disembunyikan jika Admin benar-benar menonaktifkan fitur.
  section.classList.remove("hidden");
  setText("prayerNextName", "Memuat jadwal...");
  setText("prayerNextTime", "--:-- WIB");
  setText("prayerLocation", "Kawali, Ciamis");

  try {
    const res = await apiRequest("prayerTimes", { token: sessionToken });

    // Jika Admin memang menonaktifkan jadwal salat, kartu boleh disembunyikan.
    if (res && res.enabled === false) {
      prayerWidgetData = null;
      section.classList.add("hidden");
      return;
    }

    // V1.2.5.1: kegagalan API tidak lagi membuat fitur "menghilang".
    // Kartu tetap terlihat dan dapat diketuk untuk mencoba lagi.
    if (!res || !res.success) {
      prayerWidgetData = null;
      section.classList.remove("hidden");
      setText("prayerNextName", "Jadwal belum tersedia");
      setText("prayerNextTime", "Coba lagi");
      setText("prayerLocation", shortPrayerLocation(res && res.location ? res.location : "Kawali, Ciamis"));
      return;
    }

    prayerWidgetData = res;
    section.classList.remove("hidden");
    setText("prayerNextName", (res.next && res.next.name ? res.next.name : "Salat") + (res.next && res.next.tomorrow ? " besok" : ""));
    setText("prayerNextTime", res.next && res.next.time ? res.next.time + " WIB" : "-");
    setText("prayerLocation", shortPrayerLocation(res.location));
  } catch (err) {
    prayerWidgetData = null;
    section.classList.remove("hidden");
    setText("prayerNextName", "Jadwal belum tersedia");
    setText("prayerNextTime", "Coba lagi");
    setText("prayerLocation", "Kawali, Ciamis");
  }
}

function shortPrayerLocation(text) {
  const parts = String(text || "Kawali, Ciamis").split(",").map(x => x.trim()).filter(Boolean);
  return parts.slice(0,2).join(", ") || "Kawali, Ciamis";
}

async function retryPrayerTimes() {
  prayerWidgetData = null;
  closeModal();
  await loadPrayerWidget();
  await openPrayerTimes();
}

async function openPrayerTimes() {
  if (!prayerWidgetData) {
    showLoadingModal("Jadwal Salat");
    try {
      const res = await apiRequest("prayerTimes", { token: sessionToken });

      if (res && res.enabled === false) {
        showToast("Jadwal salat sedang dinonaktifkan oleh Admin.");
        closeModal();
        return;
      }

      if (!res || !res.success) {
        const location = shortPrayerLocation(res && res.location ? res.location : "Kawali, Ciamis");
        setModalHtml(`<div class="modal-handle"></div><button class="modal-close" type="button" onclick="closeModal()">×</button><div class="modal-title-row"><div class="modal-icon compact">🕌</div><div><h3>Jadwal Salat</h3><p class="modal-subtitle">${escapeHtml(location)}</p></div></div><div class="empty-state compact"><strong>Jadwal sementara belum dapat dimuat.</strong><span>Periksa koneksi lalu coba kembali. Fitur Portal lainnya tetap dapat digunakan.</span></div><button class="primary-button" type="button" onclick="retryPrayerTimes()">Coba Lagi</button><button class="secondary-button" type="button" onclick="closeModal()">Tutup</button>`);
        return;
      }

      prayerWidgetData = res;
    } catch (err) {
      setModalHtml(`<div class="modal-handle"></div><button class="modal-close" type="button" onclick="closeModal()">×</button><div class="modal-title-row"><div class="modal-icon compact">🕌</div><div><h3>Jadwal Salat</h3><p class="modal-subtitle">Kawali, Ciamis</p></div></div><div class="empty-state compact"><strong>Jadwal sementara belum dapat dimuat.</strong><span>Silakan coba kembali beberapa saat lagi.</span></div><button class="primary-button" type="button" onclick="retryPrayerTimes()">Coba Lagi</button><button class="secondary-button" type="button" onclick="closeModal()">Tutup</button>`);
      return;
    }
  }

  const p = prayerWidgetData;
  const times = p.times || {};
  const items = [["Subuh",times.subuh],["Terbit",times.terbit],["Dzuhur",times.dzuhur],["Ashar",times.ashar],["Maghrib",times.maghrib],["Isya",times.isya]];
  setModalHtml(`<div class="modal-handle"></div><button class="modal-close" type="button" onclick="closeModal()">×</button><div class="modal-title-row"><div class="modal-icon compact">🕌</div><div><h3>Jadwal Salat</h3><p class="modal-subtitle">${escapeHtml(shortPrayerLocation(p.location))} • ${escapeHtml(p.date || "")}</p></div></div><div class="prayer-grid">${items.map(([n,t]) => `<div class="prayer-time-item ${p.next && p.next.name === n && !p.next.tomorrow ? "next" : ""}"><small>${escapeHtml(n)}</small><strong>${escapeHtml(t || "-")}</strong></div>`).join("")}</div><div class="prayer-source-note">Metode: ${escapeHtml(p.method || "Kemenag RI")} • Sumber waktu: ${escapeHtml(p.source || "API")}. Jadwal dapat berbeda beberapa menit dari jadwal lokal resmi.</div><button class="secondary-button" type="button" onclick="closeModal()">Tutup</button>`);
}


/* -------------------------
   V1.2.5 - KAS & VERIFIKASI QRIS
------------------------- */

async function openKasSaya() {
  showLoadingModal("Kas Saya");
  try {
    const res = await apiRequest("kasMySummary", { token: sessionToken });
    if (!res.success) { showToast(res.message); closeModal(); return; }

    compactUI.kas.payments = res.payments || [];
    compactUI.kas.periods = res.periods || [];
    compactUI.kas.currentPeriod = res.currentPeriod || "";
    compactUI.kas.currentStatus = res.currentStatus || "BELUM_BAYAR";
    compactUI.kas.visible = COMPACT_PAGE_SIZE;
    compactUI.portalSettings = res.settings || {};
    renderKasSayaModal();
  } catch (err) {
    showToast(err.message);
    closeModal();
  }
}


function renderKasSayaModal() {
  const s = compactUI.portalSettings || {};
  const qrisActive = String(s.qrisStatus || "").toUpperCase() === "AKTIF" && isSafePortalImageUrl(s.qrisImageUrl);
  const latestByPeriod = latestKasPaymentsByPeriod(compactUI.kas.payments || []);
  const history = Object.values(latestByPeriod).sort((a, b) => String(b.periode).localeCompare(String(a.periode)));
  const shown = history.slice(0, compactUI.kas.visible);
  const current = latestByPeriod[compactUI.kas.currentPeriod] || null;
  const status = current ? String(current.status || "").toUpperCase() : "BELUM_BAYAR";
  const hasAvailablePeriod = (compactUI.kas.periods || []).some(p => {
    const item = latestByPeriod[p.value];
    return !item || String(item.status || "").toUpperCase() === "DITOLAK";
  });

  const qrisBox = qrisActive ? `
    <div class="qris-box compact-qris-box">
      <div class="qris-title">Bayar dengan QRIS</div>
      <img src="${escapeHtml(s.qrisImageUrl)}" alt="QRIS Kas KOM 3" class="qris-image compact-qris-image">
      <strong>${escapeHtml(s.qrisName || "MGMP Komisariat 3")}</strong>
      <small>Scan dengan aplikasi bank/e-wallet. Pastikan nama penerima sesuai sebelum membayar.</small>
      <div class="qris-action-row">
        <button type="button" class="outline-button" onclick="openQrisImage('${escapeJs(s.qrisImageUrl)}')">🔍 Perbesar</button>
        ${hasAvailablePeriod ? `<button type="button" class="primary-button" onclick="openKasConfirmation()">✓ Saya Sudah Membayar</button>` : ""}
      </div>
    </div>` : `<div class="empty-panel">QRIS belum diaktifkan oleh Admin. Hubungi Bendahara untuk informasi pembayaran.</div>`;

  const historyHtml = shown.length
    ? shown.map(kasHistoryCardHtml).join("")
    : `<div class="empty-panel">Belum ada riwayat konfirmasi pembayaran.</div>`;

  setModalHtml(`
    <div class="modal-handle"></div>
    <button class="modal-close" type="button" onclick="closeModal()">×</button>
    <div class="modal-title-row">
      <div class="modal-icon compact">💰</div>
      <div><h3>Kas Saya</h3><p class="modal-subtitle">Pembayaran kas & verifikasi Bendahara</p></div>
    </div>
    <div class="kas-summary-card"><small>Kas Bulanan</small><strong>${formatRupiah(s.kasMonthly || 5000)}</strong><span>Tahun Ajaran ${escapeHtml(s.tahunAjaran || "-")}</span></div>
    ${kasCurrentStatusHtml(status, current)}
    ${qrisBox}
    <div class="section-mini-title top-gap">Riwayat Kas Saya</div>
    <div class="compact-list">${historyHtml}</div>
    ${renderLoadMoreButton(history.length > compactUI.kas.visible, "loadMoreKasHistory", "Muat 5 lainnya")}
    <button class="secondary-button" type="button" onclick="closeModal()">Tutup</button>
  `);
}


function kasCurrentStatusHtml(status, item) {
  const normalized = String(status || "BELUM_BAYAR").toUpperCase();
  const meta = {
    BELUM_BAYAR: ["Belum Bayar", "Belum ada konfirmasi untuk bulan berjalan.", "kas-status-unpaid", "○"],
    MENUNGGU: ["Menunggu Verifikasi", "Konfirmasi sudah terkirim. Bendahara akan mencocokkan transaksi QRIS.", "kas-status-pending", "⏳"],
    LUNAS: ["Lunas", "Pembayaran bulan berjalan sudah diverifikasi.", "kas-status-paid", "✓"],
    DITOLAK: ["Perlu Diperbaiki", item && item.catatanVerifikasi ? item.catatanVerifikasi : "Konfirmasi ditolak. Silakan cek transaksi lalu kirim ulang.", "kas-status-rejected", "!"]
  }[normalized] || [normalized, "", "kas-status-unpaid", "○"];

  return `<div class="kas-current-status ${meta[2]}">
    <span>${meta[3]}</span>
    <div>
      <small>${escapeHtml(kasPeriodLabelClient(compactUI.kas.currentPeriod))}</small>
      <strong>${escapeHtml(meta[0])}</strong>
      <p>${escapeHtml(meta[1])}</p>
    </div>
  </div>`;
}


function kasHistoryCardHtml(item) {
  const status = String(item.status || "MENUNGGU").toUpperCase();
  return `<button type="button" class="kas-history-card" onclick="openKasHistoryDetail('${escapeJs(item.id)}')">
    <span class="kas-history-icon">${status === "LUNAS" ? "✓" : status === "MENUNGGU" ? "⏳" : "!"}</span>
    <span class="kas-history-main"><strong>${escapeHtml(item.periodeLabel || kasPeriodLabelClient(item.periode))}</strong><small>${escapeHtml(formatRupiah(item.nominal || 0))} • ${escapeHtml(item.tanggalBayar || "-")}</small></span>
    <span class="status-pill ${kasStatusClass(status)}">${escapeHtml(kasStatusLabel(status))}</span>
  </button>`;
}


function loadMoreKasHistory() {
  compactUI.kas.visible += COMPACT_PAGE_SIZE;
  renderKasSayaModal();
}


function latestKasPaymentsByPeriod(items) {
  const map = {};
  (items || []).forEach(item => {
    if (!map[item.periode]) map[item.periode] = item;
  });
  return map;
}


function openKasConfirmation() {
  const s = compactUI.portalSettings || {};
  const periods = compactUI.kas.periods || [];
  const latest = latestKasPaymentsByPeriod(compactUI.kas.payments || []);
  const available = periods.filter(p => !latest[p.value] || String(latest[p.value].status || "").toUpperCase() === "DITOLAK");
  const selected = available.some(p => p.value === compactUI.kas.currentPeriod)
    ? compactUI.kas.currentPeriod
    : (available[0] ? available[0].value : "");

  if (!available.length) {
    showToast("Semua periode pada tahun ajaran ini sudah memiliki konfirmasi aktif/LUNAS.");
    return;
  }

  setModalHtml(`
    <div class="modal-handle"></div>
    <button class="modal-close" type="button" onclick="openKasSaya()">×</button>
    <div class="modal-title-row"><div class="modal-icon compact">🧾</div><div><h3>Konfirmasi Pembayaran</h3><p class="modal-subtitle">Isi setelah transaksi QRIS berhasil.</p></div></div>
    <div class="payment-safety-note">Portal tidak menyimpan screenshot transaksi. Bendahara mencocokkan data ini dengan riwayat QRIS.</div>
    <form id="kasConfirmForm" class="manager-form compact-form" onsubmit="submitKasConfirmation(event)">
      <label class="modal-label">Bulan Kas</label>
      <select id="kasConfirmPeriod" class="portal-select full" required>${available.map(p => `<option value="${escapeHtml(p.value)}" ${p.value === selected ? "selected" : ""}>${escapeHtml(p.label)}</option>`).join("")}</select>
      <div class="compact-detail-grid">
        <div><label class="modal-label">Nominal</label><input class="portal-input" type="text" value="${escapeHtml(formatRupiah(s.kasMonthly || 5000))}" readonly></div>
        <div><label class="modal-label">Metode</label><input class="portal-input" type="text" value="QRIS" readonly></div>
      </div>
      <div class="compact-detail-grid">
        <div><label class="modal-label">Tanggal Bayar</label><input id="kasConfirmDate" class="portal-input" type="date" value="${escapeHtml(localDateInputValue())}" required></div>
        <div><label class="modal-label">Jam Bayar</label><input id="kasConfirmTime" class="portal-input" type="time" value="${escapeHtml(localTimeInputValue())}" required></div>
      </div>
      <label class="modal-label">Nomor Referensi <span class="optional-label">opsional</span></label>
      <input id="kasConfirmReference" class="portal-input" type="text" maxlength="100" placeholder="Nomor referensi dari bukti QRIS">
      <label class="modal-label">Link Bukti <span class="optional-label">opsional</span></label>
      <input id="kasConfirmProof" class="portal-input" type="url" placeholder="https://...">
      <div class="file-note">Jika diperlukan, simpan screenshot di akun pribadi lalu tempel link berbagi. File tidak masuk penyimpanan Portal.</div>
      <label class="modal-label">Catatan <span class="optional-label">opsional</span></label>
      <textarea id="kasConfirmNote" class="portal-textarea" rows="2" maxlength="500" placeholder="Misalnya nama akun pengirim"></textarea>
      <button id="kasConfirmSubmitButton" class="primary-button" type="submit">KIRIM KONFIRMASI</button>
    </form>
    <button class="secondary-button" type="button" onclick="openKasSaya()">← Kembali</button>
  `);
}


async function submitKasConfirmation(event) {
  event.preventDefault();
  setButtonLoading("kasConfirmSubmitButton", true, "Mengirim...");

  try {
    const res = await apiRequest("submitKasPayment", {
      token: sessionToken,
      periode: valueOf("kasConfirmPeriod"),
      tanggalBayar: valueOf("kasConfirmDate"),
      jamBayar: valueOf("kasConfirmTime"),
      referensi: valueOf("kasConfirmReference"),
      buktiUrl: valueOf("kasConfirmProof"),
      catatan: valueOf("kasConfirmNote")
    });

    showToast(res.message);
    if (res.success) {
      await loadDashboard();
      await openKasSaya();
    }
  } catch (err) {
    showToast(err.message);
  } finally {
    setButtonLoading("kasConfirmSubmitButton", false, "KIRIM KONFIRMASI");
  }
}


function openKasHistoryDetail(id) {
  const item = (compactUI.kas.payments || []).find(x => x.id === id);
  if (!item) return;

  setModalHtml(`
    <div class="modal-handle"></div>
    <button class="modal-close" type="button" onclick="openKasSaya()">×</button>
    <h3>Detail Pembayaran Kas</h3><p class="modal-subtitle">${escapeHtml(item.periodeLabel || "-")}</p>
    <div class="payment-detail-list">
      ${paymentDetailRow("Status", kasStatusLabel(item.status))}
      ${paymentDetailRow("Nominal", formatRupiah(item.nominal || 0))}
      ${paymentDetailRow("Tanggal", (item.tanggalBayar || "-") + (item.jamBayar ? " • " + item.jamBayar : ""))}
      ${paymentDetailRow("Metode", item.metode || "QRIS")}
      ${paymentDetailRow("Referensi", item.referensi || "-")}
      ${paymentDetailRow("Dikirim", item.tanggalKirim || "-")}
      ${item.diverifikasiOleh ? paymentDetailRow("Diverifikasi", item.diverifikasiOleh + (item.tanggalVerifikasi ? " • " + item.tanggalVerifikasi : "")) : ""}
      ${item.catatanVerifikasi ? paymentDetailRow("Catatan Bendahara", item.catatanVerifikasi) : ""}
    </div>
    ${item.buktiUrl ? `<button class="outline-button" type="button" onclick="openExternalLink('${escapeJs(item.buktiUrl)}')">🔗 Buka Bukti</button>` : ""}
    ${String(item.status).toUpperCase() === "DITOLAK" ? `<button class="primary-button" type="button" onclick="openKasConfirmation()">KIRIM ULANG KONFIRMASI</button>` : ""}
    <button class="secondary-button" type="button" onclick="openKasSaya()">← Kembali</button>
  `);
}


async function openKasVerification() {
  if (!currentUser || !(currentUser.role === "Admin" || String(currentUser.jabatan || "").toLowerCase() === "bendahara")) {
    showToast("Verifikasi Kas hanya untuk Admin atau Bendahara.");
    return;
  }

  showLoadingModal("Verifikasi Kas");
  try {
    const res = await apiRequest("listKasPaymentsManager", { token: sessionToken });
    if (!res.success) { showToast(res.message); closeModal(); return; }

    compactUI.kasReview.items = res.payments || [];
    compactUI.kasReview.tab = "MENUNGGU";
    compactUI.kasReview.query = "";
    compactUI.kasReview.visible = COMPACT_PAGE_SIZE;
    renderKasVerificationModal();
  } catch (err) {
    showToast(err.message);
    closeModal();
  }
}


function renderKasVerificationModal() {
  const all = compactUI.kasReview.items || [];
  const tab = compactUI.kasReview.tab;
  const q = String(compactUI.kasReview.query || "").toLowerCase().trim();

  const counts = {
    MENUNGGU: all.filter(x => String(x.status).toUpperCase() === "MENUNGGU").length,
    LUNAS: all.filter(x => String(x.status).toUpperCase() === "LUNAS").length,
    DITOLAK: all.filter(x => String(x.status).toUpperCase() === "DITOLAK").length
  };

  const filtered = all.filter(item => {
    if (String(item.status).toUpperCase() !== tab) return false;
    if (!q) return true;
    return [item.nama, item.sekolah, item.periodeLabel, item.referensi].join(" ").toLowerCase().includes(q);
  });
  const shown = filtered.slice(0, compactUI.kasReview.visible);

  setModalHtml(`
    <div class="modal-handle"></div>
    <button class="modal-close" type="button" onclick="closeModal()">×</button>
    <div class="modal-title-row"><div class="modal-icon compact">💳</div><div><h3>Verifikasi Kas</h3><p class="modal-subtitle">Khusus Admin/Bendahara • fokus pada yang perlu tindakan</p></div></div>
    <div class="compact-tabs three-tabs">
      ${compactTabButton("Menunggu", "MENUNGGU", tab, counts.MENUNGGU, "setKasReviewTab")}
      ${compactTabButton("Lunas", "LUNAS", tab, counts.LUNAS, "setKasReviewTab")}
      ${compactTabButton("Ditolak", "DITOLAK", tab, counts.DITOLAK, "setKasReviewTab")}
    </div>
    ${compactSearchHtml(compactUI.kasReview.query, "filterKasReview", "Cari nama, sekolah, bulan...")}
    <div class="compact-list">${shown.length ? shown.map(kasReviewCardHtml).join("") : `<div class="empty-panel">Tidak ada data pada kategori ini.</div>`}</div>
    ${renderLoadMoreButton(filtered.length > compactUI.kasReview.visible, "loadMoreKasReview")}
    <button class="secondary-button" type="button" onclick="openAdminCenter()">← Kembali ke Admin Center</button>
  `);
}


function kasReviewCardHtml(item) {
  const pending = String(item.status).toUpperCase() === "MENUNGGU";

  return `<div class="management-card kas-review-card">
    <div class="management-card-head">
      <div><strong>${escapeHtml(item.nama)}</strong><small>${escapeHtml(item.sekolah || "-")}</small><small>${escapeHtml(item.periodeLabel || "-")} • ${escapeHtml(formatRupiah(item.nominal || 0))}</small></div>
      <span class="status-pill ${kasStatusClass(item.status)}">${escapeHtml(kasStatusLabel(item.status))}</span>
    </div>
    <div class="kas-review-meta"><span>🗓 ${escapeHtml(item.tanggalBayar || "-")} ${escapeHtml(item.jamBayar || "")}</span><span>🔖 ${escapeHtml(item.referensi || "Tanpa referensi")}</span></div>
    ${item.catatanAnggota ? `<p class="compact-clamp-2">${escapeHtml(item.catatanAnggota)}</p>` : ""}
    ${item.buktiUrl ? `<button class="proof-link proof-button" type="button" onclick="openExternalLink('${escapeJs(item.buktiUrl)}')">🔗 Buka Bukti</button>` : ""}
    ${pending ? `<textarea id="kas-review-note-${escapeHtml(item.id)}" class="portal-textarea" rows="2" maxlength="500" placeholder="Catatan verifikasi (opsional)"></textarea><div class="review-buttons"><button type="button" class="approve-button" onclick="reviewKasPayment('${escapeJs(item.id)}','APPROVE')">✓ Verifikasi Lunas</button><button type="button" class="reject-button" onclick="reviewKasPayment('${escapeJs(item.id)}','REJECT')">✕ Tolak</button></div>` : item.catatanVerifikasi ? `<small class="review-note-readonly">Catatan: ${escapeHtml(item.catatanVerifikasi)}</small>` : ""}
  </div>`;
}


function setKasReviewTab(tab) {
  compactUI.kasReview.tab = tab;
  compactUI.kasReview.visible = COMPACT_PAGE_SIZE;
  renderKasVerificationModal();
}

function filterKasReview(q) {
  compactUI.kasReview.query = q || "";
  compactUI.kasReview.visible = COMPACT_PAGE_SIZE;
  renderKasVerificationModal();
  refocusCompactSearch();
}

function loadMoreKasReview() {
  compactUI.kasReview.visible += COMPACT_PAGE_SIZE;
  renderKasVerificationModal();
}


async function reviewKasPayment(id, decision) {
  const noteEl = document.getElementById(`kas-review-note-${id}`);
  const note = noteEl ? noteEl.value.trim() : "";
  const message = decision === "APPROVE"
    ? "Verifikasi pembayaran ini sebagai LUNAS?"
    : "Tolak konfirmasi pembayaran ini?";

  if (!confirm(message)) return;

  try {
    const res = await apiRequest("reviewKasPayment", {
      token: sessionToken,
      paymentId: id,
      decision,
      note
    });

    showToast(res.message);
    if (res.success) {
      await loadDashboard();
      await openKasVerification();
    }
  } catch (err) {
    showToast(err.message);
  }
}


function kasStatusLabel(status) {
  const s = String(status || "").toUpperCase();
  if (s === "LUNAS") return "LUNAS";
  if (s === "MENUNGGU") return "MENUNGGU";
  if (s === "DITOLAK") return "DITOLAK";
  return "BELUM BAYAR";
}

function kasStatusClass(status) {
  const s = String(status || "").toUpperCase();
  if (s === "LUNAS") return "status-active";
  if (s === "MENUNGGU") return "status-pending";
  if (s === "DITOLAK") return "status-rejected";
  return "status-neutral";
}

function kasPeriodLabelClient(period) {
  const match = String(period || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return period || "Bulan berjalan";
  const names = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  return `${names[Number(match[2]) - 1] || match[2]} ${match[1]}`;
}

function localDateInputValue() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function localTimeInputValue() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function paymentDetailRow(label, value) {
  return `<div><small>${escapeHtml(label)}</small><strong>${escapeHtml(String(value || "-"))}</strong></div>`;
}

function formatRupiah(value) {
  const num = Number(value || 0);
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(num);
}

function isSafePortalImageUrl(url) {
  const text = String(url || "").trim();
  return /^https:\/\//i.test(text) || /^assets\/[A-Za-z0-9._\-/]+$/i.test(text);
}

function openQrisImage(url) {
  if (!isSafePortalImageUrl(url)) {
    showToast("Link QRIS tidak valid.");
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}


/* -------------------------
   PORTAL SETTINGS ADMIN
------------------------- */

async function openPortalSettings() {
  if (!currentUser || currentUser.role !== "Admin") { showToast("Pengaturan Portal khusus Admin."); return; }
  showLoadingModal("Pengaturan Portal");
  try {
    const res = await apiRequest("portalSettings", { token: sessionToken });
    if (!res.success) { showToast(res.message); closeModal(); return; }
    const s = res.settings || {};
    compactUI.portalSettings = s;
    setModalHtml(`
      <div class="modal-handle"></div><button class="modal-close" type="button" onclick="closeModal()">×</button>
      <h3>Pengaturan Portal</h3><p class="modal-subtitle">Pengaturan Portal. V1.2.5 menambahkan verifikasi kas tanpa mengubah fitur lama.</p>
      <form id="portalSettingsForm" class="manager-form compact-form" onsubmit="savePortalSettingsFromModal(event)">
        <div class="section-mini-title">Jadwal Salat</div>
        <label class="modal-label">Status</label><select id="settingPrayerStatus" class="portal-select full"><option value="AKTIF" ${String(s.prayerStatus).toUpperCase() === "AKTIF" ? "selected" : ""}>Aktif</option><option value="NONAKTIF" ${String(s.prayerStatus).toUpperCase() === "NONAKTIF" ? "selected" : ""}>Nonaktif</option></select>
        <label class="modal-label">Lokasi</label><input id="settingPrayerAddress" class="portal-input" type="text" value="${escapeHtml(s.prayerAddress || "Kawali, Ciamis, Jawa Barat, Indonesia")}"><div class="file-note">Default: Kawali, Ciamis. Metode perhitungan dikunci ke Kementerian Agama RI.</div>
        <div class="section-mini-title top-gap">Kas & QRIS</div>
        <label class="modal-label">Kas Bulanan</label><input id="settingKasMonthly" class="portal-input" type="number" min="0" step="1000" value="${escapeHtml(String(s.kasMonthly || 5000))}">
        <label class="modal-label">Nama QRIS / Penerima</label><input id="settingQrisName" class="portal-input" type="text" value="${escapeHtml(s.qrisName || "MGMP Bahasa Inggris SMP Komisariat 3")}">
        <label class="modal-label">Gambar QRIS</label><input id="settingQrisImage" class="portal-input" type="text" value="${escapeHtml(s.qrisImageUrl || "")}" placeholder="assets/qris.jpg atau https://..."><div class="file-note">Paling sederhana: upload qris.jpg ke folder assets GitHub, lalu isi <b>assets/qris.jpg</b>.</div>
        <label class="modal-label">Status QRIS</label><select id="settingQrisStatus" class="portal-select full"><option value="NONAKTIF" ${String(s.qrisStatus).toUpperCase() !== "AKTIF" ? "selected" : ""}>Nonaktif</option><option value="AKTIF" ${String(s.qrisStatus).toUpperCase() === "AKTIF" ? "selected" : ""}>Aktif</option></select>
        <label class="modal-label">Tahun Ajaran Default</label><input id="settingAcademicYear" class="portal-input" type="text" value="${escapeHtml(s.tahunAjaran || "2026/2027")}" placeholder="2026/2027">
        <button id="portalSettingsSaveButton" type="submit" class="primary-button">SIMPAN PENGATURAN</button>
      </form>
      <button class="secondary-button" type="button" onclick="openAdminCenter()">← Kembali ke Admin Center</button>
    `);
  } catch (err) { showToast(err.message); closeModal(); }
}

async function savePortalSettingsFromModal(event) {
  event.preventDefault();
  setButtonLoading("portalSettingsSaveButton", true, "Menyimpan...");
  try {
    const res = await apiRequest("savePortalSettings", {
      token: sessionToken,
      prayerStatus: document.getElementById("settingPrayerStatus").value,
      prayerAddress: valueOf("settingPrayerAddress"),
      kasMonthly: valueOf("settingKasMonthly"),
      qrisName: valueOf("settingQrisName"),
      qrisImageUrl: valueOf("settingQrisImage"),
      qrisStatus: document.getElementById("settingQrisStatus").value,
      tahunAjaran: valueOf("settingAcademicYear")
    });
    showToast(res.message);
    if (res.success) {
      prayerWidgetData = null;
      await loadPrayerWidget();
      await openPortalSettings();
    }
  } catch (err) { showToast(err.message); }
  finally { setButtonLoading("portalSettingsSaveButton", false, "SIMPAN PENGATURAN"); }
}



/* =========================================================
   V1.3 - KEUANGAN MGMP LENGKAP
========================================================= */

function isFinanceManagerClient() {
  if (!currentUser) return false;
  return currentUser.role === "Admin" ||
    (currentUser.role === "Pengurus" && String(currentUser.jabatan || "").toLowerCase() === "bendahara");
}

async function openFinanceCenter(tab = "SUMMARY") {
  if (!isFinanceManagerClient()) {
    await openKasSaya();
    return;
  }

  showLoadingModal("Keuangan MGMP");
  try {
    const requestedTab = tab || "SUMMARY";
    const summaryPromise = apiRequest("financeSummary", { token: sessionToken });
    const tabPromise = requestedTab === "TRANSACTIONS"
      ? apiRequest("financeTransactions", { token: sessionToken })
      : requestedTab === "MEMBERS"
        ? apiRequest("financeMemberRecap", { token: sessionToken })
        : null;

    const summaryRes = await summaryPromise;
    if (!summaryRes.success) throw new Error(summaryRes.message || "Gagal memuat ringkasan keuangan.");

    compactUI.finance.summary = summaryRes.summary || {};
    compactUI.finance.monthly = summaryRes.monthly || [];
    compactUI.finance.tahunAjaran = summaryRes.tahunAjaran || "";
    compactUI.finance.period = summaryRes.currentPeriod || compactUI.finance.period || "";
    compactUI.finance.tab = requestedTab;
    compactUI.finance.transactionVisible = COMPACT_PAGE_SIZE;
    compactUI.finance.memberVisible = COMPACT_PAGE_SIZE;
    compactUI.finance.reportVisible = COMPACT_PAGE_SIZE;
    compactUI.finance.transactionQuery = "";
    compactUI.finance.memberQuery = "";

    if (requestedTab === "SUMMARY") {
      compactUI.finance.ledgerLoaded = false;
      compactUI.finance.membersLoaded = false;
      renderFinanceCenter();
      return;
    }

    if (requestedTab === "TRANSACTIONS") {
      const ledgerRes = await tabPromise;
      if (!ledgerRes.success) throw new Error(ledgerRes.message || "Gagal memuat transaksi.");
      compactUI.finance.ledger = ledgerRes.transactions || [];
      compactUI.finance.ledgerLoaded = true;
    }

    if (requestedTab === "MEMBERS") {
      const recapRes = await tabPromise;
      if (!recapRes.success) throw new Error(recapRes.message || "Gagal memuat rekap kas.");
      compactUI.finance.members = recapRes.members || [];
      compactUI.finance.periods = recapRes.periods || [];
      compactUI.finance.period = recapRes.periode || compactUI.finance.period;
      compactUI.finance.tahunAjaran = summaryRes.tahunAjaran || recapRes.tahunAjaran || "";
      compactUI.finance.membersLoaded = true;
    }

    renderFinanceCenter();
  } catch (err) {
    showToast(err.message);
    closeModal();
  }
}

function renderFinanceCenter() {
  const f = compactUI.finance;
  const s = f.summary || {};
  let body = "";

  if (f.tab === "SUMMARY") body = renderFinanceSummaryTab();
  if (f.tab === "TRANSACTIONS") body = renderFinanceTransactionsTab();
  if (f.tab === "MEMBERS") body = renderFinanceMembersTab();
  if (f.tab === "REPORT") body = renderFinanceReportTab();

  setModalHtml(`
    <div class="modal-handle"></div>
    <button class="modal-close" type="button" onclick="closeModal()">×</button>
    <div class="modal-title-row"><div class="modal-icon compact">📊</div><div><h3>Keuangan MGMP</h3><p class="modal-subtitle">${escapeHtml(f.tahunAjaran || "Tahun Ajaran")}</p></div></div>

    <div class="finance-hero">
      <small>Saldo Saat Ini</small>
      <strong>${formatRupiah(s.saldo || 0)}</strong>
      <span>Pemasukan ${formatRupiah(s.totalPemasukan || 0)} • Pengeluaran ${formatRupiah(s.totalPengeluaran || 0)}</span>
    </div>

    <div class="compact-tabs finance-tabs">
      ${compactTabButton("Ringkasan", "SUMMARY", f.tab, "", "setFinanceTab")}
      ${compactTabButton("Transaksi", "TRANSACTIONS", f.tab, "", "setFinanceTab")}
      ${compactTabButton("Kas", "MEMBERS", f.tab, "", "setFinanceTab")}
      ${compactTabButton("Laporan", "REPORT", f.tab, "", "setFinanceTab")}
    </div>

    ${body}
    <button class="secondary-button" type="button" onclick="openAdminCenter()">← Kembali ke Admin Center</button>
  `);
}

function renderFinanceSummaryTab() {
  const f = compactUI.finance;
  const s = f.summary || {};
  const latest = f.ledgerLoaded ? (f.ledger || []).filter(x => x.status === "AKTIF").slice(0, 3) : [];
  return `
    <div class="finance-stat-grid">
      ${financeStatCard("Pemasukan Bulan Ini", formatRupiah(s.pemasukanBulanIni || 0), "↗")}
      ${financeStatCard("Pengeluaran Bulan Ini", formatRupiah(s.pengeluaranBulanIni || 0), "↘")}
      ${financeStatCard("Kas Lunas", String(s.kasLunas || 0) + " anggota", "✓")}
      ${financeStatCard("Belum Bayar", String(s.kasBelum || 0) + " anggota", "!")}
    </div>
    <div class="finance-action-row">
      <button class="primary-button compact-primary" type="button" onclick="openFinanceTransactionForm()">+ Tambah Transaksi</button>
      <button class="secondary-button compact-secondary" type="button" onclick="openKasVerification()">Verifikasi Kas</button>
    </div>
    <div class="section-mini-title top-gap">Transaksi Terbaru</div>
    <div class="compact-list">${f.ledgerLoaded ? (latest.length ? latest.map(financeTransactionCard).join("") : `<div class="empty-panel">Belum ada transaksi.</div>`) : `<div class="empty-panel compact-info-panel">Data transaksi dimuat saat tab <b>Transaksi</b> dibuka agar Keuangan tampil lebih cepat.</div>`}</div>
  `;
}

function financeStatCard(label, value, icon) {
  return `<div class="finance-stat-card"><span>${icon}</span><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>`;
}

async function setFinanceTab(tab) {
  const f = compactUI.finance;
  f.tab = tab;
  f.transactionVisible = COMPACT_PAGE_SIZE;
  f.memberVisible = COMPACT_PAGE_SIZE;
  f.reportVisible = COMPACT_PAGE_SIZE;

  if (tab === "TRANSACTIONS" && !f.ledgerLoaded) {
    renderFinanceCenter();
    try {
      const res = await apiRequest("financeTransactions", { token: sessionToken });
      if (!res.success) throw new Error(res.message || "Gagal memuat transaksi.");
      f.ledger = res.transactions || [];
      f.ledgerLoaded = true;
    } catch (err) {
      showToast(err.message);
    }
  }

  if (tab === "MEMBERS" && !f.membersLoaded) {
    renderFinanceCenter();
    try {
      const res = await apiRequest("financeMemberRecap", {
        token: sessionToken,
        tahunAjaran: f.tahunAjaran
      });
      if (!res.success) throw new Error(res.message || "Gagal memuat rekap kas.");
      f.members = res.members || [];
      f.periods = res.periods || [];
      f.period = res.periode || f.period;
      f.membersLoaded = true;
    } catch (err) {
      showToast(err.message);
    }
  }

  renderFinanceCenter();
}

function renderFinanceTransactionsTab() {
  const f = compactUI.finance;
  if (!f.ledgerLoaded) return `<div class="empty-panel compact-info-panel"><span class="mini-loader"></span> Memuat transaksi...</div>`;
  const q = String(f.transactionQuery || "").toLowerCase();
  const items = (f.ledger || []).filter(item => {
    if (f.transactionFilter !== "ALL" && item.jenis !== f.transactionFilter) return false;
    if (!q) return true;
    return [item.uraian, item.kategori, item.dibuatOleh, item.tanggalLabel].join(" ").toLowerCase().includes(q);
  });
  const visible = items.slice(0, f.transactionVisible);
  return `
    <div class="finance-action-row"><button class="primary-button compact-primary" type="button" onclick="openFinanceTransactionForm()">+ Tambah</button></div>
    ${compactSearchHtml(f.transactionQuery, "filterFinanceTransactions", "Cari transaksi...")}
    <div class="compact-tabs mini-tabs">
      ${compactTabButton("Semua", "ALL", f.transactionFilter, items.length, "setFinanceTransactionFilter")}
      ${compactTabButton("Masuk", "PEMASUKAN", f.transactionFilter, "", "setFinanceTransactionFilter")}
      ${compactTabButton("Keluar", "PENGELUARAN", f.transactionFilter, "", "setFinanceTransactionFilter")}
    </div>
    <div class="compact-list">${visible.length ? visible.map(financeTransactionCard).join("") : `<div class="empty-panel">Tidak ada transaksi.</div>`}</div>
    ${renderLoadMoreButton(items.length > f.transactionVisible, "loadMoreFinanceTransactions")}
  `;
}

function financeTransactionCard(item) {
  const isIncome = item.jenis === "PEMASUKAN";
  const amountClass = isIncome ? "finance-in" : "finance-out";
  const sign = isIncome ? "+" : "−";
  const sourceLabel = item.sumber === "KAS" ? "Kas Anggota" : (item.kategori || "Transaksi");
  const canEdit = item.dapatDiedit && item.status !== "BATAL";
  return `<div class="finance-row ${item.status === "BATAL" ? "is-cancelled" : ""}">
    <div class="finance-row-icon ${amountClass}">${isIncome ? "↗" : "↘"}</div>
    <div class="finance-row-main"><strong>${escapeHtml(item.uraian || "-")}</strong><small>${escapeHtml(item.tanggalLabel || item.tanggal || "-")} • ${escapeHtml(sourceLabel)}</small>${item.status === "BATAL" ? `<span class="status-pill rejected">BATAL</span>` : ""}</div>
    <div class="finance-row-side"><b class="${amountClass}">${sign}${formatRupiah(item.nominal || 0)}</b>${canEdit ? `<button type="button" onclick="openFinanceTransactionDetail('${escapeJs(item.id)}')">Detail</button>` : (item.linkBukti ? `<button type="button" onclick="openExternalLink('${escapeJs(item.linkBukti)}')">Bukti</button>` : "")}</div>
  </div>`;
}

function setFinanceTransactionFilter(value) { compactUI.finance.transactionFilter = value; compactUI.finance.transactionVisible = COMPACT_PAGE_SIZE; renderFinanceCenter(); }
function filterFinanceTransactions(value) { compactUI.finance.transactionQuery = value || ""; compactUI.finance.transactionVisible = COMPACT_PAGE_SIZE; renderFinanceCenter(); refocusCompactSearch(); }
function loadMoreFinanceTransactions() { compactUI.finance.transactionVisible += COMPACT_PAGE_SIZE; renderFinanceCenter(); }

async function loadFinanceMemberPeriod(period) {
  showLoadingModal("Rekap Kas Anggota");
  try {
    const res = await apiRequest("financeMemberRecap", { token: sessionToken, periode: period, tahunAjaran: compactUI.finance.tahunAjaran });
    if (!res.success) throw new Error(res.message || "Gagal memuat rekap.");
    compactUI.finance.period = res.periode;
    compactUI.finance.periods = res.periods || compactUI.finance.periods;
    compactUI.finance.members = res.members || [];
    compactUI.finance.membersLoaded = true;
    compactUI.finance.memberVisible = COMPACT_PAGE_SIZE;
    compactUI.finance.memberQuery = "";
    renderFinanceCenter();
  } catch (err) { showToast(err.message); closeModal(); }
}

function renderFinanceMembersTab() {
  const f = compactUI.finance;
  if (!f.membersLoaded) return `<div class="empty-panel compact-info-panel"><span class="mini-loader"></span> Memuat rekap kas anggota...</div>`;
  const q = String(f.memberQuery || "").toLowerCase();
  const items = (f.members || []).filter(item => {
    if (f.memberStatus !== "ALL" && item.status !== f.memberStatus) return false;
    if (!q) return true;
    return [item.nama, item.sekolah].join(" ").toLowerCase().includes(q);
  });
  const counts = {};
  (f.members || []).forEach(x => counts[x.status] = (counts[x.status] || 0) + 1);
  const options = (f.periods || []).map(p => `<option value="${escapeHtml(p.value)}" ${p.value === f.period ? "selected" : ""}>${escapeHtml(p.label)}</option>`).join("");
  return `
    <label class="modal-label">Periode Kas</label><select class="portal-select full" onchange="loadFinanceMemberPeriod(this.value)">${options}</select>
    ${compactSearchHtml(f.memberQuery, "filterFinanceMembers", "Cari anggota/sekolah...")}
    <div class="compact-tabs finance-member-tabs">
      ${compactTabButton("Belum", "BELUM_BAYAR", f.memberStatus, counts.BELUM_BAYAR || 0, "setFinanceMemberStatus")}
      ${compactTabButton("Menunggu", "MENUNGGU", f.memberStatus, counts.MENUNGGU || 0, "setFinanceMemberStatus")}
      ${compactTabButton("Lunas", "LUNAS", f.memberStatus, counts.LUNAS || 0, "setFinanceMemberStatus")}
      ${compactTabButton("Semua", "ALL", f.memberStatus, f.members.length, "setFinanceMemberStatus")}
    </div>
    <div class="compact-list">${items.slice(0, f.memberVisible).map(financeMemberCard).join("") || `<div class="empty-panel">Tidak ada data pada filter ini.</div>`}</div>
    ${renderLoadMoreButton(items.length > f.memberVisible, "loadMoreFinanceMembers")}
  `;
}

function financeMemberCard(item) {
  const labels = { LUNAS: "LUNAS", MENUNGGU: "MENUNGGU", DITOLAK: "DITOLAK", BELUM_BAYAR: "BELUM BAYAR" };
  const cls = item.status === "LUNAS" ? "approved" : item.status === "MENUNGGU" ? "pending" : item.status === "DITOLAK" ? "rejected" : "neutral";
  return `<div class="finance-member-row"><div><strong>${escapeHtml(item.nama)}</strong><small>${escapeHtml(item.sekolah)}</small></div><div class="finance-member-side"><span class="status-pill ${cls}">${escapeHtml(labels[item.status] || item.status)}</span><small>${formatRupiah(item.nominal || 0)}</small></div></div>`;
}

function setFinanceMemberStatus(value) { compactUI.finance.memberStatus = value; compactUI.finance.memberVisible = COMPACT_PAGE_SIZE; renderFinanceCenter(); }
function filterFinanceMembers(value) { compactUI.finance.memberQuery = value || ""; compactUI.finance.memberVisible = COMPACT_PAGE_SIZE; renderFinanceCenter(); refocusCompactSearch(); }
function loadMoreFinanceMembers() { compactUI.finance.memberVisible += COMPACT_PAGE_SIZE; renderFinanceCenter(); }

function renderFinanceReportTab() {
  const f = compactUI.finance;
  const rows = (f.monthly || []).slice(0, f.reportVisible).map(item => `
    <div class="finance-report-row"><div><strong>${escapeHtml(item.label)}</strong><small>Saldo kumulatif ${formatRupiah(item.saldoKumulatif || 0)}</small></div><div><span class="finance-in">+${formatRupiah(item.pemasukan || 0)}</span><span class="finance-out">−${formatRupiah(item.pengeluaran || 0)}</span></div></div>`).join("");
  return `<div class="finance-report-note">Laporan dihitung otomatis dari Kas LUNAS + transaksi manual aktif.</div><div class="compact-list">${rows || `<div class="empty-panel">Belum ada laporan.</div>`}</div>${renderLoadMoreButton((f.monthly || []).length > f.reportVisible, "loadMoreFinanceReport")}`;
}
function loadMoreFinanceReport() { compactUI.finance.reportVisible += COMPACT_PAGE_SIZE; renderFinanceCenter(); }

function openFinanceTransactionForm(id = "") {
  const item = id ? (compactUI.finance.ledger || []).find(x => x.id === id && x.dapatDiedit) : null;
  const today = localDateInputValue();
  setModalHtml(`
    <div class="modal-handle"></div><button class="modal-close" type="button" onclick="closeModal()">×</button>
    <div class="compact-detail-header"><button class="compact-back-button" type="button" onclick="renderFinanceCenter()">←</button><div><h3>${item ? "Edit" : "Tambah"} Transaksi</h3><p class="modal-subtitle">Pemasukan/pengeluaran selain kas anggota.</p></div></div>
    <form onsubmit="submitFinanceTransaction(event,'${escapeJs(item ? item.id : "")}')">
      <label class="modal-label">Tanggal</label><input id="financeDate" class="portal-input" type="date" value="${escapeHtml(item ? item.tanggal : today)}" required>
      <div class="manager-form-grid"><div><label class="modal-label">Jenis</label><select id="financeType" class="portal-select full"><option value="PEMASUKAN" ${item && item.jenis === "PEMASUKAN" ? "selected" : ""}>Pemasukan</option><option value="PENGELUARAN" ${item && item.jenis === "PENGELUARAN" ? "selected" : ""}>Pengeluaran</option></select></div><div><label class="modal-label">Nominal</label><input id="financeAmount" class="portal-input" type="number" min="1" step="1" value="${escapeHtml(item ? String(item.nominal) : "")}" placeholder="50000" required></div></div>
      <label class="modal-label">Kategori</label><input id="financeCategory" class="portal-input" type="text" maxlength="80" value="${escapeHtml(item ? item.kategori : "")}" placeholder="Contoh: ATK, Konsumsi, Donasi" required>
      <label class="modal-label">Uraian</label><input id="financeDescription" class="portal-input" type="text" maxlength="250" value="${escapeHtml(item ? item.uraian : "")}" placeholder="Keterangan transaksi" required>
      <label class="modal-label">Link Bukti (opsional)</label><input id="financeProof" class="portal-input" type="url" value="${escapeHtml(item ? item.linkBukti : "")}" placeholder="https://drive.google.com/..."><div class="file-note">Portal hanya menyimpan link bukti, bukan file.</div>
      <label class="modal-label">Catatan (opsional)</label><textarea id="financeNote" class="portal-textarea" maxlength="500">${escapeHtml(item ? item.catatan : "")}</textarea>
      <button id="financeSaveButton" class="primary-button" type="submit">SIMPAN TRANSAKSI</button>
      ${item ? `<button class="danger-outline-button" type="button" onclick="cancelFinanceTransaction('${escapeJs(item.id)}')">Batalkan Transaksi</button>` : ""}
      <button class="secondary-button" type="button" onclick="renderFinanceCenter()">← Kembali</button>
    </form>
  `);
}

async function submitFinanceTransaction(event, id) {
  event.preventDefault();
  setButtonLoading("financeSaveButton", true, "Menyimpan...");
  try {
    const res = await apiRequest("saveFinanceTransaction", {
      token: sessionToken,
      id,
      tanggal: valueOf("financeDate"),
      jenis: valueOf("financeType"),
      kategori: valueOf("financeCategory"),
      uraian: valueOf("financeDescription"),
      nominal: Number(valueOf("financeAmount") || 0),
      tahunAjaran: compactUI.finance.tahunAjaran,
      linkBukti: valueOf("financeProof"),
      catatan: valueOf("financeNote")
    });
    showToast(res.message);
    if (res.success) await openFinanceCenter("TRANSACTIONS");
  } catch (err) { showToast(err.message); }
  finally { setButtonLoading("financeSaveButton", false, "SIMPAN TRANSAKSI"); }
}

function openFinanceTransactionDetail(id) {
  const item = (compactUI.finance.ledger || []).find(x => x.id === id);
  if (!item) return;
  setModalHtml(`
    <div class="modal-handle"></div><button class="modal-close" type="button" onclick="closeModal()">×</button>
    <div class="compact-detail-header"><button class="compact-back-button" type="button" onclick="renderFinanceCenter()">←</button><div><h3>Detail Transaksi</h3><p class="modal-subtitle">${escapeHtml(item.tanggalLabel || item.tanggal)}</p></div></div>
    <div class="payment-detail-grid">
      ${paymentDetailRow("Jenis", item.jenis)}${paymentDetailRow("Kategori", item.kategori)}${paymentDetailRow("Uraian", item.uraian)}${paymentDetailRow("Nominal", formatRupiah(item.nominal || 0))}${paymentDetailRow("Dibuat oleh", item.dibuatOleh || "-")}${paymentDetailRow("Status", item.status)}
    </div>
    ${item.catatan ? `<div class="review-note-box"><small>Catatan</small><p>${escapeHtml(item.catatan)}</p></div>` : ""}
    ${item.linkBukti ? `<button class="primary-button" type="button" onclick="openExternalLink('${escapeJs(item.linkBukti)}')">Buka Bukti</button>` : ""}
    ${item.dapatDiedit && item.status !== "BATAL" ? `<button class="secondary-button" type="button" onclick="openFinanceTransactionForm('${escapeJs(item.id)}')">Edit Transaksi</button><button class="danger-outline-button" type="button" onclick="cancelFinanceTransaction('${escapeJs(item.id)}')">Batalkan Transaksi</button>` : ""}
    <button class="secondary-button" type="button" onclick="renderFinanceCenter()">← Kembali</button>
  `);
}

async function cancelFinanceTransaction(id) {
  if (!confirm("Batalkan transaksi ini? Data tidak dihapus dan tetap ada di audit trail.")) return;
  try {
    const res = await apiRequest("setFinanceTransactionStatus", { token: sessionToken, id, status: "BATAL" });
    showToast(res.message);
    if (res.success) await openFinanceCenter("TRANSACTIONS");
  } catch (err) { showToast(err.message); }
}




/* =========================================================
   V1.4.1 - LAPORAN KEUANGAN UMUM ANGGOTA (READ-ONLY)
========================================================= */

async function openPublicFinanceReport(tahunAjaran = "") {
  showLoadingModal("Laporan Keuangan Umum");
  try {
    const res = await apiRequest("financePublicSummary", {
      token: sessionToken,
      tahunAjaran: tahunAjaran || compactUI.financePublic.tahunAjaran || ""
    });
    if (!res.success) throw new Error(res.message || "Laporan keuangan belum dapat dimuat.");

    compactUI.financePublic.summary = res.summary || {};
    compactUI.financePublic.monthly = res.monthly || [];
    compactUI.financePublic.years = res.availableYears || [];
    compactUI.financePublic.tahunAjaran = res.tahunAjaran || "";
    compactUI.financePublic.page = 1;
    renderPublicFinanceReport();
  } catch (err) {
    showToast(err.message);
    closeModal();
  }
}

function renderPublicFinanceReport() {
  const f = compactUI.financePublic;
  const s = f.summary || {};
  const pageSize = COMPACT_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil((f.monthly || []).length / pageSize));
  f.page = Math.min(Math.max(1, f.page || 1), totalPages);
  const start = (f.page - 1) * pageSize;
  const rows = (f.monthly || []).slice(start, start + pageSize);

  const yearOptions = (f.years || []).length
    ? f.years.map(y => `<option value="${escapeHtml(y)}" ${y === f.tahunAjaran ? "selected" : ""}>${escapeHtml(y)}</option>`).join("")
    : `<option value="${escapeHtml(f.tahunAjaran || "2026/2027")}">${escapeHtml(f.tahunAjaran || "2026/2027")}</option>`;

  const rowsHtml = rows.length ? rows.map(item => `
    <div class="public-finance-row">
      <div><strong>${escapeHtml(item.label || item.periode || "-")}</strong><small>Saldo kumulatif ${formatRupiah(item.saldoKumulatif || 0)}</small></div>
      <div class="public-finance-row-values"><span class="finance-in">+${formatRupiah(item.pemasukan || 0)}</span><span class="finance-out">−${formatRupiah(item.pengeluaran || 0)}</span></div>
    </div>
  `).join("") : `<div class="empty-panel">Belum ada transaksi pada tahun ajaran ini.</div>`;

  setModalHtml(`
    <div class="modal-handle"></div><button class="modal-close" type="button" onclick="closeModal()">×</button>
    <div class="modal-title-row"><div class="modal-icon compact">💳</div><div><h3>Laporan Keuangan Umum</h3><p class="modal-subtitle">Transparansi keuangan MGMP • hanya data agregat</p></div></div>

    <label class="modal-label">Tahun Ajaran</label>
    <select class="portal-select full" onchange="changePublicFinanceYear(this.value)">${yearOptions}</select>

    <div class="public-finance-balance">
      <small>Saldo Saat Ini</small><strong>${formatRupiah(s.saldo || 0)}</strong><span>${escapeHtml(f.tahunAjaran || "-")}</span>
    </div>

    <div class="public-finance-grid">
      <div><small>Total Pemasukan</small><strong>${formatRupiah(s.totalPemasukan || 0)}</strong></div>
      <div><small>Total Pengeluaran</small><strong>${formatRupiah(s.totalPengeluaran || 0)}</strong></div>
      <div><small>Masuk Bulan Ini</small><strong>${formatRupiah(s.pemasukanBulanIni || 0)}</strong></div>
      <div><small>Keluar Bulan Ini</small><strong>${formatRupiah(s.pengeluaranBulanIni || 0)}</strong></div>
    </div>

    <div class="public-finance-note">Laporan ini hanya menampilkan angka umum. Data pembayaran tiap anggota dan data internal Bendahara tidak ditampilkan.</div>
    <div class="section-mini-title top-gap">Laporan Bulanan</div>
    <div class="compact-list">${rowsHtml}</div>
    ${compactPagerHtml(f.page, totalPages, "changePublicFinancePage")}

    <button class="primary-button" type="button" onclick="openKasSaya()">💰 Buka Kas Saya</button>
    <button class="secondary-button" type="button" onclick="closeModal()">Tutup</button>
  `);
}

function compactPagerHtml(page, totalPages, handlerName) {
  if (totalPages <= 1) return "";
  return `<div class="compact-pager">
    <button type="button" ${page <= 1 ? "disabled" : ""} onclick="${handlerName}(${page - 1})">‹ Sebelumnya</button>
    <span>Halaman <b>${page}</b> / ${totalPages}</span>
    <button type="button" ${page >= totalPages ? "disabled" : ""} onclick="${handlerName}(${page + 1})">Berikutnya ›</button>
  </div>`;
}

function changePublicFinancePage(page) {
  compactUI.financePublic.page = Number(page || 1);
  renderPublicFinanceReport();
}

async function changePublicFinanceYear(year) {
  compactUI.financePublic.tahunAjaran = year || "";
  await openPublicFinanceReport(year || "");
}


/* =========================================================
   V1.4.1 - AKSES SCANNER QR
========================================================= */

function canUseQrAttendanceScannerClient() {
  if (!currentUser) return false;
  if (currentUser.role === "Admin") return true;
  if (currentUser.role !== "Pengurus") return false;

  const jabatan = String(currentUser.jabatan || "").toLowerCase();
  return jabatan.includes("ketua") || jabatan.includes("sekretaris") || jabatan.includes("bendahara");
}

async function openQrCenterAction() {
  if (canUseQrAttendanceScannerClient()) {
    await openQrAttendanceScanner();
  } else {
    await openDigitalMemberCard();
  }
}


/* =========================================================
   V1.4 - KARTU ANGGOTA DIGITAL + QR ABSENSI
========================================================= */

async function openDigitalMemberCard() {
  showLoadingModal("Kartu Anggota Digital");
  try {
    const res = await apiRequest("myDigitalCard", { token: sessionToken });
    if (!res.success) throw new Error(res.message || "Kartu anggota belum tersedia.");
    compactUI.qr.card = res.card || null;
    renderDigitalMemberCard();
  } catch (err) { showToast(err.message); closeModal(); }
}

function renderDigitalMemberCard() {
  const card = compactUI.qr.card;
  if (!card) return;
  const qrUrl = buildQrImageUrl(card.qrPayload);
  const position = memberCardPositionLabel(card);
  const statusLabel = memberCardStatusLabel(card.status);

  setModalHtml(`
    <div class="modal-handle"></div><button class="modal-close" type="button" onclick="closeModal()">×</button>
    <div class="digital-member-card premium-member-card">
      <div class="premium-card-glow glow-one"></div><div class="premium-card-glow glow-two"></div>
      <div class="digital-card-head premium-card-head">
        <div class="premium-logo-ring"><img src="assets/logo.jpg" alt="Logo Komisariat 3"></div>
        <div><small>MGMP BAHASA INGGRIS SMP</small><strong>KOMISARIAT 3</strong><em>Member Identity • 2026–2029</em></div>
      </div>
      <div class="premium-gold-line"></div>
      <div class="digital-card-identity premium-card-identity">
        <small>KARTU ANGGOTA DIGITAL</small>
        <div class="premium-card-person-row">
          <div class="premium-card-photo" aria-label="Foto profil anggota">
            <img id="digitalCardPhotoImg" class="hidden" alt="Foto profil ${escapeHtml(card.nama)}">
            <span id="digitalCardInitials">-</span>
          </div>
          <div class="premium-card-person-copy">
            <h3>${escapeHtml(card.nama)}</h3>
            <p>${escapeHtml(card.sekolah)}</p>
            <div class="digital-card-meta premium-card-meta">
              <span>${escapeHtml(card.memberId)}</span>
              <b title="${escapeHtml(card.jabatan || position)}">${escapeHtml(position)}</b>
            </div>
          </div>
        </div>
      </div>
      <div class="premium-qr-caption"><span></span><b>QR ATTENDANCE</b><span></span></div>
      <div class="digital-card-qr premium-card-qr"><img src="${escapeHtml(qrUrl)}" alt="QR Anggota KOM 3" onerror="this.classList.add('hidden');document.getElementById('qrFallbackCode').classList.remove('hidden')"><div id="qrFallbackCode" class="qr-fallback-code hidden"><b>QR tidak dapat dimuat</b><small>${escapeHtml(card.memberId)}</small></div></div>
      <div class="premium-card-motto">Learn • Share • Inspire • Grow</div>
      <div class="digital-card-foot premium-card-foot"><span><i></i> STATUS: ${escapeHtml(statusLabel)}</span><span>2026–2029</span></div>
    </div>
    <div class="qr-security-note">Tunjukkan QR ini kepada petugas saat absensi. Scanner hanya dapat digunakan oleh Admin, Ketua, Sekretaris, atau Bendahara pada agenda aktif.</div>
    <button class="secondary-button" type="button" onclick="rotateDigitalMemberQr()">Perbarui QR Saya</button>
    <button class="secondary-button" type="button" onclick="closeModal()">Tutup</button>
  `);

  // Gunakan foto private yang sama dengan dashboard/profil; tidak membuat salinan file baru.
  setAvatarDisplay(
    "digitalCardPhotoImg",
    "digitalCardInitials",
    profilePhotoSourceForUser_(currentUser),
    card.nama
  );
  ensurePrivateProfilePhotoLoaded_().catch(() => {});
}

function memberCardPositionLabel(card) {
  const jabatanRaw = String((card && card.jabatan) || "").trim();
  const jabatan = jabatanRaw.toLowerCase();
  const role = String((card && card.role) || "Anggota").trim();

  if (jabatan && jabatan !== "anggota" && jabatan !== "-") {
    if (jabatan.includes("pengembangan kompetensi pedagogik")) return "Seksi Pedagogik";
    if (jabatan.includes("pengembangan kompetensi sosial")) return "Seksi Sosial";
    if (jabatan.includes("pengembangan kompetensi profesional")) return "Seksi Profesional";
    if (jabatan.includes("pengembangan kompetensi kepribadian")) return "Seksi Kepribadian";
    if (jabatan.includes("hubungan masyarakat") || jabatan === "humas") return "Humas";
    if (jabatan.includes("sekretaris")) return "Sekretaris";
    if (jabatan.includes("bendahara")) return "Bendahara";
    if (jabatan.includes("ketua")) return "Ketua";
    return jabatanRaw;
  }

  if (role === "Pengurus") return "Pengurus";
  if (role === "Admin") return "Admin";
  return "Anggota";
}

function memberCardStatusLabel(status) {
  const value = String(status || "").toUpperCase();
  if (value === "ACTIVE" || value === "AKTIF") return "AKTIF";
  if (value === "PENDING") return "MENUNGGU";
  return value || "-";
}

function buildQrImageUrl(payload) {
  // QR hanya untuk visual. Token tetap divalidasi oleh backend saat dipindai.
  return "https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=12&data=" + encodeURIComponent(payload || "");
}

async function rotateDigitalMemberQr() {
  if (!confirm("Perbarui QR anggota? QR lama akan langsung tidak berlaku.")) return;
  try {
    const res = await apiRequest("rotateMyQrToken", { token: sessionToken });
    showToast(res.message);
    if (res.success) await openDigitalMemberCard();
  } catch (err) { showToast(err.message); }
}

async function openQrAttendanceScanner() {
  stopQrScanner();
  showLoadingModal("QR Attendance");
  try {
    const res = await apiRequest("qrAttendanceContext", { token: sessionToken });
    if (!res.success) throw new Error(res.message || "Scanner belum dapat digunakan.");
    renderQrAttendanceScanner(res.agenda);
  } catch (err) { showToast(err.message); closeModal(); }
}

function renderQrAttendanceScanner(agenda) {
  setModalHtml(`
    <div class="modal-handle"></div><button class="modal-close" type="button" onclick="closeModal()">×</button>
    <div class="compact-detail-header"><button class="compact-back-button" type="button" onclick="stopQrScanner();renderAttendanceManagerModal()">←</button><div><h3>Scan QR Absensi</h3><p class="modal-subtitle">${escapeHtml(agenda.nama || "Agenda Aktif")} • ${escapeHtml(agenda.tanggal || "")}</p></div></div>
    <div class="qr-scanner-shell"><video id="qrScannerVideo" playsinline muted></video><div class="qr-scan-frame"><span></span><span></span><span></span><span></span></div><div id="qrScannerStatus" class="qr-scanner-status">Tekan Mulai Kamera</div></div>
    <div class="qr-scanner-toolbar"><button id="scanSoundToggle" class="scan-sound-toggle ${compactUI.qr.soundEnabled ? "is-on" : ""}" type="button" onclick="toggleScanSound()">${compactUI.qr.soundEnabled ? "🔊 Suara ON" : "🔇 Suara OFF"}</button><span>Bell premium berbunyi setelah absensi tersimpan.</span></div>
    <button id="qrStartButton" class="primary-button" type="button" onclick="startQrScanner()">📷 MULAI KAMERA</button>
    <div class="qr-manual-separator"><span>atau</span></div>
    <label class="modal-label">Input kode QR manual</label><input id="qrManualInput" class="portal-input" type="text" placeholder="Tempel hasil QR jika kamera tidak didukung">
    <button class="secondary-button" type="button" onclick="submitManualQrAttendance()">Proses Kode</button>
    <button class="secondary-button" type="button" onclick="stopQrScanner();renderAttendanceManagerModal()">← Kembali ke Absensi</button>
  `);
}

async function startQrScanner() {
  unlockScanAudio();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast("Browser ini tidak mendukung akses kamera. Gunakan input kode manual atau absensi manual.");
    return;
  }
  if (!("BarcodeDetector" in window)) {
    showToast("Scanner QR otomatis belum didukung browser ini. Gunakan Chrome Android terbaru atau input kode manual.");
    return;
  }

  stopQrScanner();
  try {
    compactUI.qr.detector = new BarcodeDetector({ formats: ["qr_code"] });
    compactUI.qr.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    const video = document.getElementById("qrScannerVideo");
    if (!video) { stopQrScanner(); return; }
    video.srcObject = compactUI.qr.stream;
    await video.play();
    compactUI.qr.scanning = true;
    const status = document.getElementById("qrScannerStatus"); if (status) status.textContent = "Arahkan kamera ke QR anggota";
    scanQrFrame();
  } catch (err) {
    stopQrScanner();
    showToast("Kamera tidak dapat dibuka. Pastikan izin kamera diberikan.");
  }
}

async function scanQrFrame() {
  if (!compactUI.qr.scanning) return;
  const video = document.getElementById("qrScannerVideo");
  if (!video || video.readyState < 2) { requestAnimationFrame(scanQrFrame); return; }
  try {
    const codes = await compactUI.qr.detector.detect(video);
    if (codes && codes.length && codes[0].rawValue) {
      const payload = codes[0].rawValue;
      if (payload !== compactUI.qr.lastPayload) {
        compactUI.qr.lastPayload = payload;
        compactUI.qr.scanning = false;
        await processQrAttendancePayload(payload);
        return;
      }
    }
  } catch (e) {}
  requestAnimationFrame(scanQrFrame);
}

async function processQrAttendancePayload(payload) {
  const status = document.getElementById("qrScannerStatus");
  if (status) status.textContent = "Memproses QR...";
  try {
    const res = await apiRequest("scanAttendanceQr", { token: sessionToken, qrPayload: payload });
    showQrScanResult(res);
  } catch (err) {
    showQrScanResult({ success: false, message: err.message });
  }
}

function showQrScanResult(res) {
  const status = document.getElementById("qrScannerStatus");
  const duplicate = !!(res && res.duplicate);
  const success = !!(res && res.success);
  const memberName = res && res.member && res.member.nama ? res.member.nama : "";
  const time = res && res.time ? res.time : "";

  if (status) {
    if (success && !duplicate) {
      status.innerHTML = `<b>✓ ${escapeHtml(memberName || "Kehadiran tercatat")}</b>${time ? `<small>HADIR • ${escapeHtml(time)}</small>` : ""}`;
      status.classList.add("scan-success");
      status.classList.remove("scan-warning", "scan-error");
    } else if (success && duplicate) {
      status.innerHTML = `<b>Sudah tercatat</b><small>${escapeHtml(memberName || res.message || "Peserta ini sudah hadir")}</small>`;
      status.classList.add("scan-warning");
      status.classList.remove("scan-success", "scan-error");
    } else {
      status.textContent = res.message || "QR tidak valid.";
      status.classList.add("scan-error");
      status.classList.remove("scan-success", "scan-warning");
    }
  }

  if (success && !duplicate) {
    playPremiumScanBell("success");
    if (navigator.vibrate) navigator.vibrate(110);
  } else if (success && duplicate) {
    playPremiumScanBell("duplicate");
    if (navigator.vibrate) navigator.vibrate(55);
  } else {
    playPremiumScanBell("error");
    if (navigator.vibrate) navigator.vibrate([70, 55, 70]);
  }

  showToast(res.message || (success ? "Kehadiran tercatat." : "QR tidak valid."));

  // V1.4.2: tidak lagi memanggil loadDashboard() setiap scan.
  // Data dashboard akan dimuat ulang saat diperlukan; scanner tetap ringan untuk antrean peserta.
  setTimeout(() => {
    compactUI.qr.lastPayload = "";
    const video = document.getElementById("qrScannerVideo");
    if (status) {
      status.classList.remove("scan-success", "scan-warning", "scan-error");
    }
    if (video && compactUI.qr.stream) {
      compactUI.qr.scanning = true;
      if (status) status.textContent = "Siap scan anggota berikutnya";
      scanQrFrame();
    }
  }, duplicate ? 900 : 1150);
}

function unlockScanAudio() {
  if (!compactUI.qr.soundEnabled) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!scanAudioContext) scanAudioContext = new AudioCtx();
    if (scanAudioContext.state === "suspended") scanAudioContext.resume().catch(() => {});
  } catch (e) {}
}

function toggleScanSound() {
  compactUI.qr.soundEnabled = !compactUI.qr.soundEnabled;
  localStorage.setItem("kom3_scan_sound", compactUI.qr.soundEnabled ? "on" : "off");
  if (compactUI.qr.soundEnabled) unlockScanAudio();
  const btn = document.getElementById("scanSoundToggle");
  if (btn) {
    btn.textContent = compactUI.qr.soundEnabled ? "🔊 Suara ON" : "🔇 Suara OFF";
    btn.classList.toggle("is-on", compactUI.qr.soundEnabled);
  }
  showToast(compactUI.qr.soundEnabled ? "Suara scanner diaktifkan." : "Suara scanner dimatikan.");
}

function playPremiumScanBell(type) {
  if (!compactUI.qr.soundEnabled) return;
  try {
    unlockScanAudio();
    if (!scanAudioContext) return;
    const ctx = scanAudioContext;
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.12, now + 0.025);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.72);
    master.connect(ctx.destination);

    const notes = type === "success"
      ? [{ f: 783.99, t: 0.00, d: 0.34, g: 0.75 }, { f: 1174.66, t: 0.18, d: 0.42, g: 0.58 }]
      : type === "duplicate"
        ? [{ f: 659.25, t: 0.00, d: 0.28, g: 0.48 }]
        : [{ f: 329.63, t: 0.00, d: 0.24, g: 0.42 }, { f: 246.94, t: 0.16, d: 0.28, g: 0.34 }];

    notes.forEach(note => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type === "error" ? "sine" : "triangle";
      osc.frequency.setValueAtTime(note.f, now + note.t);
      gain.gain.setValueAtTime(0.0001, now + note.t);
      gain.gain.exponentialRampToValueAtTime(note.g, now + note.t + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + note.t + note.d);
      osc.connect(gain);
      gain.connect(master);
      osc.start(now + note.t);
      osc.stop(now + note.t + note.d + 0.03);
    });
  } catch (e) {}
}


async function submitManualQrAttendance() {
  const payload = valueOf("qrManualInput");
  if (!payload) { showToast("Masukkan kode QR terlebih dahulu."); return; }
  await processQrAttendancePayload(payload);
}

function stopQrScanner() {
  compactUI.qr.scanning = false;
  if (compactUI.qr.stream) {
    compactUI.qr.stream.getTracks().forEach(track => track.stop());
    compactUI.qr.stream = null;
  }
  compactUI.qr.detector = null;
  compactUI.qr.lastPayload = "";
}



/* =========================================================
   V1.5 - BANK BERBAGI / PERANGKAT PEMBELAJARAN
========================================================= */

async function openLearningBank(tab = "BANK") {
  showLoadingModal("Bank Berbagi");

  try {
    const res = await apiRequest("listLearningResources", { token: sessionToken });
    if (!res.success) {
      if (res.sessionExpired) forceLogout();
      throw new Error(res.message || "Bank Berbagi belum dapat dibuka.");
    }

    compactUI.bank.published = res.published || [];
    compactUI.bank.mine = res.mine || [];
    compactUI.bank.review = res.review || [];
    compactUI.bank.isManager = !!res.isManager;
    compactUI.bank.tab = tab === "REVIEW" && !res.isManager ? "BANK" : tab;
    compactUI.bank.query = "";
    compactUI.bank.type = "ALL";
    compactUI.bank.kelas = "ALL";
    compactUI.bank.semester = "ALL";
    compactUI.bank.page = 1;
    compactUI.bank.myPage = 1;
    compactUI.bank.reviewPage = 1;
    compactUI.bank.reviewStatus = "MENUNGGU";

    renderLearningBankModal();
  } catch (err) {
    showToast(err.message);
    closeModal();
  }
}


function learningTypeLabel(type) {
  const map = {
    CP_ATP: "CP / ATP",
    PROTA_PROSEM: "Prota / Prosem",
    MODUL_AJAR: "Modul Ajar",
    LKPD: "LKPD",
    ASESMEN: "Asesmen",
    MEDIA: "Media Pembelajaran",
    BAHAN_AJAR: "Bahan Ajar",
    LAINNYA: "Lainnya"
  };
  return map[String(type || "").toUpperCase()] || String(type || "Lainnya");
}


function learningTypeIcon(type) {
  const map = {
    CP_ATP: "🧭",
    PROTA_PROSEM: "🗓️",
    MODUL_AJAR: "📘",
    LKPD: "📝",
    ASESMEN: "✅",
    MEDIA: "🎬",
    BAHAN_AJAR: "📚",
    LAINNYA: "📎"
  };
  return map[String(type || "").toUpperCase()] || "📎";
}


function learningStatusLabel(status) {
  const value = String(status || "").toUpperCase();
  if (value === "MENUNGGU") return "Menunggu Review";
  if (value === "TERBIT") return "Terbit";
  if (value === "DITOLAK") return "Ditolak";
  if (value === "NONAKTIF") return "Nonaktif";
  return value || "-";
}


function learningStatusClass(status) {
  const value = String(status || "").toUpperCase();
  if (value === "TERBIT") return "approved";
  if (value === "MENUNGGU") return "pending";
  if (value === "DITOLAK") return "rejected";
  return "neutral";
}


function learningTypeOptions(selected = "ALL", includeAll = true) {
  const items = [
    ["CP_ATP", "CP / ATP"],
    ["PROTA_PROSEM", "Prota / Prosem"],
    ["MODUL_AJAR", "Modul Ajar"],
    ["LKPD", "LKPD"],
    ["ASESMEN", "Asesmen"],
    ["MEDIA", "Media Pembelajaran"],
    ["BAHAN_AJAR", "Bahan Ajar"],
    ["LAINNYA", "Lainnya"]
  ];
  let html = includeAll ? `<option value="ALL" ${selected === "ALL" ? "selected" : ""}>Semua Jenis</option>` : "";
  html += items.map(item => `<option value="${item[0]}" ${selected === item[0] ? "selected" : ""}>${escapeHtml(item[1])}</option>`).join("");
  return html;
}


function learningClassOptions(selected = "ALL", includeAll = true) {
  const items = [["7", "Kelas 7"], ["8", "Kelas 8"], ["9", "Kelas 9"], ["UMUM", "Umum"]];
  let html = includeAll ? `<option value="ALL" ${selected === "ALL" ? "selected" : ""}>Semua Kelas</option>` : "";
  html += items.map(item => `<option value="${item[0]}" ${selected === item[0] ? "selected" : ""}>${item[1]}</option>`).join("");
  return html;
}


function learningSemesterOptions(selected = "ALL", includeAll = true) {
  const items = [["1", "Semester 1"], ["2", "Semester 2"], ["UMUM", "Umum"]];
  let html = includeAll ? `<option value="ALL" ${selected === "ALL" ? "selected" : ""}>Semua Semester</option>` : "";
  html += items.map(item => `<option value="${item[0]}" ${selected === item[0] ? "selected" : ""}>${item[1]}</option>`).join("");
  return html;
}


function learningResourceCardHtml(item, options = {}) {
  const showStatus = !!options.showStatus;
  const managerMode = !!options.managerMode;
  const status = String(item.status || "").toUpperCase();
  const tags = [
    `Kelas ${escapeHtml(item.kelas === "UMUM" ? "Umum" : item.kelas || "-")}`,
    item.semester === "UMUM" ? "Semester Umum" : `Semester ${escapeHtml(item.semester || "-")}`
  ];

  let managerActions = "";
  if (managerMode && status === "MENUNGGU") {
    managerActions = `
      <button type="button" class="bank-review-button approve" onclick="reviewLearningResource('${escapeJs(item.id)}','APPROVE')">✓ Terbitkan</button>
      <button type="button" class="bank-review-button reject" onclick="reviewLearningResource('${escapeJs(item.id)}','REJECT')">✕ Tolak</button>`;
  } else if (managerMode && status === "TERBIT") {
    managerActions = `<button type="button" class="bank-review-button neutral" onclick="setLearningResourceStatus('${escapeJs(item.id)}','NONAKTIF')">Nonaktifkan</button>`;
  } else if (managerMode && status === "NONAKTIF") {
    managerActions = `<button type="button" class="bank-review-button approve" onclick="setLearningResourceStatus('${escapeJs(item.id)}','TERBIT')">Terbitkan lagi</button>`;
  }

  return `
    <article class="bank-resource-card">
      <div class="bank-resource-head">
        <span class="bank-resource-icon">${learningTypeIcon(item.jenis)}</span>
        <div class="bank-resource-title">
          <span>${escapeHtml(learningTypeLabel(item.jenis))}</span>
          <strong>${escapeHtml(item.judul || "Tanpa Judul")}</strong>
          <small>${escapeHtml(item.namaGuru || "-")} • ${escapeHtml(item.sekolah || "-")}</small>
        </div>
        ${showStatus ? `<span class="status-pill ${learningStatusClass(status)}">${escapeHtml(learningStatusLabel(status))}</span>` : ""}
      </div>
      <div class="bank-chip-row">
        ${tags.map(tag => `<span>${tag}</span>`).join("")}
        ${item.topik ? `<span>🏷 ${escapeHtml(item.topik)}</span>` : ""}
      </div>
      ${item.deskripsi ? `<p class="bank-resource-description">${escapeHtml(item.deskripsi)}</p>` : ""}
      <div class="bank-resource-meta">Diunggah ${escapeHtml(item.tanggalUpload || "-")}</div>
      ${item.catatanReview && showStatus ? `<div class="bank-review-note"><b>Catatan review:</b> ${escapeHtml(item.catatanReview)}</div>` : ""}
      <div class="bank-resource-actions">
        <button type="button" class="archive-open-button" onclick="openExternalLink('${escapeJs(item.link)}')">🔗 Buka Perangkat</button>
        ${managerActions}
      </div>
    </article>`;
}


function getFilteredLearningPublished_() {
  const bank = compactUI.bank;
  const q = String(bank.query || "").toLowerCase();

  return (bank.published || []).filter(item => {
    if (bank.type !== "ALL" && String(item.jenis).toUpperCase() !== bank.type) return false;
    if (bank.kelas !== "ALL" && String(item.kelas).toUpperCase() !== bank.kelas) return false;
    if (bank.semester !== "ALL" && String(item.semester).toUpperCase() !== bank.semester) return false;
    if (q && ![item.judul, item.topik, item.deskripsi, item.namaGuru, item.sekolah, learningTypeLabel(item.jenis)].join(" ").toLowerCase().includes(q)) return false;
    return true;
  });
}


function renderLearningBankModal() {
  const bank = compactUI.bank;
  const pendingCount = (bank.review || []).filter(x => String(x.status).toUpperCase() === "MENUNGGU").length;
  const tabs = `
    <div class="compact-tabs bank-tabs">
      ${compactTabButton("Bank Berbagi", "BANK", bank.tab, bank.published.length, "setLearningBankTab")}
      ${compactTabButton("Kontribusi Saya", "MY", bank.tab, bank.mine.length, "setLearningBankTab")}
      ${bank.isManager ? compactTabButton("Review", "REVIEW", bank.tab, pendingCount, "setLearningBankTab") : ""}
    </div>`;

  let content = "";
  if (bank.tab === "MY") content = renderLearningMineTab_();
  else if (bank.tab === "REVIEW" && bank.isManager) content = renderLearningReviewTab_();
  else content = renderLearningPublishedTab_();

  setModalHtml(`
    <div class="modal-handle"></div><button class="modal-close" type="button" onclick="closeModal()">×</button>
    <div class="bank-hero">
      <div class="bank-hero-icon">📚</div>
      <div><small>V1.5 • PERANGKAT PEMBELAJARAN</small><h3>Bank Berbagi</h3><p>Berbagi perangkat, saling belajar, dan tumbuh bersama.</p></div>
    </div>
    ${tabs}
    ${content}
    <button class="secondary-button" type="button" onclick="closeModal()">Tutup</button>
  `);
}


function renderLearningPublishedTab_() {
  const bank = compactUI.bank;
  const filtered = getFilteredLearningPublished_();
  const totalPages = Math.max(1, Math.ceil(filtered.length / COMPACT_PAGE_SIZE));
  bank.page = Math.min(Math.max(1, bank.page || 1), totalPages);
  const start = (bank.page - 1) * COMPACT_PAGE_SIZE;
  const rows = filtered.slice(start, start + COMPACT_PAGE_SIZE);
  const cards = rows.length
    ? rows.map(item => learningResourceCardHtml(item)).join("")
    : `<div class="empty-panel">Belum ada perangkat yang sesuai filter.</div>`;

  return `
    <div class="bank-info-strip"><span>💡</span><p>File tetap disimpan di Drive masing-masing guru. Portal hanya menyimpan link berbagi.</p></div>
    ${compactSearchHtml(bank.query, "filterLearningBank", "Cari judul, topik, guru, atau sekolah...")}
    <div class="compact-filter-grid bank-filter-grid">
      <select class="portal-select" onchange="setLearningBankType(this.value)">${learningTypeOptions(bank.type, true)}</select>
      <select class="portal-select" onchange="setLearningBankClass(this.value)">${learningClassOptions(bank.kelas, true)}</select>
      <select class="portal-select" onchange="setLearningBankSemester(this.value)">${learningSemesterOptions(bank.semester, true)}</select>
    </div>
    <div class="bank-result-count">${filtered.length} perangkat tersedia</div>
    <div class="compact-list">${cards}</div>
    ${compactPagerHtml(bank.page, totalPages, "changeLearningBankPage")}
  `;
}


function renderLearningMineTab_() {
  const bank = compactUI.bank;
  const all = bank.mine || [];
  const totalPages = Math.max(1, Math.ceil(all.length / COMPACT_PAGE_SIZE));
  bank.myPage = Math.min(Math.max(1, bank.myPage || 1), totalPages);
  const start = (bank.myPage - 1) * COMPACT_PAGE_SIZE;
  const rows = all.slice(start, start + COMPACT_PAGE_SIZE);
  const cards = rows.length
    ? rows.map(item => learningResourceCardHtml(item, { showStatus: true })).join("")
    : `<div class="empty-panel">Anda belum pernah mengirim perangkat.</div>`;

  return `
    <details class="compact-disclosure bank-submit-box">
      <summary>＋ Bagikan Perangkat Pembelajaran</summary>
      <form id="learningResourceForm" class="compact-form" onsubmit="submitLearningResource(event)">
        <div class="two-col-inputs">
          <div><label class="modal-label">Jenis</label><select id="learningType" class="portal-select full" required>${learningTypeOptions("MODUL_AJAR", false)}</select></div>
          <div><label class="modal-label">Kelas</label><select id="learningClass" class="portal-select full" required>${learningClassOptions("9", false)}</select></div>
        </div>
        <label class="modal-label">Semester</label><select id="learningSemester" class="portal-select full" required>${learningSemesterOptions("1", false)}</select>
        <label class="modal-label">Judul Perangkat</label><input id="learningTitle" class="portal-input" type="text" maxlength="150" placeholder="Contoh: Modul Ajar Narrative Text" required>
        <label class="modal-label">Topik / Materi</label><input id="learningTopic" class="portal-input" type="text" maxlength="100" placeholder="Contoh: Narrative Text, Passive Voice...">
        <label class="modal-label">Deskripsi Singkat</label><textarea id="learningDescription" class="portal-textarea" rows="3" maxlength="500" placeholder="Jelaskan isi perangkat secara singkat..."></textarea>
        <label class="modal-label">Link Google Drive / Dokumen</label><input id="learningLink" class="portal-input" type="url" placeholder="https://drive.google.com/..." required>
        <div class="file-note">Pastikan akses link sudah diatur <b>Viewer / Siapa saja yang memiliki link</b>. File tidak diunggah ke penyimpanan Portal.</div>
        <button id="learningSubmitButton" type="submit" class="primary-button">KIRIM UNTUK REVIEW</button>
      </form>
    </details>
    <div class="section-mini-title">Riwayat Kontribusi Saya</div>
    <div class="compact-list">${cards}</div>
    ${compactPagerHtml(bank.myPage, totalPages, "changeLearningMinePage")}
  `;
}


function renderLearningReviewTab_() {
  const bank = compactUI.bank;
  const status = bank.reviewStatus;
  const all = (bank.review || []).filter(item => status === "ALL" || String(item.status).toUpperCase() === status);
  const totalPages = Math.max(1, Math.ceil(all.length / COMPACT_PAGE_SIZE));
  bank.reviewPage = Math.min(Math.max(1, bank.reviewPage || 1), totalPages);
  const start = (bank.reviewPage - 1) * COMPACT_PAGE_SIZE;
  const rows = all.slice(start, start + COMPACT_PAGE_SIZE);
  const cards = rows.length
    ? rows.map(item => learningResourceCardHtml(item, { showStatus: true, managerMode: true })).join("")
    : `<div class="empty-panel">Tidak ada perangkat pada status ini.</div>`;

  return `
    <div class="bank-manager-note"><span>🛡️</span><p>Review memastikan link dapat dibuka dan perangkat layak dibagikan kepada anggota.</p></div>
    <select class="portal-select full" onchange="setLearningReviewStatus(this.value)">
      <option value="MENUNGGU" ${status === "MENUNGGU" ? "selected" : ""}>Menunggu Review</option>
      <option value="TERBIT" ${status === "TERBIT" ? "selected" : ""}>Terbit</option>
      <option value="DITOLAK" ${status === "DITOLAK" ? "selected" : ""}>Ditolak</option>
      <option value="NONAKTIF" ${status === "NONAKTIF" ? "selected" : ""}>Nonaktif</option>
      <option value="ALL" ${status === "ALL" ? "selected" : ""}>Semua Status</option>
    </select>
    <div class="compact-list top-gap-small">${cards}</div>
    ${compactPagerHtml(bank.reviewPage, totalPages, "changeLearningReviewPage")}
  `;
}


function setLearningBankTab(tab) {
  compactUI.bank.tab = tab;
  compactUI.bank.page = 1;
  compactUI.bank.myPage = 1;
  compactUI.bank.reviewPage = 1;
  renderLearningBankModal();
}

function filterLearningBank(query) {
  compactUI.bank.query = query || "";
  compactUI.bank.page = 1;
  renderLearningBankModal();
  refocusCompactSearch();
}

function setLearningBankType(value) { compactUI.bank.type = value; compactUI.bank.page = 1; renderLearningBankModal(); }
function setLearningBankClass(value) { compactUI.bank.kelas = value; compactUI.bank.page = 1; renderLearningBankModal(); }
function setLearningBankSemester(value) { compactUI.bank.semester = value; compactUI.bank.page = 1; renderLearningBankModal(); }
function changeLearningBankPage(page) { compactUI.bank.page = Number(page || 1); renderLearningBankModal(); }
function changeLearningMinePage(page) { compactUI.bank.myPage = Number(page || 1); renderLearningBankModal(); }
function setLearningReviewStatus(value) { compactUI.bank.reviewStatus = value; compactUI.bank.reviewPage = 1; renderLearningBankModal(); }
function changeLearningReviewPage(page) { compactUI.bank.reviewPage = Number(page || 1); renderLearningBankModal(); }


async function submitLearningResource(event) {
  event.preventDefault();
  setButtonLoading("learningSubmitButton", true, "Mengirim...");

  try {
    const res = await apiRequest("submitLearningResource", {
      token: sessionToken,
      judul: valueOf("learningTitle"),
      jenis: valueOf("learningType"),
      kelas: valueOf("learningClass"),
      semester: valueOf("learningSemester"),
      topik: valueOf("learningTopic"),
      deskripsi: valueOf("learningDescription"),
      link: valueOf("learningLink")
    });

    if (!res.success) {
      if (res.sessionExpired) forceLogout();
      throw new Error(res.message || "Perangkat belum dapat dikirim.");
    }

    showToast(res.message);
    await openLearningBank("MY");
  } catch (err) {
    showToast(err.message);
  } finally {
    setButtonLoading("learningSubmitButton", false, "KIRIM UNTUK REVIEW");
  }
}


async function reviewLearningResource(id, decision) {
  const isReject = decision === "REJECT";
  const message = isReject
    ? "Tolak perangkat ini?"
    : "Terbitkan perangkat ini ke Bank Berbagi?";

  if (!confirm(message)) return;

  let catatan = "";
  if (isReject) {
    catatan = prompt("Catatan untuk pengirim (opsional):", "") || "";
  }

  try {
    const res = await apiRequest("reviewLearningResource", {
      token: sessionToken,
      id: id,
      decision: decision,
      catatan: catatan
    });
    showToast(res.message);
    if (res.success) await openLearningBank("REVIEW");
  } catch (err) {
    showToast(err.message);
  }
}


async function setLearningResourceStatus(id, status) {
  const message = status === "NONAKTIF"
    ? "Nonaktifkan perangkat ini dari Bank Berbagi?"
    : "Terbitkan kembali perangkat ini?";
  if (!confirm(message)) return;

  try {
    const res = await apiRequest("setLearningResourceStatus", {
      token: sessionToken,
      id: id,
      status: status
    });
    showToast(res.message);
    if (res.success) await openLearningBank("REVIEW");
  } catch (err) {
    showToast(err.message);
  }
}



/* =========================================================
   V1.6 - HARI BELAJAR GURU & PRAKTIK BAIK
========================================================= */

async function openHbgCenter(tab = "NEXT") {
  showLoadingModal(tab === "PRACTICE" ? "Bank Praktik Baik" : "Hari Belajar Guru");

  try {
    const res = await apiRequest("listHbgPrograms", { token: sessionToken });
    if (!res.success) {
      if (res.sessionExpired) forceLogout();
      throw new Error(res.message || "Hari Belajar Guru belum dapat dibuka.");
    }

    const allowedTabs = ["NEXT", "PRACTICE", "HISTORY", "MANAGE"];
    compactUI.hbg.items = res.items || [];
    compactUI.hbg.agendas = res.agendas || [];
    compactUI.hbg.isManager = !!res.isManager;
    compactUI.hbg.defaultYear = res.defaultYear || "";
    compactUI.hbg.tab = allowedTabs.includes(tab) ? tab : "NEXT";
    if (compactUI.hbg.tab === "MANAGE" && !compactUI.hbg.isManager) compactUI.hbg.tab = "NEXT";
    compactUI.hbg.query = "";
    compactUI.hbg.year = "ALL";
    compactUI.hbg.manageStatus = "ALL";
    compactUI.hbg.page = 1;
    renderHbgCenter();
  } catch (err) {
    showToast(err.message);
    closeModal();
  }
}


function hbgStatusLabel(status) {
  const value = String(status || "").toUpperCase();
  if (value === "RENCANA") return "Rencana";
  if (value === "AKTIF") return "Aktif";
  if (value === "SELESAI") return "Selesai";
  if (value === "BATAL") return "Batal";
  return value || "-";
}


function hbgStatusClass(status) {
  const value = String(status || "").toUpperCase();
  if (value === "AKTIF") return "approved";
  if (value === "RENCANA") return "pending";
  if (value === "BATAL") return "rejected";
  return "neutral";
}


function hbgModeLabel(mode) {
  const value = String(mode || "").toUpperCase();
  if (value === "LURING") return "Luring";
  if (value === "DARING") return "Daring";
  if (value === "HYBRID") return "Hybrid";
  return value || "-";
}


function hbgYearOptions(selected = "ALL") {
  const years = Array.from(new Set((compactUI.hbg.items || []).map(x => String(x.tahunAjaran || "").trim()).filter(Boolean)));
  if (compactUI.hbg.defaultYear && !years.includes(compactUI.hbg.defaultYear)) years.push(compactUI.hbg.defaultYear);
  years.sort().reverse();
  return `<option value="ALL" ${selected === "ALL" ? "selected" : ""}>Semua Tahun</option>` +
    years.map(year => `<option value="${escapeHtml(year)}" ${selected === year ? "selected" : ""}>${escapeHtml(year)}</option>`).join("");
}


function hbgTabItems_(tab) {
  const hbg = compactUI.hbg;
  const q = String(hbg.query || "").toLowerCase();
  let items = (hbg.items || []).filter(item => {
    const status = String(item.status || "").toUpperCase();
    if (tab === "NEXT" && !["RENCANA", "AKTIF"].includes(status)) return false;
    if (tab === "PRACTICE" && status !== "SELESAI") return false;
    if (tab === "HISTORY" && !["SELESAI", "BATAL"].includes(status)) return false;
    if (tab === "MANAGE" && hbg.manageStatus !== "ALL" && status !== hbg.manageStatus) return false;
    if (hbg.year !== "ALL" && String(item.tahunAjaran || "") !== hbg.year) return false;
    if (q && ![
      item.namaKegiatan, item.sekolahPelaksana, item.narasumber, item.judulPraktikBaik,
      item.ringkasan, item.lokasi, item.tahunAjaran
    ].join(" ").toLowerCase().includes(q)) return false;
    return true;
  });

  items.sort((a, b) => {
    const da = String(a.tanggalInput || "");
    const db = String(b.tanggalInput || "");
    return tab === "NEXT" ? da.localeCompare(db) : db.localeCompare(da);
  });
  return items;
}


function hbgCounts_() {
  const items = compactUI.hbg.items || [];
  return {
    next: items.filter(x => ["RENCANA", "AKTIF"].includes(String(x.status).toUpperCase())).length,
    practice: items.filter(x => String(x.status).toUpperCase() === "SELESAI").length,
    history: items.filter(x => ["SELESAI", "BATAL"].includes(String(x.status).toUpperCase())).length,
    manage: items.length
  };
}


function renderHbgCenter() {
  const hbg = compactUI.hbg;
  const counts = hbgCounts_();
  const items = hbgTabItems_(hbg.tab);
  const totalPages = Math.max(1, Math.ceil(items.length / COMPACT_PAGE_SIZE));
  hbg.page = Math.min(Math.max(1, hbg.page || 1), totalPages);
  const start = (hbg.page - 1) * COMPACT_PAGE_SIZE;
  const rows = items.slice(start, start + COMPACT_PAGE_SIZE);

  const cards = rows.length
    ? rows.map(item => hbgCardHtml_(item, hbg.tab === "MANAGE")).join("")
    : `<div class="empty-panel">Belum ada data pada bagian ini.</div>`;

  const managerTools = hbg.tab === "MANAGE" && hbg.isManager
    ? `<div class="hbg-manager-bar"><button class="primary-button" type="button" onclick="openHbgEditor('')">＋ TAMBAH HARI BELAJAR</button></div>`
    : "";

  const statusFilter = hbg.tab === "MANAGE"
    ? `<select class="portal-select full" onchange="setHbgManageStatus(this.value)">
        <option value="ALL" ${hbg.manageStatus === "ALL" ? "selected" : ""}>Semua Status</option>
        <option value="RENCANA" ${hbg.manageStatus === "RENCANA" ? "selected" : ""}>Rencana</option>
        <option value="AKTIF" ${hbg.manageStatus === "AKTIF" ? "selected" : ""}>Aktif</option>
        <option value="SELESAI" ${hbg.manageStatus === "SELESAI" ? "selected" : ""}>Selesai</option>
        <option value="BATAL" ${hbg.manageStatus === "BATAL" ? "selected" : ""}>Batal</option>
      </select>`
    : "";

  setModalHtml(`
    <div class="modal-handle"></div><button class="modal-close" type="button" onclick="closeModal()">×</button>
    <div class="hbg-hero">
      <div class="hbg-hero-icon">🎓</div>
      <div><small>V1.6 • PENGEMBANGAN GURU</small><h3>Hari Belajar Guru</h3><p>Giliran berbagi, praktik baik, materi, dan rekam kegiatan Komisariat 3.</p></div>
    </div>

    <div class="compact-tabs hbg-tabs">
      ${compactTabButton("Berikutnya", "NEXT", hbg.tab, counts.next, "setHbgTab")}
      ${compactTabButton("Praktik Baik", "PRACTICE", hbg.tab, counts.practice, "setHbgTab")}
      ${compactTabButton("Riwayat", "HISTORY", hbg.tab, counts.history, "setHbgTab")}
      ${hbg.isManager ? compactTabButton("Kelola", "MANAGE", hbg.tab, counts.manage, "setHbgTab") : ""}
    </div>

    ${managerTools}
    <input class="portal-input compact-search" type="search" placeholder="Cari sekolah, narasumber, atau praktik baik..." value="${escapeHtml(hbg.query)}" oninput="filterHbg(this.value)">
    <div class="compact-filter-grid hbg-filter-grid">
      <select class="portal-select full" onchange="setHbgYear(this.value)">${hbgYearOptions(hbg.year)}</select>
      ${statusFilter}
    </div>
    <div class="hbg-result-count">${items.length} kegiatan ditemukan</div>
    <div class="compact-list">${cards}</div>
    ${compactPagerHtml(hbg.page, totalPages, "changeHbgPage")}
    <button class="secondary-button" type="button" onclick="closeModal()">Tutup</button>
  `);
}


function hbgCardHtml_(item, managerMode = false) {
  const a = item.attendance || { hadir: 0, total: 0 };
  const status = String(item.status || "").toUpperCase();
  let manage = "";
  if (managerMode) {
    const statusButtons = status === "RENCANA"
      ? `<button class="bank-review-button approve" type="button" onclick="setHbgProgramStatus('${escapeJs(item.id)}','AKTIF')">Aktifkan</button>`
      : status === "AKTIF"
        ? `<button class="bank-review-button approve" type="button" onclick="setHbgProgramStatus('${escapeJs(item.id)}','SELESAI')">Selesaikan</button>`
        : status === "SELESAI"
          ? `<button class="bank-review-button neutral" type="button" onclick="setHbgProgramStatus('${escapeJs(item.id)}','RENCANA')">Jadikan Rencana</button>`
          : `<button class="bank-review-button neutral" type="button" onclick="setHbgProgramStatus('${escapeJs(item.id)}','RENCANA')">Pulihkan</button>`;
    manage = `<div class="hbg-card-actions"><button class="bank-review-button neutral" type="button" onclick="openHbgEditor('${escapeJs(item.id)}')">✎ Edit</button>${statusButtons}${status !== "BATAL" ? `<button class="bank-review-button reject" type="button" onclick="setHbgProgramStatus('${escapeJs(item.id)}','BATAL')">Batal</button>` : ""}</div>`;
  }

  return `<article class="hbg-card">
    <div class="hbg-card-top">
      <div class="hbg-date-box"><b>${escapeHtml((item.tanggal || "-").split(" ")[0])}</b><span>${escapeHtml(((item.tanggal || "").split(" ")[1] || "").substring(0,3).toUpperCase())}</span></div>
      <div class="hbg-card-title"><small>${escapeHtml(item.namaKegiatan || "Hari Belajar Guru")}</small><strong>${escapeHtml(item.judulPraktikBaik || "Praktik Baik")}</strong><p>${escapeHtml(item.sekolahPelaksana || "-")}</p></div>
      <span class="status-pill ${hbgStatusClass(status)}">${escapeHtml(hbgStatusLabel(status))}</span>
    </div>
    <div class="hbg-chip-row"><span>🕐 ${escapeHtml(item.jam || "-")}</span><span>💻 ${escapeHtml(hbgModeLabel(item.moda))}</span><span>🎤 ${escapeHtml(item.narasumber || "-")}</span></div>
    <div class="hbg-card-meta">📍 ${escapeHtml(item.lokasi || "-")} • 👥 ${Number(a.hadir || 0)} hadir${item.agendaId ? "" : " • belum terhubung absensi"}</div>
    <div class="hbg-card-actions"><button class="archive-open-button" type="button" onclick="openHbgDetail('${escapeJs(item.id)}')">Lihat Detail</button>${item.linkMateri ? `<button class="bank-review-button neutral" type="button" onclick="openExternalLink('${escapeJs(item.linkMateri)}')">📚 Materi</button>` : ""}${item.linkVideo ? `<button class="bank-review-button neutral" type="button" onclick="openExternalLink('${escapeJs(item.linkVideo)}')">▶ Video</button>` : ""}</div>
    ${manage}
  </article>`;
}


function setHbgTab(tab) { compactUI.hbg.tab = tab; compactUI.hbg.page = 1; renderHbgCenter(); }
function filterHbg(value) { compactUI.hbg.query = value || ""; compactUI.hbg.page = 1; renderHbgCenter(); refocusCompactSearch(); }
function setHbgYear(value) { compactUI.hbg.year = value || "ALL"; compactUI.hbg.page = 1; renderHbgCenter(); }
function setHbgManageStatus(value) { compactUI.hbg.manageStatus = value || "ALL"; compactUI.hbg.page = 1; renderHbgCenter(); }
function changeHbgPage(page) { compactUI.hbg.page = Number(page || 1); renderHbgCenter(); }


function openHbgDetail(id) {
  const item = (compactUI.hbg.items || []).find(x => String(x.id) === String(id));
  if (!item) return showToast("Data kegiatan tidak ditemukan.");
  const a = item.attendance || { hadir: 0, izin: 0, dinas: 0, total: 0 };

  setModalHtml(`
    <div class="modal-handle"></div><button class="modal-close" type="button" onclick="closeModal()">×</button>
    <div class="compact-detail-header"><button class="compact-back-button" type="button" onclick="renderHbgCenter()">←</button><div><h3>Detail Hari Belajar Guru</h3><p class="modal-subtitle">${escapeHtml(item.tanggal || "-")} • ${escapeHtml(item.jam || "-")}</p></div></div>
    <div class="hbg-detail-card">
      <span class="status-pill ${hbgStatusClass(item.status)}">${escapeHtml(hbgStatusLabel(item.status))}</span>
      <small>${escapeHtml(item.namaKegiatan || "Hari Belajar Guru")}</small>
      <h3>${escapeHtml(item.judulPraktikBaik || "-")}</h3>
      <p>${escapeHtml(item.ringkasan || "Belum ada ringkasan praktik baik.")}</p>
      <div class="profile-data-grid hbg-detail-grid">
        <div><small>SEKOLAH PELAKSANA</small><strong>${escapeHtml(item.sekolahPelaksana || "-")}</strong></div>
        <div><small>NARASUMBER</small><strong>${escapeHtml(item.narasumber || "-")}</strong></div>
        <div><small>MODA</small><strong>${escapeHtml(hbgModeLabel(item.moda))}</strong></div>
        <div><small>LOKASI</small><strong>${escapeHtml(item.lokasi || "-")}</strong></div>
        <div><small>TAHUN AJARAN</small><strong>${escapeHtml(item.tahunAjaran || "-")}</strong></div>
        <div><small>AGENDA TERHUBUNG</small><strong>${escapeHtml(item.agendaId || "Belum dihubungkan")}</strong></div>
      </div>
      <div class="hbg-attendance-summary"><span><b>${Number(a.hadir || 0)}</b>Hadir</span><span><b>${Number(a.izin || 0)}</b>Izin</span><span><b>${Number(a.dinas || 0)}</b>Dinas</span></div>
    </div>
    <div class="hbg-card-actions hbg-detail-actions">
      ${item.linkMateri ? `<button class="primary-button" type="button" onclick="openExternalLink('${escapeJs(item.linkMateri)}')">📚 BUKA MATERI</button>` : ""}
      ${item.linkVideo ? `<button class="secondary-button" type="button" onclick="openExternalLink('${escapeJs(item.linkVideo)}')">▶ LIHAT VIDEO</button>` : ""}
      ${compactUI.hbg.isManager && item.agendaId ? `<button class="secondary-button" type="button" onclick="openHbgParticipants('${escapeJs(item.id)}')">👥 DAFTAR PESERTA</button>` : ""}
      ${compactUI.hbg.isManager ? `<button class="secondary-button" type="button" onclick="openHbgEditor('${escapeJs(item.id)}')">✎ EDIT KEGIATAN</button>` : ""}
    </div>
  `);
}


function openHbgEditor(id = "") {
  if (!compactUI.hbg.isManager) return showToast("Akses ditolak.");
  const item = id ? (compactUI.hbg.items || []).find(x => String(x.id) === String(id)) : null;
  const year = item ? item.tahunAjaran : (compactUI.hbg.defaultYear || "2026/2027");
  const agendaOptions = [`<option value="">Tidak dihubungkan dulu</option>`].concat((compactUI.hbg.agendas || []).map(a => `<option value="${escapeHtml(a.id)}" ${item && item.agendaId === a.id ? "selected" : ""}>${escapeHtml(a.tanggal || "-")} • ${escapeHtml(a.nama || a.id)}</option>`)).join("");

  setModalHtml(`
    <div class="modal-handle"></div><button class="modal-close" type="button" onclick="closeModal()">×</button>
    <div class="compact-detail-header"><button class="compact-back-button" type="button" onclick="renderHbgCenter()">←</button><div><h3>${item ? "Edit" : "Tambah"} Hari Belajar Guru</h3><p class="modal-subtitle">Hubungkan dengan Agenda MGMP agar kehadiran terbaca otomatis.</p></div></div>
    <form class="compact-form hbg-editor-form" onsubmit="saveHbgProgram(event,'${escapeJs(item ? item.id : "")}')">
      <label class="modal-label">Agenda MGMP terkait (opsional)</label>
      <select id="hbgAgendaId" class="portal-select full" onchange="applyHbgAgendaSelection(this.value)">${agendaOptions}</select>
      <div class="form-grid-2">
        <div><label class="modal-label">Tahun Ajaran</label><input id="hbgYearInput" class="portal-input" type="text" value="${escapeHtml(year)}" placeholder="2026/2027" required></div>
        <div><label class="modal-label">Status</label><select id="hbgStatus" class="portal-select full"><option value="RENCANA" ${!item || item.status === "RENCANA" ? "selected" : ""}>Rencana</option><option value="AKTIF" ${item && item.status === "AKTIF" ? "selected" : ""}>Aktif</option><option value="SELESAI" ${item && item.status === "SELESAI" ? "selected" : ""}>Selesai</option><option value="BATAL" ${item && item.status === "BATAL" ? "selected" : ""}>Batal</option></select></div>
      </div>
      <label class="modal-label">Nama Kegiatan</label><input id="hbgName" class="portal-input" type="text" value="${escapeHtml(item ? item.namaKegiatan : "Hari Belajar Guru")}" required>
      <div class="form-grid-2">
        <div><label class="modal-label">Tanggal</label><input id="hbgDate" class="portal-input" type="date" value="${escapeHtml(item ? item.tanggalInput : "")}" required></div>
        <div><label class="modal-label">Jam</label><input id="hbgTime" class="portal-input" type="time" value="${escapeHtml(item ? item.jam : "")}" required></div>
      </div>
      <div class="form-grid-2">
        <div><label class="modal-label">Moda</label><select id="hbgMode" class="portal-select full"><option value="LURING" ${!item || item.moda === "LURING" ? "selected" : ""}>Luring</option><option value="DARING" ${item && item.moda === "DARING" ? "selected" : ""}>Daring</option><option value="HYBRID" ${item && item.moda === "HYBRID" ? "selected" : ""}>Hybrid</option></select></div>
        <div><label class="modal-label">Lokasi / Platform</label><input id="hbgLocation" class="portal-input" type="text" value="${escapeHtml(item ? item.lokasi : "")}" placeholder="SMP / Google Meet" required></div>
      </div>
      <label class="modal-label">Sekolah Pelaksana / Giliran</label><input id="hbgSchool" class="portal-input" type="text" value="${escapeHtml(item ? item.sekolahPelaksana : "")}" placeholder="Contoh: SMP Negeri 2 Kawali" required>
      <label class="modal-label">Narasumber / Guru Berbagi</label><input id="hbgSpeaker" class="portal-input" type="text" value="${escapeHtml(item ? item.narasumber : "")}" placeholder="Nama guru" required>
      <label class="modal-label">Judul Praktik Baik</label><input id="hbgPracticeTitle" class="portal-input" type="text" value="${escapeHtml(item ? item.judulPraktikBaik : "")}" placeholder="Judul praktik baik" required>
      <label class="modal-label">Ringkasan</label><textarea id="hbgSummary" class="portal-textarea" rows="3" placeholder="Ringkasan singkat praktik baik...">${escapeHtml(item ? item.ringkasan : "")}</textarea>
      <label class="modal-label">Link Materi (opsional)</label><input id="hbgMaterialLink" class="portal-input" type="url" value="${escapeHtml(item ? item.linkMateri : "")}" placeholder="https://drive.google.com/..."><div class="file-note">Gunakan link Viewer. File tetap berada di Drive pemilik.</div>
      <label class="modal-label">Link Video Praktik Baik (opsional)</label><input id="hbgVideoLink" class="portal-input" type="url" value="${escapeHtml(item ? item.linkVideo : "")}" placeholder="https://youtube.com/... atau link Drive">
      <button id="hbgSaveButton" class="primary-button" type="submit">${item ? "SIMPAN PERUBAHAN" : "TAMBAH KEGIATAN"}</button>
    </form>
  `);
}


function applyHbgAgendaSelection(agendaId) {
  if (!agendaId) return;
  const agenda = (compactUI.hbg.agendas || []).find(x => String(x.id) === String(agendaId));
  if (!agenda) return;
  const pairs = [
    ["hbgName", agenda.nama], ["hbgDate", agenda.tanggalInput], ["hbgTime", agenda.jam], ["hbgLocation", agenda.lokasi]
  ];
  pairs.forEach(pair => { const el = document.getElementById(pair[0]); if (el && pair[1]) el.value = pair[1]; });
  const mode = document.getElementById("hbgMode");
  if (mode && agenda.moda) {
    const v = String(agenda.moda).toUpperCase();
    if (["LURING", "DARING", "HYBRID"].includes(v)) mode.value = v;
  }
}


async function saveHbgProgram(event, id = "") {
  event.preventDefault();
  setButtonLoading("hbgSaveButton", true, "Menyimpan...");
  try {
    const res = await apiRequest("saveHbgProgram", {
      token: sessionToken,
      id: id,
      agendaId: valueOf("hbgAgendaId"),
      tahunAjaran: valueOf("hbgYearInput"),
      namaKegiatan: valueOf("hbgName"),
      tanggal: valueOf("hbgDate"),
      jam: valueOf("hbgTime"),
      moda: valueOf("hbgMode"),
      lokasi: valueOf("hbgLocation"),
      sekolahPelaksana: valueOf("hbgSchool"),
      narasumber: valueOf("hbgSpeaker"),
      judulPraktikBaik: valueOf("hbgPracticeTitle"),
      ringkasan: valueOf("hbgSummary"),
      linkMateri: valueOf("hbgMaterialLink"),
      linkVideo: valueOf("hbgVideoLink"),
      status: valueOf("hbgStatus")
    });
    if (!res.success) throw new Error(res.message || "Kegiatan belum dapat disimpan.");
    showToast(res.message);
    await openHbgCenter("MANAGE");
  } catch (err) {
    showToast(err.message);
  } finally {
    setButtonLoading("hbgSaveButton", false, id ? "SIMPAN PERUBAHAN" : "TAMBAH KEGIATAN");
  }
}


async function setHbgProgramStatus(id, status) {
  const label = hbgStatusLabel(status);
  if (!confirm(`Ubah status kegiatan menjadi ${label}?`)) return;
  try {
    const res = await apiRequest("setHbgProgramStatus", { token: sessionToken, id: id, status: status });
    showToast(res.message);
    if (res.success) await openHbgCenter("MANAGE");
  } catch (err) {
    showToast(err.message);
  }
}


async function openHbgParticipants(id) {
  showLoadingModal("Daftar Peserta");
  try {
    const res = await apiRequest("hbgParticipants", { token: sessionToken, id: id });
    if (!res.success) throw new Error(res.message || "Daftar peserta belum dapat dibuka.");
    compactUI.hbg.participants = res.participants || [];
    compactUI.hbg.participantProgram = res.program || null;
    compactUI.hbg.participantPage = 1;
    renderHbgParticipants();
    if (res.message) showToast(res.message);
  } catch (err) {
    showToast(err.message);
    renderHbgCenter();
  }
}


function renderHbgParticipants() {
  const items = compactUI.hbg.participants || [];
  const totalPages = Math.max(1, Math.ceil(items.length / COMPACT_PAGE_SIZE));
  compactUI.hbg.participantPage = Math.min(Math.max(1, compactUI.hbg.participantPage || 1), totalPages);
  const start = (compactUI.hbg.participantPage - 1) * COMPACT_PAGE_SIZE;
  const rows = items.slice(start, start + COMPACT_PAGE_SIZE);
  const html = rows.length ? rows.map((p, index) => `<div class="hbg-participant"><span>${start + index + 1}</span><div><strong>${escapeHtml(p.nama || "-")}</strong><small>${escapeHtml(p.sekolah || "-")}</small></div><b class="status-pill ${String(p.status).toUpperCase() === "HADIR" ? "approved" : "pending"}">${escapeHtml(p.status || "-")}</b></div>`).join("") : `<div class="empty-panel">Belum ada peserta tercatat pada absensi agenda ini.</div>`;
  const program = compactUI.hbg.participantProgram || {};

  setModalHtml(`
    <div class="modal-handle"></div><button class="modal-close" type="button" onclick="closeModal()">×</button>
    <div class="compact-detail-header"><button class="compact-back-button" type="button" onclick="openHbgDetail('${escapeJs(program.id || "")}')">←</button><div><h3>Daftar Peserta</h3><p class="modal-subtitle">${escapeHtml(program.judulPraktikBaik || program.namaKegiatan || "Hari Belajar Guru")} • ${items.length} tercatat</p></div></div>
    <div class="compact-list">${html}</div>
    ${compactPagerHtml(compactUI.hbg.participantPage, totalPages, "changeHbgParticipantPage")}
  `);
}

function changeHbgParticipantPage(page) { compactUI.hbg.participantPage = Number(page || 1); renderHbgParticipants(); }


/* =========================================================
   FEATURE ROUTER
========================================================= */

async function openFeature(name) {
  if (name === "Kehadiran Saya" || name === "Kehadiran") {
    if (currentUser && (currentUser.role === "Admin" || currentUser.role === "Pengurus")) {
      await openAttendanceManager();
    } else {
      await openMyAttendance();
    }
    return;
  }

  if (name === "Izin Tidak Hadir" || name === "Izin") {
    await openLeaveCenter();
    return;
  }

  if (name === "Admin Center") {
    await openAdminCenter();
    return;
  }

  if (name === "Agenda MGMP" || name === "Agenda") {
    if (currentUser && (currentUser.role === "Admin" || currentUser.role === "Pengurus")) {
      await openAgendaManager();
      return;
    }

    await openAgendaPublic();
    return;
  }

  if (name === "Pengumuman") {
    if (currentUser && (currentUser.role === "Admin" || currentUser.role === "Pengurus")) {
      await openAnnouncementManager();
    } else {
      await openAnnouncementPublic();
    }
    return;
  }

  if (name === "Hari Belajar Guru" || name === "Hari Belajar") {
    await openHbgCenter("NEXT");
    return;
  }

  if (name === "Bank Praktik Baik" || name === "Praktik Baik") {
    await openHbgCenter("PRACTICE");
    return;
  }

  if (name === "Bank Berbagi" || name === "Perangkat Pembelajaran" || name === "Perangkat") {
    await openLearningBank();
    return;
  }

  if (name === "Dokumen MGMP" || name === "Arsip Rapat & Materi") {
    await openMeetingArchive();
    return;
  }

  if (name === "Kas Saya") {
    await openKasSaya();
    return;
  }

  if (name === "Keuangan") {
    if (isFinanceManagerClient()) await openFinanceCenter();
    else await openPublicFinanceReport();
    return;
  }

  if (name === "Kartu Anggota Digital") {
    await openDigitalMemberCard();
    return;
  }

  document.getElementById("modalTitle").textContent = name;
  document.getElementById("featureModal").classList.remove("hidden");
}

function showAllMenu() {
  if (currentUser && (currentUser.role === "Admin" || currentUser.role === "Pengurus")) {
    openAdminCenter();
  } else {
    showToast("Gunakan menu utama pada dashboard.");
  }
}


/* =========================================================
   AGENDA / ANNOUNCEMENT
========================================================= */

function updateAgenda(agenda) {
  const card = document.querySelector(".agenda-card");
  if (!card) return;

  if (!agenda) {
    card.innerHTML = `<div class="empty-agenda">Belum ada agenda aktif.</div>`;
    return;
  }

  const parts = String(agenda.tanggal || "").split(" ");
  const tanggal = parts[0] || "-";
  const bulan = (parts[1] || "").substring(0, 3).toUpperCase();

  card.innerHTML = `
    <div class="agenda-date">
      <strong>${escapeHtml(tanggal)}</strong>
      <span>${escapeHtml(bulan)}</span>
    </div>

    <div class="agenda-info">
      <div class="agenda-badge">${escapeHtml(agenda.moda)}</div>
      <h4>${escapeHtml(agenda.nama)}</h4>
      <p>📍 ${escapeHtml(agenda.lokasi)}</p>
      <p>🕐 ${escapeHtml(agenda.jam)}</p>
    </div>

    <button class="agenda-arrow" type="button" onclick="openFeature('Agenda MGMP')">›</button>
  `;
}

function updateAnnouncements(list) {
  const card = document.querySelector(".announcement-card");
  if (!card) return;

  if (!list || list.length === 0) {
    card.innerHTML = `
      <div class="announcement-icon">📢</div>
      <div><h4>Belum ada pengumuman</h4><p>Informasi terbaru MGMP akan muncul di sini.</p></div>
    `;
    return;
  }

  const item = list[0];

  card.innerHTML = `
    <div class="announcement-icon">📢</div>
    <div>
      <div class="announcement-label">${escapeHtml(item.kategori || "UMUM")}</div>
      <h4>${escapeHtml(item.judul)}</h4>
      <p>${escapeHtml(item.isi)}</p>
    </div>
  `;
}


/* =========================================================
   NAV
========================================================= */

function setNav(element, name) {
  document.querySelectorAll(".nav-item").forEach(item => item.classList.remove("active"));
  element.classList.add("active");

  if (name === "Home") return;

  if (name === "Profil") {
    openMyProfile();
    return;
  }

  if (name === "Keuangan") {
    openFeature("Keuangan");
    return;
  }

  openFeature(name);
}


/* =========================================================
   MODAL
========================================================= */

function showLoadingModal(title) {
  setModalHtml(`
    <div class="modal-handle"></div>
    <button class="modal-close" type="button" onclick="closeModal()">×</button>
    <div class="modal-icon">⏳</div>
    <h3>${escapeHtml(title)}</h3>
    <p class="modal-subtitle">Memuat data...</p>
  `);
}

function setModalHtml(html) {
  const modal = document.querySelector("#featureModal .modal-card");
  if (modal) modal.innerHTML = html;
  document.getElementById("featureModal").classList.remove("hidden");
}

function closeModal() {
  if (typeof stopQrScanner === "function") stopQrScanner();
  document.getElementById("featureModal").classList.add("hidden");
}

function closeModalFromOverlay(event) {
  if (event.target.id === "featureModal") {
    closeModal();
  }
}


/* =========================================================
   LOGOUT
========================================================= */

async function logout() {
  try {
    if (sessionToken) {
      await apiRequest("logout", {
        token: sessionToken
      });
    }
  } catch (e) {
    console.warn(e);
  }

  forceLogout();
}

function forceLogout() {
  sessionToken = "";
  currentUser = null;
  portalWarmupStarted = false;

  localStorage.removeItem("kom3_token");
  localStorage.removeItem("kom3_user");
  resetResolvedProfilePhoto_();
  clearApiReadCache();

  const loginForm = document.getElementById("loginForm");
  if (loginForm) loginForm.reset();

  closeModal();
  showLogin();
}


/* =========================================================
   TOAST
========================================================= */

function showToast(message) {
  const toast = document.getElementById("toast");

  if (!toast) {
    alert(message);
    return;
  }

  toast.textContent = message;
  toast.classList.remove("hidden");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 3500);
}


/* =========================================================
   UI HELPERS
========================================================= */

function valueOf(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : "";
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || "";
}

function setButtonLoading(id, loading, text) {
  const btn = document.getElementById(id);
  if (!btn) return;

  btn.disabled = loading;
  btn.textContent = text;
}

function statusClass(status) {
  const value = String(status || "").toUpperCase();
  if (value === "ACTIVE") return "approved";
  if (value === "PENDING") return "pending";
  if (value === "REJECTED") return "rejected";
  return "neutral";
}

function leaveStatusClass(status) {
  const value = String(status || "").toUpperCase();
  if (value === "APPROVED") return "approved";
  if (value === "PENDING") return "pending";
  if (value === "REJECTED") return "rejected";
  return "neutral";
}

function leaveStatusLabel(status) {
  const value = String(status || "").toUpperCase();
  if (value === "APPROVED") return "DISETUJUI";
  if (value === "REJECTED") return "DITOLAK";
  if (value === "PENDING") return "MENUNGGU";
  return value || "-";
}

function attendanceStatusClass(status) {
  const value = String(status || "").toUpperCase();
  if (value === "HADIR") return "hadir";
  if (value === "IZIN") return "izin";
  if (value === "DINAS") return "dinas";
  return "neutral";
}

function statusIcon(status) {
  const value = String(status || "").toUpperCase();
  if (value === "HADIR") return "✓";
  if (value === "IZIN") return "🟡";
  if (value === "DINAS") return "🔵";
  return "•";
}

function escapeHtml(text) {
  return String(text == null ? "" : text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeJs(text) {
  return String(text == null ? "" : text)
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "\\'")
    .replaceAll("\n", " ")
    .replaceAll("\r", " ");
}


/* =========================================================
   START APP
========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  if (sessionToken) {
    try {
      const stored = localStorage.getItem("kom3_user");

      if (stored) {
        try {
          currentUser = JSON.parse(stored);
        } catch (e) {
          currentUser = null;
        }
      }

      await loadDashboard();

      if (currentUser) {
        showDashboard();
        setupRoleInterface();
        return;
      }
    } catch (e) {
      console.error(e);
      forceLogout();
      return;
    }
  }

  showLogin();
});
