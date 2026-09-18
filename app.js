/* =========================================================
   PORTAL KOM 3 - FRONTEND V1.2
========================================================= */

const APP_CONFIG = {
  apiUrl:
    "https://script.google.com/macros/s/AKfycbzAZZn-ZT12OhGoAkULfvS_gtP29fUSvrrEME6xNJXaY2Wn9UFtBQLwOLC6pw1cusHLug/exec",

  maxProofBytes:
    2 * 1024 * 1024
};


let currentUser = null;

let sessionToken =
  localStorage.getItem(
    "kom3_token"
  ) || "";

let toastTimer = null;


/* =========================================================
   API
========================================================= */

async function apiRequest(
  action,
  payload = {}
) {

  if (
    !APP_CONFIG.apiUrl
    ||
    APP_CONFIG.apiUrl.includes(
      "PASTE_URL_APPS_SCRIPT"
    )
  ) {

    throw new Error(
      "URL Apps Script belum dimasukkan pada app.js."
    );
  }


  const response =
    await fetch(
      APP_CONFIG.apiUrl,
      {
        method:
          "POST",

        redirect:
          "follow",

        headers: {
          "Content-Type":
            "text/plain;charset=utf-8"
        },

        body:
          JSON.stringify({
            action,
            ...payload
          })
      }
    );


  const text =
    await response.text();


  try {

    return JSON.parse(
      text
    );

  } catch (e) {

    console.error(
      "Server response:",
      text
    );

    throw new Error(
      "Server tidak memberikan response yang valid."
    );
  }
}


/* =========================================================
   PAGE
========================================================= */

function hideAllPages() {

  [
    "loginPage",
    "registerPage",
    "dashboardPage"
  ]
  .forEach(
    id => {

      const el =
        document.getElementById(
          id
        );


      if (el) {

        el.classList.add(
          "hidden"
        );
      }
    }
  );
}


function showLogin() {

  hideAllPages();

  document
    .getElementById(
      "loginPage"
    )
    .classList
    .remove(
      "hidden"
    );

  window.scrollTo(
    0,
    0
  );
}


function showRegister() {

  hideAllPages();

  document
    .getElementById(
      "registerPage"
    )
    .classList
    .remove(
      "hidden"
    );

  window.scrollTo(
    0,
    0
  );
}


function showDashboard() {

  hideAllPages();

  document
    .getElementById(
      "dashboardPage"
    )
    .classList
    .remove(
      "hidden"
    );

  window.scrollTo(
    0,
    0
  );
}


/* =========================================================
   PASSWORD
========================================================= */

function togglePassword() {

  const input =
    document.getElementById(
      "loginPassword"
    );


  input.type =
    input.type === "password"
      ? "text"
      : "password";
}


/* =========================================================
   LOGIN
========================================================= */

async function handleLogin(
  event
) {

  event.preventDefault();


  const user =
    valueOf(
      "loginUser"
    );


  const password =
    document
      .getElementById(
        "loginPassword"
      )
      .value;


  if (
    !user ||
    !password
  ) {

    showToast(
      "Isi username/email dan password."
    );

    return;
  }


  setButtonLoading(
    "loginSubmitButton",
    true,
    "Memeriksa..."
  );


  try {

    const res =
      await apiRequest(
        "login",
        {
          user,
          password
        }
      );


    if (
      !res.success
    ) {

      showToast(
        res.message ||
        "Login gagal."
      );

      return;
    }


    sessionToken =
      res.token;


    currentUser =
      res.user;


    localStorage.setItem(
      "kom3_token",
      sessionToken
    );


    localStorage.setItem(
      "kom3_user",
      JSON.stringify(
        currentUser
      )
    );


    await loadDashboard();

    showDashboard();

    setupRoleInterface();


    showToast(
      "Selamat datang, " +
      currentUser.nama +
      "."
    );

  } catch (err) {

    showToast(
      err.message
    );

  } finally {

    setButtonLoading(
      "loginSubmitButton",
      false,
      "MASUK →"
    );
  }
}


/* =========================================================
   REGISTER
========================================================= */

async function handleRegister(
  event
) {

  event.preventDefault();


  const nama =
    valueOf(
      "regName"
    );

  const nip =
    valueOf(
      "regNip"
    );

  const sekolah =
    valueOf(
      "regSchool"
    );

  const email =
    valueOf(
      "regEmail"
    );

  const wa =
    valueOf(
      "regWa"
    );

  const username =
    valueOf(
      "regUsername"
    );


  const password =
    document
      .getElementById(
        "regPassword"
      )
      .value;


  const password2 =
    document
      .getElementById(
        "regPassword2"
      )
      .value;


  if (
    !nama ||
    !sekolah ||
    !email ||
    !username ||
    !password
  ) {

    showToast(
      "Lengkapi data wajib."
    );

    return;
  }


  if (
    password.length < 6
  ) {

    showToast(
      "Password minimal 6 karakter."
    );

    return;
  }


  if (
    password !==
    password2
  ) {

    showToast(
      "Konfirmasi password tidak sama."
    );

    return;
  }


  setButtonLoading(
    "registerSubmitButton",
    true,
    "Mengirim..."
  );


  try {

    const res =
      await apiRequest(
        "register",
        {
          nama,
          nip,
          sekolah,
          email,
          wa,
          username,
          password
        }
      );


    showToast(
      res.message ||
      "Pendaftaran selesai."
    );


    if (
      res.success
    ) {

      document
        .getElementById(
          "registerForm"
        )
        .reset();


      setTimeout(
        showLogin,
        1000
      );
    }

  } catch (err) {

    showToast(
      err.message
    );

  } finally {

    setButtonLoading(
      "registerSubmitButton",
      false,
      "DAFTAR SEKARANG"
    );
  }
}


