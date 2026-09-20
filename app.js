/* =========================================================
   PORTAL KOM 3 - FRONTEND V1.2.5
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
  portalSettings: null
};


/* =========================================================
   API
========================================================= */

async function apiRequest(action, payload = {}) {
  if (!APP_CONFIG.apiUrl || APP_CONFIG.apiUrl.includes("PASTE_URL_APPS_SCRIPT")) {
    throw new Error("URL Apps Script belum dimasukkan pada app.js.");
  }

  const response = await fetch(APP_CONFIG.apiUrl, {
    method: "POST",
    redirect: "follow",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action,
      ...payload
    })
  });

  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("Server response:", text);
    throw new Error("Server tidak memberikan response yang valid.");
  }
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
  const input = document.getElementById("loginPassword");
  input.type = input.type === "password" ? "text" : "password";
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
      password
    });

    showToast(res.message || "Pendaftaran selesai.");

    if (res.success) {
      document.getElementById("registerForm").reset();
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
}

function updateProfileDisplay(user) {
  setText("dashboardName", user.nama);

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

  try {
    const res = await apiRequest("prayerTimes", { token: sessionToken });
    if (!res.success || !res.enabled) {
      section.classList.add("hidden");
      return;
    }

    prayerWidgetData = res;
    section.classList.remove("hidden");
    setText("prayerNextName", (res.next && res.next.name ? res.next.name : "Salat") + (res.next && res.next.tomorrow ? " besok" : ""));
    setText("prayerNextTime", res.next && res.next.time ? res.next.time + " WIB" : "-");
    setText("prayerLocation", shortPrayerLocation(res.location));
  } catch (err) {
    section.classList.add("hidden");
  }
}

function shortPrayerLocation(text) {
  const parts = String(text || "Kawali, Ciamis").split(",").map(x => x.trim()).filter(Boolean);
  return parts.slice(0,2).join(", ") || "Kawali, Ciamis";
}

async function openPrayerTimes() {
  if (!prayerWidgetData) {
    showLoadingModal("Jadwal Salat");
    const res = await apiRequest("prayerTimes", { token: sessionToken });
    if (!res.success || !res.enabled) { showToast(res.message || "Jadwal salat belum tersedia."); closeModal(); return; }
    prayerWidgetData = res;
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

  if (name === "Dokumen MGMP" || name === "Arsip Rapat & Materi") {
    await openMeetingArchive();
    return;
  }

  if (name === "Kas Saya" || name === "Keuangan") {
    await openKasSaya();
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
    showToast(
      currentUser.nama +
        " • " +
        currentUser.role +
        (currentUser.jabatan ? " • " + currentUser.jabatan : "")
    );
    return;
  }

  if (name === "Keuangan") {
    openFeature("Kas Saya");
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

  localStorage.removeItem("kom3_token");
  localStorage.removeItem("kom3_user");

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