/* =========================================================
   DASHBOARD
========================================================= */

async function loadDashboard() {

  if (
    !sessionToken
  ) {

    return;
  }


  const res =
    await apiRequest(
      "dashboard",
      {
        token:
          sessionToken
      }
    );


  if (
    !res.success
  ) {

    if (
      res.sessionExpired
    ) {

      forceLogout();
    }

    return;
  }


  currentUser =
    res.user;


  localStorage.setItem(
    "kom3_user",
    JSON.stringify(
      currentUser
    )
  );


  updateProfileDisplay(
    res.user
  );

  updateStats(
    res.stats || {}
  );

  updateAgenda(
    res.agenda
  );

  updateAnnouncements(
    res.pengumuman || []
  );
}


function updateProfileDisplay(
  user
) {

  setText(
    "dashboardName",
    user.nama
  );


  const schoolText =
    user.role === "Pengurus"
    &&
    user.jabatan
    &&
    user.jabatan !== "Pengurus"

      ? user.sekolah +
        " • " +
        user.jabatan

      : user.sekolah;


  setText(
    "dashboardSchool",
    schoolText
  );


  setText(
    "dashboardRole",
    String(
      user.role ||
      "Anggota"
    )
    .toUpperCase()
  );


  const member =
    document.querySelector(
      ".member-id strong"
    );


  if (member) {

    member.textContent =
      user.id ||
      "-";
  }


  const adminButton =
    document.getElementById(
      "adminCenterButton"
    );


  if (adminButton) {

    adminButton.classList.toggle(
      "hidden",
      !(
        user.role === "Admin"
        ||
        user.role === "Pengurus"
      )
    );
  }
}


function updateStats(
  stats
) {

  const point =
    document.querySelector(
      ".points-value strong"
    );


  if (point) {

    point.textContent =
      stats.points || 0;
  }


  const values =
    document.querySelectorAll(
      ".mini-stat strong"
    );


  if (
    values[0]
  ) {

    values[0].textContent =
      stats.attendance ||
      "0 / 0";
  }


  if (
    values[1]
  ) {

    values[1].textContent =
      stats.certificates ||
      0;
  }


  if (
    values[2]
  ) {

    values[2].textContent =
      (
        stats.streak ||
        0
      )
      + "x";
  }


  if (
    values[3]
  ) {

    values[3].textContent =
      stats.kas ||
      "Belum ada";
  }


  const izinBadge =
    document.getElementById(
      "izinPendingBadge"
    );


  if (
    izinBadge
  ) {

    const count =
      Number(
        stats.pendingLeave ||
        0
      );


    izinBadge.textContent =
      count;


    izinBadge.classList.toggle(
      "hidden",
      count < 1
    );
  }
}


/* =========================================================
   ROLE INTERFACE
========================================================= */

function setupRoleInterface() {

  const adminButton =
    document.getElementById(
      "adminCenterButton"
    );


  if (
    adminButton
  ) {

    adminButton.classList.toggle(
      "hidden",
      !(
        currentUser
        &&
        (
          currentUser.role === "Admin"
          ||
          currentUser.role === "Pengurus"
        )
      )
    );
  }
}


/* =========================================================
   ADMIN CENTER
========================================================= */

async function openAdminCenter() {

  if (
    !currentUser
    ||
    (
      currentUser.role !== "Admin"
      &&
      currentUser.role !== "Pengurus"
    )
  ) {

    showToast(
      "Menu ini khusus Admin/Pengurus."
    );

    return;
  }


  showLoadingModal(
    "Admin Center"
  );


  try {

    const res =
      await apiRequest(
        "adminSummary",
        {
          token:
            sessionToken
        }
      );


    if (
      !res.success
    ) {

      showToast(
        res.message
      );

      closeModal();

      return;
    }


    const s =
      res.summary || {};


    setModalHtml(`

      <div class="modal-handle"></div>

      <button
        class="modal-close"
        type="button"
        onclick="closeModal()"
      >
        ×
      </button>


      <div class="modal-title-row">

        <div class="modal-icon compact">
          ⚙️
        </div>

        <div>

          <h3>
            Admin Center
          </h3>

          <p class="modal-subtitle">
            Kelola anggota, kehadiran, dan izin.
          </p>

        </div>

      </div>


      <div class="admin-stat-grid">

        ${adminStatCard(
          "Anggota Aktif",
          s.activeUsers || 0,
          "👥"
        )}

        ${adminStatCard(
          "Menunggu Aktivasi",
          s.pendingUsers || 0,
          "⏳"
        )}

        ${adminStatCard(
          "Pengurus",
          s.pengurus || 0,
          "🛡️"
        )}

        ${adminStatCard(
          "Izin Menunggu",
          s.pendingLeaves || 0,
          "📝"
        )}

      </div>


      <div class="admin-menu-list">

        <button
          type="button"
          class="admin-action"
          onclick="openUserCenter()"
        >

          <span class="admin-action-icon">
            👥
          </span>

          <span>

            <b>
              Manajemen Anggota
            </b>

            <small>
              Aktivasi akun, role, dan jabatan
            </small>

          </span>

          <span>
            ›
          </span>

        </button>


        <button
          type="button"
          class="admin-action"
          onclick="openAttendanceManager()"
        >

          <span class="admin-action-icon">
            ✅
          </span>

          <span>

            <b>
              Absensi Pertemuan
            </b>

            <small>
              Catat kehadiran anggota
            </small>

          </span>

          <span>
            ›
          </span>

        </button>


        <button
          type="button"
          class="admin-action"
          onclick="openLeaveReview()"
        >

          <span class="admin-action-icon">
            📝
          </span>

          <span>

            <b>
              Verifikasi Izin
            </b>

            <small>
              ${
                escapeHtml(
                  String(
                    s.pendingLeaves || 0
                  )
                )
              }
              pengajuan menunggu
            </small>

          </span>

          <span>
            ›
          </span>

        </button>


        <button
          type="button"
          class="admin-action"
          onclick="openFeature('Agenda MGMP')"
        >

          <span class="admin-action-icon">
            📅
          </span>

          <span>

            <b>
              Agenda MGMP
            </b>

            <small>
              Agenda aktif:
              ${
                escapeHtml(
                  s.activeAgenda
                    ? s.activeAgenda.nama
                    : "Belum ada"
                )
              }
            </small>

          </span>

          <span>
            ›
          </span>

        </button>


        <button
          type="button"
          class="admin-action"
          onclick="openFeature('Pengumuman')"
        >

          <span class="admin-action-icon">
            📢
          </span>

          <span>

            <b>
              Pengumuman
            </b>

            <small>
              Informasi resmi Portal KOM 3
            </small>

          </span>

          <span>
            ›
          </span>

        </button>

      </div>


      <button
        class="secondary-button"
        type="button"
        onclick="closeModal()"
      >
        Tutup
      </button>

    `);

  } catch (err) {

    showToast(
      err.message
    );

    closeModal();
  }
}


function adminStatCard(
  label,
  value,
  icon
) {

  return `

    <div class="admin-stat-card">

      <span>
        ${icon}
      </span>

      <small>
        ${escapeHtml(label)}
      </small>

      <strong>
        ${escapeHtml(
          String(value)
        )}
      </strong>

    </div>

  `;
}


/* =========================================================
   USER CENTER
========================================================= */

async function openUserCenter() {

  showLoadingModal(
    "Manajemen Anggota"
  );


  try {

    const res =
      await apiRequest(
        "listUsers",
        {
          token:
            sessionToken
        }
      );


    if (
      !res.success
    ) {

      showToast(
        res.message
      );

      closeModal();

      return;
    }


    const pendingUsers =
      res.users.filter(
        u =>
          String(
            u.status
          )
          .toUpperCase()
          === "PENDING"
      );


    const activeUsers =
      res.users.filter(
        u =>
          String(
            u.status
          )
          .toUpperCase()
          === "ACTIVE"
      );


    let html = `

      <div class="modal-handle"></div>

      <button
        class="modal-close"
        type="button"
        onclick="closeModal()"
      >
        ×
      </button>


      <h3>
        Manajemen Anggota
      </h3>


      <p class="modal-subtitle">
        Aktifkan anggota baru dan kelola kepengurusan.
      </p>


      <div class="section-mini-title">
        Menunggu Aktivasi
        (${pendingUsers.length})
      </div>

    `;


    if (
      !pendingUsers.length
    ) {

      html += `

        <div class="empty-panel">
          Tidak ada akun menunggu aktivasi.
        </div>

      `;
    }


    pendingUsers.forEach(
      user => {

        html +=
          userCardHtml(
            user,
            true
          );
      }
    );


    html += `

      <div class="section-mini-title top-gap">
        Anggota Aktif
        (${activeUsers.length})
      </div>

    `;


    activeUsers.forEach(
      user => {

        html +=
          userCardHtml(
            user,
            false
          );
      }
    );


    html += `

      <button
        class="secondary-button"
        type="button"
        onclick="openAdminCenter()"
      >
        ← Kembali ke Admin Center
      </button>

    `;


    setModalHtml(
      html
    );

  } catch (err) {

    showToast(
      err.message
    );

    closeModal();
  }
}


function userCardHtml(
  user,
  pending
) {

  let controls = "";


  if (
    pending
  ) {

    controls += `

      <button
        type="button"
        class="primary-button small-action"
        onclick="approveMember('${escapeJs(user.id)}')"
      >
        ✓ Aktifkan Anggota
      </button>

    `;
  }


  if (
    currentUser
    &&
    currentUser.role === "Admin"
    &&
    user.id !== currentUser.id
  ) {

    controls += `

      <div class="two-col-inputs">

        <select
          id="role-${escapeHtml(user.id)}"
          class="portal-select"
        >

          <option
            value="Anggota"
            ${
              user.role === "Anggota"
                ? "selected"
                : ""
            }
          >
            Anggota
          </option>

          <option
            value="Pengurus"
            ${
              user.role === "Pengurus"
                ? "selected"
                : ""
            }
          >
            Pengurus
          </option>

        </select>


        <select
          id="jabatan-${escapeHtml(user.id)}"
          class="portal-select"
        >

          ${
            jabatanOptions(
              user.jabatan
            )
          }

        </select>

      </div>


      <button
        type="button"
        class="outline-button"
        onclick="saveUserRole('${escapeJs(user.id)}')"
      >
        Simpan Role & Jabatan
      </button>

    `;
  }


  return `

    <div class="management-card">

      <div class="management-card-head">

        <div>

          <strong>
            ${escapeHtml(user.nama)}
          </strong>

          <small>
            ${escapeHtml(user.sekolah || "-")}
          </small>

          <small>
            ${escapeHtml(user.id)}
          </small>

        </div>


        <span
          class="
            status-pill
            ${statusClass(user.status)}
          "
        >
          ${escapeHtml(user.status)}
        </span>

      </div>


      <div class="user-role-line">

        ${escapeHtml(user.role)}
        •
        ${escapeHtml(user.jabatan || "Anggota")}

      </div>


      ${controls}

    </div>

  `;
}


function jabatanOptions(
  selected
) {

  const list = [
    "Anggota",
    "Ketua",
    "Sekretaris",
    "Bendahara",
    "Bidang"
  ];


  return list
    .map(
      x => `

        <option
          value="${x}"
          ${
            x === selected
              ? "selected"
              : ""
          }
        >
          ${x}
        </option>

      `
    )
    .join("");
}


async function approveMember(
  id
) {

  try {

    const res =
      await apiRequest(
        "approveUser",
        {
          token:
            sessionToken,

          userId:
            id
        }
      );


    showToast(
      res.message
    );


    if (
      res.success
    ) {

      await openUserCenter();
    }

  } catch (err) {

    showToast(
      err.message
    );
  }
}


async function saveUserRole(
  userId
) {

  const roleEl =
    document.getElementById(
      "role-" +
      userId
    );


  const jabatanEl =
    document.getElementById(
      "jabatan-" +
      userId
    );


  if (
    !roleEl ||
    !jabatanEl
  ) {

    return;
  }


  try {

    const res =
      await apiRequest(
        "updateUserAccess",
        {
          token:
            sessionToken,

          userId,

          role:
            roleEl.value,

          jabatan:
            jabatanEl.value
        }
      );


    showToast(
      res.message
    );


    if (
      res.success
    ) {

      await openUserCenter();
    }

  } catch (err) {

    showToast(
      err.message
    );
  }
}


/* =========================================================
   ABSENSI
========================================================= */

async function openAttendanceManager() {

  showLoadingModal(
    "Absensi Pertemuan"
  );


  try {

    const res =
      await apiRequest(
        "attendanceManager",
        {
          token:
            sessionToken
        }
      );


    if (
      !res.success
    ) {

      showToast(
        res.message
      );

      closeModal();

      return;
    }


    let html = `

      <div class="modal-handle"></div>

      <button
        class="modal-close"
        type="button"
        onclick="closeModal()"
      >
        ×
      </button>


      <h3>
        Absensi Pertemuan
      </h3>


      <p class="modal-subtitle">

        <b>
          ${escapeHtml(res.agenda.nama)}
        </b>

        <br>

        ${escapeHtml(res.agenda.tanggal)}
        •
        ${escapeHtml(res.agenda.jam)}

      </p>


      <div class="list-scroll">

    `;


    res.users.forEach(
      user => {

        const status =
          String(
            user.statusAbsen || ""
          )
          .toUpperCase();


        let actionHtml = `

          <button
            type="button"
            class="attendance-button"
            onclick="markPresent('${escapeJs(user.id)}')"
          >
            HADIR
          </button>

        `;


        if (
          status
        ) {

          actionHtml = `

            <span
              class="
                attendance-status
                ${attendanceStatusClass(status)}
              "
            >
              ${statusIcon(status)}
              ${escapeHtml(status)}
            </span>

          `;
        }


        html += `

          <div class="attendance-row">

            <div>

              <strong>
                ${escapeHtml(user.nama)}
              </strong>

              <small>
                ${escapeHtml(user.sekolah)}
              </small>

            </div>


            ${actionHtml}

          </div>

        `;
      }
    );


    html += `

      </div>


      <button
        class="secondary-button"
        type="button"
        onclick="openAdminCenter()"
      >
        ← Kembali ke Admin Center
      </button>

    `;


    setModalHtml(
      html
    );

  } catch (err) {

    showToast(
      err.message
    );

    closeModal();
  }
}


async function markPresent(
  userId
) {

  showToast(
    "Menyimpan kehadiran..."
  );


  try {

    const res =
      await apiRequest(
        "markAttendance",
        {
          token:
            sessionToken,

          userId
        }
      );


    showToast(
      res.message
    );


    if (
      res.success
    ) {

      await openAttendanceManager();

      await loadDashboard();
    }

  } catch (err) {

    showToast(
      err.message
    );
  }
}


async function openMyAttendance() {

  showLoadingModal(
    "Kehadiran Saya"
  );


  try {

    const res =
      await apiRequest(
        "myAttendance",
        {
          token:
            sessionToken
        }
      );


    if (
      !res.success
    ) {

      showToast(
        res.message
      );

      closeModal();

      return;
    }


    let html = `

      <div class="modal-handle"></div>

      <button
        class="modal-close"
        type="button"
        onclick="closeModal()"
      >
        ×
      </button>


      <h3>
        Kehadiran Saya
      </h3>


      <p class="modal-subtitle">
        Riwayat kehadiran dan status izin/dinas.
      </p>

    `;


    if (
      !res.history.length
    ) {

      html += `

        <div class="empty-panel">
          Belum ada riwayat kehadiran.
        </div>

      `;
    }


    res.history.forEach(
      item => {

        const status =
          String(
            item.status || ""
          )
          .toUpperCase();


        html += `

          <div class="history-card">

            <div class="history-topline">

              <strong>
                ${escapeHtml(item.agenda)}
              </strong>


              <span
                class="
                  attendance-status
                  ${attendanceStatusClass(status)}
                "
              >
                ${statusIcon(status)}
                ${escapeHtml(status)}
              </span>

            </div>


            <small>
              ${escapeHtml(item.tanggal)}
              •
              ${escapeHtml(item.jam)}
            </small>

          </div>

        `;
      }
    );


    html += `

      <button
        class="secondary-button"
        type="button"
        onclick="closeModal()"
      >
        Tutup
      </button>

    `;


    setModalHtml(
      html
    );

  } catch (err) {

    showToast(
      err.message
    );

    closeModal();
  }
}


/* =========================================================
   IZIN TIDAK HADIR
========================================================= */

async function openLeaveCenter() {

  showLoadingModal(
    "Izin Tidak Hadir"
  );


  try {

    const [
      agendaRes,
      leaveRes
    ] =
      await Promise.all([
        apiRequest(
          "agendaOptions",
          {
            token:
              sessionToken
          }
        ),

        apiRequest(
          "myLeaves",
          {
            token:
              sessionToken
          }
        )
      ]);


    if (
      !agendaRes.success
    ) {

      showToast(
        agendaRes.message
      );

      closeModal();

      return;
    }


    const agendas =
      agendaRes.agendas ||
      [];


    const history =
      leaveRes.success
        ? leaveRes.history || []
        : [];


    let agendaOptions = `

      <option value="">
        Pilih kegiatan...
      </option>

    `;


    agendas.forEach(
      item => {

        agendaOptions += `

          <option
            value="${escapeHtml(item.id)}"
          >
            ${escapeHtml(item.tanggal)}
            —
            ${escapeHtml(item.nama)}
          </option>

        `;
      }
    );


    let historyHtml = "";


    if (
      !history.length
    ) {

      historyHtml = `

        <div class="empty-panel">
          Belum ada riwayat izin.
        </div>

      `;

    } else {

      history
        .slice(
          0,
          8
        )
        .forEach(
          item => {

            historyHtml += `

              <div class="history-card">

                <div class="history-topline">

                  <strong>
                    ${escapeHtml(item.agenda)}
                  </strong>


                  <span
                    class="
                      status-pill
                      ${leaveStatusClass(item.status)}
                    "
                  >
                    ${leaveStatusLabel(item.status)}
                  </span>

                </div>


                <small>
                  ${escapeHtml(item.jenisIzin)}
                  •
                  ${escapeHtml(item.tanggalKirim)}
                </small>


                <p>
                  ${escapeHtml(item.keterangan)}
                </p>


                ${
                  item.catatan
                    ? `
                      <small>
                        Catatan:
                        ${escapeHtml(item.catatan)}
                      </small>
                    `
                    : ""
                }

              </div>

            `;
          }
        );
    }


    setModalHtml(`

      <div class="modal-handle"></div>


      <button
        class="modal-close"
        type="button"
        onclick="closeModal()"
      >
        ×
      </button>


      <h3>
        Izin Tidak Hadir
      </h3>


      <p class="modal-subtitle">
        Kirim izin dan pantau status verifikasinya.
      </p>


      <form
        id="leaveForm"
        onsubmit="submitLeaveFromModal(event)"
      >

        <label class="modal-label">
          Kegiatan
        </label>


        <select
          id="leaveAgenda"
          class="portal-select full"
          required
        >
          ${agendaOptions}
        </select>


        <label class="modal-label">
          Jenis Izin
        </label>


        <select
          id="leaveType"
          class="portal-select full"
          required
        >

          <option value="SAKIT">
            Sakit
          </option>

          <option value="DINAS">
            Dinas
          </option>

          <option value="KELUARGA">
            Kepentingan Keluarga
          </option>

          <option value="LAINNYA">
            Lainnya
          </option>

        </select>


        <label class="modal-label">
          Keterangan
        </label>


        <textarea
          id="leaveDescription"
          class="portal-textarea"
          rows="3"
          placeholder="Tuliskan alasan singkat..."
          required
        ></textarea>


        <label class="modal-label">

          Bukti Foto / Surat

          <span class="optional-text">
            opsional, maks. 2 MB
          </span>

        </label>


        <input
          id="leaveFile"
          class="portal-file"
          type="file"
          accept="
            image/jpeg,
            image/png,
            image/webp,
            application/pdf
          "
        >


        <div class="file-note">
          Format:
          JPG, PNG, WEBP, atau PDF.
        </div>


        <button
          id="leaveSubmitButton"
          type="submit"
          class="primary-button"
        >
          KIRIM IZIN
        </button>

      </form>


      <div class="section-mini-title top-gap">
        Riwayat Izin
      </div>


      ${historyHtml}


      <button
        class="secondary-button"
        type="button"
        onclick="closeModal()"
      >
        Tutup
      </button>

    `);

  } catch (err) {

    showToast(
      err.message
    );

    closeModal();
  }
}


async function submitLeaveFromModal(
  event
) {

  event.preventDefault();


  const agendaId =
    document
      .getElementById(
        "leaveAgenda"
      )
      .value;


  const jenisIzin =
    document
      .getElementById(
        "leaveType"
      )
      .value;


  const keterangan =
    document
      .getElementById(
        "leaveDescription"
      )
      .value
      .trim();


  const fileInput =
    document.getElementById(
      "leaveFile"
    );


  if (
    !agendaId
    ||
    !jenisIzin
    ||
    !keterangan
  ) {

    showToast(
      "Lengkapi data izin."
    );

    return;
  }


  let filePayload = null;


  if (
    fileInput
    &&
    fileInput.files
    &&
    fileInput.files[0]
  ) {

    const file =
      fileInput.files[0];


    if (
      file.size >
      APP_CONFIG.maxProofBytes
    ) {

      showToast(
        "Ukuran bukti maksimal 2 MB."
      );

      return;
    }


    try {

      filePayload =
        await fileToPayload(
          file
        );

    } catch (err) {

      showToast(
        "Bukti gagal dibaca."
      );

      return;
    }
  }


  setButtonLoading(
    "leaveSubmitButton",
    true,
    "Mengirim..."
  );


  try {

    const res =
      await apiRequest(
        "submitLeave",
        {
          token:
            sessionToken,

          agendaId,

          jenisIzin,

          keterangan,

          file:
            filePayload
        }
      );


    showToast(
      res.message
    );


    if (
      res.success
    ) {

      await loadDashboard();

      await openLeaveCenter();
    }

  } catch (err) {

    showToast(
      err.message
    );

  } finally {

    setButtonLoading(
      "leaveSubmitButton",
      false,
      "KIRIM IZIN"
    );
  }
}


function fileToPayload(
  file
) {

  return new Promise(
    (
      resolve,
      reject
    ) => {

      const reader =
        new FileReader();


      reader.onload =
        () => {

          const result =
            String(
              reader.result || ""
            );


          const commaIndex =
            result.indexOf(
              ","
            );


          if (
            commaIndex < 0
          ) {

            reject(
              new Error(
                "Format file tidak valid."
              )
            );

            return;
          }


          resolve({

            name:
              file.name,

            mimeType:
              file.type,

            base64:
              result.substring(
                commaIndex + 1
              )
          });
        };


      reader.onerror =
        () =>
          reject(
            reader.error
            ||
            new Error(
              "File gagal dibaca."
            )
          );


      reader.readAsDataURL(
        file
      );
    }
  );
}


/* =========================================================
   VERIFIKASI IZIN
========================================================= */

async function openLeaveReview() {

  showLoadingModal(
    "Verifikasi Izin"
  );


  try {

    const res =
      await apiRequest(
        "pendingLeaves",
        {
          token:
            sessionToken
        }
      );


    if (
      !res.success
    ) {

      showToast(
        res.message
      );

      closeModal();

      return;
    }


    let html = `

      <div class="modal-handle"></div>

      <button
        class="modal-close"
        type="button"
        onclick="closeModal()"
      >
        ×
      </button>


      <h3>
        Verifikasi Izin
      </h3>


      <p class="modal-subtitle">
        Periksa pengajuan izin anggota.
      </p>

    `;


    if (
      !res.leaves.length
    ) {

      html += `

        <div class="empty-panel">
          Tidak ada izin menunggu verifikasi.
        </div>

      `;
    }


    res.leaves.forEach(
      item => {

        html += `

          <div class="management-card">

            <div class="management-card-head">

              <div>

                <strong>
                  ${escapeHtml(item.nama)}
                </strong>

                <small>
                  ${escapeHtml(item.sekolah)}
                </small>

              </div>


              <span class="status-pill pending">
                PENDING
              </span>

            </div>


            <div class="leave-detail">

              <b>
                ${escapeHtml(item.agenda)}
              </b>

              <span>
                ${escapeHtml(item.jenisIzin)}
                •
                ${escapeHtml(item.tanggalKirim)}
              </span>

              <p>
                ${escapeHtml(item.keterangan)}
              </p>

            </div>


            ${
              item.hasBukti

              ? `

                <button
                  type="button"
                  class="proof-link proof-button"
                  onclick="openLeaveProof('${escapeJs(item.id)}')"
                >
                  📎 Lihat Bukti
                </button>

              `

              : `

                <div class="file-note">
                  Tidak ada bukti yang diunggah.
                </div>

              `
            }


            <textarea
              id="review-note-${escapeHtml(item.id)}"
              class="portal-textarea"
              rows="2"
              placeholder="Catatan verifikasi (opsional)"
            ></textarea>


            <div class="review-buttons">

              <button
                type="button"
                class="approve-button"
                onclick="reviewLeave('${escapeJs(item.id)}','APPROVE')"
              >
                ✓ Setujui
              </button>


              <button
                type="button"
                class="reject-button"
                onclick="reviewLeave('${escapeJs(item.id)}','REJECT')"
              >
                ✕ Tolak
              </button>

            </div>

          </div>

        `;
      }
    );


    html += `

      <button
        class="secondary-button"
        type="button"
        onclick="openAdminCenter()"
      >
        ← Kembali ke Admin Center
      </button>

    `;


    setModalHtml(
      html
    );

  } catch (err) {

    showToast(
      err.message
    );

    closeModal();
  }
}


async function openLeaveProof(
  izinId
) {

  const previewWindow =
    window.open(
      "",
      "_blank"
    );


  if (
    previewWindow
  ) {

    previewWindow.document.write(
      "<p style='font-family:Arial;padding:20px'>Memuat bukti izin...</p>"
    );
  }


  try {

    const res =
      await apiRequest(
        "getLeaveProof",
        {
          token:
            sessionToken,

          izinId
        }
      );


    if (
      !res.success
      ||
      !res.file
    ) {

      if (
        previewWindow
      ) {

        previewWindow.close();
      }


      showToast(
        res.message ||
        "Bukti tidak tersedia."
      );

      return;
    }


    const blob =
      base64ToBlob(
        res.file.base64,
        res.file.mimeType
      );


    const objectUrl =
      URL.createObjectURL(
        blob
      );


    if (
      previewWindow
    ) {

      previewWindow.location.href =
        objectUrl;

    } else {

      window.location.href =
        objectUrl;
    }


    setTimeout(
      () =>
        URL.revokeObjectURL(
          objectUrl
        ),
      60000
    );

  } catch (err) {

    if (
      previewWindow
    ) {

      previewWindow.close();
    }


    showToast(
      err.message
    );
  }
}


function base64ToBlob(
  base64,
  mimeType
) {

  const binary =
    atob(
      base64
    );


  const bytes =
    new Uint8Array(
      binary.length
    );


  for (
    let i = 0;
    i < binary.length;
    i++
  ) {

    bytes[i] =
      binary.charCodeAt(
        i
      );
  }


  return new Blob(
    [bytes],
    {
      type:
        mimeType ||
        "application/octet-stream"
    }
  );
}


async function reviewLeave(
  izinId,
  decision
) {

  const noteEl =
    document.getElementById(
      "review-note-" +
      izinId
    );


  const catatan =
    noteEl
      ? noteEl.value.trim()
      : "";


  try {

    const res =
      await apiRequest(
        "reviewLeave",
        {
          token:
            sessionToken,

          izinId,

          decision,

          catatan
        }
      );


    showToast(
      res.message
    );


    if (
      res.success
    ) {

      await loadDashboard();

      await openLeaveReview();
    }

  } catch (err) {

    showToast(
      err.message
    );
  }
}


/* =========================================================
   FEATURE ROUTER
========================================================= */

async function openFeature(
  name
) {

  if (
    name === "Kehadiran Saya"
    ||
    name === "Kehadiran"
  ) {

    if (
      currentUser
      &&
      (
        currentUser.role === "Admin"
        ||
        currentUser.role === "Pengurus"
      )
    ) {

      await openAttendanceManager();

    } else {

      await openMyAttendance();
    }

    return;
  }


  if (
    name === "Izin Tidak Hadir"
    ||
    name === "Izin"
  ) {

    await openLeaveCenter();

    return;
  }


  if (
    name === "Admin Center"
  ) {

    await openAdminCenter();

    return;
  }


  document
    .getElementById(
      "modalTitle"
    )
    .textContent =
      name;


  document
    .getElementById(
      "featureModal"
    )
    .classList
    .remove(
      "hidden"
    );
}


function showAllMenu() {

  if (
    currentUser
    &&
    (
      currentUser.role === "Admin"
      ||
      currentUser.role === "Pengurus"
    )
  ) {

    openAdminCenter();

  } else {

    showToast(
      "Gunakan menu utama pada dashboard."
    );
  }
}


/* =========================================================
   AGENDA / ANNOUNCEMENT
========================================================= */

function updateAgenda(
  agenda
) {

  const card =
    document.querySelector(
      ".agenda-card"
    );


  if (!card) {

    return;
  }


  if (!agenda) {

    card.innerHTML = `

      <div class="empty-agenda">
        Belum ada agenda aktif.
      </div>

    `;

    return;
  }


  const parts =
    String(
      agenda.tanggal || ""
    )
    .split(
      " "
    );


  const tanggal =
    parts[0] ||
    "-";


  const bulan =
    (
      parts[1] ||
      ""
    )
    .substring(
      0,
      3
    )
    .toUpperCase();


  card.innerHTML = `

    <div class="agenda-date">

      <strong>
        ${escapeHtml(tanggal)}
      </strong>

      <span>
        ${escapeHtml(bulan)}
      </span>

    </div>


    <div class="agenda-info">

      <div class="agenda-badge">
        ${escapeHtml(agenda.moda)}
      </div>

      <h4>
        ${escapeHtml(agenda.nama)}
      </h4>

      <p>
        📍
        ${escapeHtml(agenda.lokasi)}
      </p>

      <p>
        🕐
        ${escapeHtml(agenda.jam)}
      </p>

    </div>


    <button
      class="agenda-arrow"
      type="button"
      onclick="openFeature('Agenda MGMP')"
    >
      ›
    </button>

  `;
}


function updateAnnouncements(
  list
) {

  const card =
    document.querySelector(
      ".announcement-card"
    );


  if (!card) {

    return;
  }


  if (
    !list
    ||
    list.length === 0
  ) {

    card.innerHTML = `

      <div class="announcement-icon">
        📢
      </div>

      <div>

        <h4>
          Belum ada pengumuman
        </h4>

        <p>
          Informasi terbaru MGMP akan muncul di sini.
        </p>

      </div>

    `;

    return;
  }


  const item =
    list[0];


  card.innerHTML = `

    <div class="announcement-icon">
      📢
    </div>

    <div>

      <div class="announcement-label">
        ${escapeHtml(item.kategori || "UMUM")}
      </div>

      <h4>
        ${escapeHtml(item.judul)}
      </h4>

      <p>
        ${escapeHtml(item.isi)}
      </p>

    </div>

  `;
}


/* =========================================================
   NAV
========================================================= */

function setNav(
  element,
  name
) {

  document
    .querySelectorAll(
      ".nav-item"
    )
    .forEach(
      item =>
        item
          .classList
          .remove(
            "active"
          )
    );


  element
    .classList
    .add(
      "active"
    );


  if (
    name === "Home"
  ) {

    return;
  }


  if (
    name === "Profil"
  ) {

    showToast(

      currentUser.nama

      + " • "

      + currentUser.role

      + (
        currentUser.jabatan

          ? " • " +
            currentUser.jabatan

          : ""
      )

    );

    return;
  }


  openFeature(
    name
  );
}


/* =========================================================
   MODAL
========================================================= */

function showLoadingModal(
  title
) {

  setModalHtml(`

    <div class="modal-handle"></div>

    <button
      class="modal-close"
      type="button"
      onclick="closeModal()"
    >
      ×
    </button>

    <div class="modal-icon">
      ⏳
    </div>

    <h3>
      ${escapeHtml(title)}
    </h3>

    <p class="modal-subtitle">
      Memuat data...
    </p>

  `);
}


function setModalHtml(
  html
) {

  const modal =
    document.querySelector(
      "#featureModal .modal-card"
    );


  if (
    modal
  ) {

    modal.innerHTML =
      html;
  }


  document
    .getElementById(
      "featureModal"
    )
    .classList
    .remove(
      "hidden"
    );
}


function closeModal() {

  const modal =
    document.getElementById(
      "featureModal"
    );


  if (
    modal
  ) {

    modal
      .classList
      .add(
        "hidden"
      );
  }
}


function closeModalFromOverlay(
  event
) {

  if (
    event.target.id
    === "featureModal"
  ) {

    closeModal();
  }
}


/* =========================================================
   LOGOUT
========================================================= */

async function logout() {

  try {

    if (
      sessionToken
    ) {

      await apiRequest(
        "logout",
        {
          token:
            sessionToken
        }
      );
    }

  } catch (e) {

    console.warn(
      e
    );
  }


  forceLogout();
}


function forceLogout() {

  sessionToken = "";

  currentUser = null;


  localStorage.removeItem(
    "kom3_token"
  );


  localStorage.removeItem(
    "kom3_user"
  );


  const loginForm =
    document.getElementById(
      "loginForm"
    );


  if (
    loginForm
  ) {

    loginForm.reset();
  }


  closeModal();

  showLogin();
}


/* =========================================================
   TOAST
========================================================= */

function showToast(
  message
) {

  const toast =
    document.getElementById(
      "toast"
    );


  if (!toast) {

    alert(
      message
    );

    return;
  }


  toast.textContent =
    message;


  toast
    .classList
    .remove(
      "hidden"
    );


  clearTimeout(
    toastTimer
  );


  toastTimer =
    setTimeout(
      () => {

        toast
          .classList
          .add(
            "hidden"
          );

      },
      3500
    );
}


/* =========================================================
   UI HELPERS
========================================================= */

function valueOf(
  id
) {

  const el =
    document.getElementById(
      id
    );


  return el
    ? el.value.trim()
    : "";
}


function setText(
  id,
  value
) {

  const el =
    document.getElementById(
      id
    );


  if (
    el
  ) {

    el.textContent =
      value || "";
  }
}


function setButtonLoading(
  id,
  loading,
  text
) {

  const btn =
    document.getElementById(
      id
    );


  if (!btn) {

    return;
  }


  btn.disabled =
    loading;


  btn.textContent =
    text;
}


function statusClass(
  status
) {

  const value =
    String(
      status || ""
    )
    .toUpperCase();


  if (
    value === "ACTIVE"
  ) {

    return "approved";
  }


  if (
    value === "PENDING"
  ) {

    return "pending";
  }


  if (
    value === "REJECTED"
  ) {

    return "rejected";
  }


  return "neutral";
}


function leaveStatusClass(
  status
) {

  const value =
    String(
      status || ""
    )
    .toUpperCase();


  if (
    value === "APPROVED"
  ) {

    return "approved";
  }


  if (
    value === "PENDING"
  ) {

    return "pending";
  }


  if (
    value === "REJECTED"
  ) {

    return "rejected";
  }


  return "neutral";
}


function leaveStatusLabel(
  status
) {

  const value =
    String(
      status || ""
    )
    .toUpperCase();


  if (
    value === "APPROVED"
  ) {

    return "DISETUJUI";
  }


  if (
    value === "REJECTED"
  ) {

    return "DITOLAK";
  }


  if (
    value === "PENDING"
  ) {

    return "MENUNGGU";
  }


  return value ||
    "-";
}


function attendanceStatusClass(
  status
) {

  const value =
    String(
      status || ""
    )
    .toUpperCase();


  if (
    value === "HADIR"
  ) {

    return "hadir";
  }


  if (
    value === "IZIN"
  ) {

    return "izin";
  }


  if (
    value === "DINAS"
  ) {

    return "dinas";
  }


  return "neutral";
}


function statusIcon(
  status
) {

  const value =
    String(
      status || ""
    )
    .toUpperCase();


  if (
    value === "HADIR"
  ) {

    return "✓";
  }


  if (
    value === "IZIN"
  ) {

    return "🟡";
  }


  if (
    value === "DINAS"
  ) {

    return "🔵";
  }


  return "•";
}


function escapeHtml(
  text
) {

  return String(
    text == null
      ? ""
      : text
  )

  .replaceAll(
    "&",
    "&amp;"
  )

  .replaceAll(
    "<",
    "&lt;"
  )

  .replaceAll(
    ">",
    "&gt;"
  )

  .replaceAll(
    '"',
    "&quot;"
  )

  .replaceAll(
    "'",
    "&#039;"
  );
}


function escapeJs(
  text
) {

  return String(
    text == null
      ? ""
      : text
  )

  .replaceAll(
    "\\",
    "\\\\"
  )

  .replaceAll(
    "'",
    "\\'"
  )

  .replaceAll(
    "\n",
    " "
  )

  .replaceAll(
    "\r",
    " "
  );
}


/* =========================================================
   START APP
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  async () => {

    if (
      sessionToken
    ) {

      try {

        const stored =
          localStorage.getItem(
            "kom3_user"
          );


        if (
          stored
        ) {

          try {

            currentUser =
              JSON.parse(
                stored
              );

          } catch (e) {

            currentUser =
              null;
          }
        }


        await loadDashboard();


        if (
          currentUser
        ) {

          showDashboard();

          setupRoleInterface();

          return;
        }

      } catch (e) {

        console.error(
          e
        );

        forceLogout();

        return;
      }
    }


    showLogin();
  }
);
