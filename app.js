/* =========================================================
   PORTAL KOM 3
   FRONTEND OPERASIONAL V1.1
========================================================= */

const APP_CONFIG = {

  apiUrl:
    "https://script.google.com/macros/s/AKfycbzAZZn-ZT12OhGoAkULfvS_gtP29fUSvrrEME6xNJXaY2Wn9UFtBQLwOLC6pw1cusHLug/exec"

};


let currentUser = null;

let sessionToken =
  localStorage.getItem(
    "kom3_token"
  ) || "";


/* =========================================================
   API
========================================================= */

async function apiRequest(
  action,
  payload = {}
) {

  const response =
    await fetch(
      APP_CONFIG.apiUrl,
      {
        method: "POST",
        redirect: "follow",

        headers: {
          "Content-Type":
            "text/plain;charset=utf-8"
        },

        body:
          JSON.stringify({
            action: action,
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

  }

  catch (e) {

    console.log(text);

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


  showToast(
    "Memeriksa akun..."
  );


  try {

    const res =
      await apiRequest(
        "login",
        {
          user: user,
          password: password
        }
      );


    if (
      !res.success
    ) {

      showToast(
        res.message
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


    showToast(
      "Selamat datang, " +
      currentUser.nama +
      "."
    );


    setTimeout(
      setupRoleInterface,
      100
    );

  }

  catch (err) {

    showToast(
      err.message
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
    password !==
    password2
  ) {

    showToast(
      "Konfirmasi password tidak sama."
    );

    return;

  }


  showToast(
    "Mengirim pendaftaran..."
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
      res.message
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
        1200
      );

    }

  }

  catch (err) {

    showToast(
      err.message
    );

  }

}


/* =========================================================
   DASHBOARD
========================================================= */

async function loadDashboard() {

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


  updateProfileDisplay(
    res.user
  );


  updateStats(
    res.stats
  );


  updateAgenda(
    res.agenda
  );


  updateAnnouncements(
    res.pengumuman
  );

}


/* =========================================================
   PROFILE
========================================================= */

function updateProfileDisplay(
  user
) {

  setText(
    "dashboardName",
    user.nama
  );

  setText(
    "dashboardSchool",
    user.sekolah
  );

  setText(
    "dashboardRole",
    String(
      user.role
    )
    .toUpperCase()
  );


  const member =
    document.querySelector(
      ".member-id strong"
    );


  if (member) {

    member.textContent =
      user.id;

  }

}


/* =========================================================
   STATS
========================================================= */

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


  const statValues =
    document.querySelectorAll(
      ".mini-stat strong"
    );


  if (
    statValues[0]
  ) {

    statValues[0].textContent =
      stats.attendance ||
      "0 / 0";

  }


  if (
    statValues[1]
  ) {

    statValues[1].textContent =
      stats.certificates || 0;

  }


  if (
    statValues[2]
  ) {

    statValues[2].textContent =
      (
        stats.streak || 0
      ) + "x";

  }


  if (
    statValues[3]
  ) {

    statValues[3].textContent =
      stats.kas ||
      "Belum ada";

  }

}


/* =========================================================
   ROLE INTERFACE
========================================================= */

function setupRoleInterface() {

  /*
   Tombol lonceng:
   Admin/Pengurus = User Center
  */


  const notif =
    document.querySelector(
      ".notification-button"
    );


  if (notif) {

    notif.onclick =
      function() {

        if (
          currentUser &&
          (
            currentUser.role ===
              "Admin"
            ||
            currentUser.role ===
              "Pengurus"
          )
        ) {

          openUserCenter();

        }

        else {

          showToast(
            "Tidak ada notifikasi baru."
          );

        }

      };

  }

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


    let html = `

      <div class="modal-handle"></div>

      <button
        class="modal-close"
        onclick="closeModal()"
      >
        ×
      </button>

      <h3>
        Manajemen Anggota
      </h3>

      <p style="
        color:#708095;
        font-size:12px;
        margin-bottom:15px;
      ">
        Aktifkan akun baru dan
        kelola pengurus.
      </p>

    `;


    res.users.forEach(
      user => {

        html += `

          <div style="
            padding:12px;
            margin-bottom:10px;
            background:#f5f8fb;
            border-radius:14px;
            text-align:left;
          ">

            <strong>
              ${escapeHtml(user.nama)}
            </strong>

            <div style="
              font-size:11px;
              color:#708095;
              margin-top:3px;
            ">
              ${escapeHtml(user.sekolah)}
              <br>
              ${escapeHtml(user.id)}
            </div>

            <div style="
              margin-top:8px;
              font-size:11px;
            ">

              Status:
              <b>
                ${escapeHtml(user.status)}
              </b>

              &nbsp; | &nbsp;

              Role:
              <b>
                ${escapeHtml(user.role)}
              </b>

            </div>

        `;


        if (
          user.status ===
          "PENDING"
        ) {

          html += `

            <button
              type="button"
              class="primary-button"
              style="
                margin-top:10px;
                min-height:40px;
              "
              onclick="approveMember(
                '${user.id}'
              )"
            >
              ✓ Aktifkan Anggota
            </button>

          `;

        }


        if (
          currentUser.role ===
          "Admin"
        ) {

          html += `

            <div style="
              display:grid;
              grid-template-columns:
                1fr 1fr;
              gap:6px;
              margin-top:8px;
            ">

              <select
                id="role-${user.id}"
                style="
                  min-height:40px;
                  border:1px solid #dce4ec;
                  border-radius:10px;
                  padding:6px;
                "
              >

                <option
                  value="Anggota"
                  ${user.role === "Anggota"
                    ? "selected"
                    : ""}
                >
                  Anggota
                </option>

                <option
                  value="Pengurus"
                  ${user.role === "Pengurus"
                    ? "selected"
                    : ""}
                >
                  Pengurus
                </option>

              </select>


              <select
                id="jabatan-${user.id}"
                style="
                  min-height:40px;
                  border:1px solid #dce4ec;
                  border-radius:10px;
                  padding:6px;
                "
              >

                ${jabatanOptions(
                  user.jabatan
                )}

              </select>

            </div>


            <button
              type="button"
              class="secondary-button"
              style="
                min-height:40px;
                margin-top:6px;
              "
              onclick="saveUserRole(
                '${user.id}'
              )"
            >
              Simpan Role & Jabatan
            </button>

          `;

        }


        html += `
          </div>
        `;

      }
    );


    html += `

      <button
        class="secondary-button"
        onclick="closeModal()"
      >
        Tutup
      </button>

    `;


    setModalHtml(
      html
    );

  }

  catch (err) {

    showToast(
      err.message
    );

    closeModal();

  }

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
          ${x === selected
            ? "selected"
            : ""}
        >
          ${x}
        </option>

      `
    )
    .join("");

}


/* =========================================================
   APPROVE MEMBER
========================================================= */

async function approveMember(
  id
) {

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

    openUserCenter();

  }

}


/* =========================================================
   ROLE
========================================================= */

async function saveUserRole(
  userId
) {

  const role =
    document
      .getElementById(
        "role-" +
        userId
      )
      .value;


  const jabatan =
    document
      .getElementById(
        "jabatan-" +
        userId
      )
      .value;


  const res =
    await apiRequest(
      "updateUserAccess",
      {
        token:
          sessionToken,

        userId:
          userId,

        role:
          role,

        jabatan:
          jabatan
      }
    );


  showToast(
    res.message
  );


  if (
    res.success
  ) {

    openUserCenter();

  }

}


/* =========================================================
   FEATURE
========================================================= */

async function openFeature(
  name
) {

  /*
   KEHADIRAN
  */

  if (
    name ===
    "Kehadiran Saya"
    ||
    name ===
    "Kehadiran"
  ) {

    if (
      currentUser.role ===
        "Admin"
      ||
      currentUser.role ===
        "Pengurus"
    ) {

      await openAttendanceManager();

    }

    else {

      await openMyAttendance();

    }

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


/* =========================================================
   ABSENSI MANAGER
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
        onclick="closeModal()"
      >
        ×
      </button>

      <h3>
        Absensi Pertemuan
      </h3>

      <p style="
        color:#708095;
        font-size:11px;
        line-height:1.5;
      ">

        <b>
          ${escapeHtml(
            res.agenda.nama
          )}
        </b>

        <br>

        ${escapeHtml(
          res.agenda.tanggal
        )}

        •

        ${escapeHtml(
          res.agenda.jam
        )}

      </p>

      <div style="
        margin-top:14px;
        max-height:55vh;
        overflow:auto;
      ">

    `;


    res.users.forEach(
      user => {

        const sudah =
          user.statusAbsen ===
          "HADIR";


        html += `

          <div style="
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:10px;
            padding:10px;
            margin-bottom:8px;
            background:#f5f8fb;
            border-radius:12px;
            text-align:left;
          ">

            <div style="
              min-width:0;
            ">

              <strong style="
                font-size:12px;
              ">
                ${escapeHtml(
                  user.nama
                )}
              </strong>

              <div style="
                font-size:10px;
                color:#708095;
                margin-top:3px;
              ">
                ${escapeHtml(
                  user.sekolah
                )}
              </div>

            </div>


            ${
              sudah

              ? `

                <span style="
                  padding:7px 9px;
                  color:#12805c;
                  background:#e3f7ef;
                  border-radius:10px;
                  font-size:10px;
                  font-weight:800;
                ">
                  ✓ HADIR
                </span>

              `

              : `

                <button
                  type="button"
                  onclick="
                    markPresent(
                      '${user.id}'
                    )
                  "
                  style="
                    border:0;
                    padding:8px 10px;
                    color:white;
                    background:#14538a;
                    border-radius:10px;
                    font-size:10px;
                    font-weight:800;
                  "
                >
                  HADIR
                </button>

              `
            }

          </div>

        `;

      }
    );


    html += `

      </div>

      <button
        class="secondary-button"
        onclick="closeModal()"
      >
        Selesai
      </button>

    `;


    setModalHtml(
      html
    );

  }

  catch (err) {

    showToast(
      err.message
    );

    closeModal();

  }

}


/* =========================================================
   MARK PRESENT
========================================================= */

async function markPresent(
  userId
) {

  showToast(
    "Menyimpan kehadiran..."
  );


  const res =
    await apiRequest(
      "markAttendance",
      {
        token:
          sessionToken,

        userId:
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

}


/* =========================================================
   MY ATTENDANCE
========================================================= */

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
        onclick="closeModal()"
      >
        ×
      </button>

      <h3>
        Kehadiran Saya
      </h3>

    `;


    if (
      res.history.length === 0
    ) {

      html += `

        <p style="
          color:#708095;
          font-size:12px;
        ">
          Belum ada riwayat kehadiran.
        </p>

      `;

    }


    res.history.forEach(
      item => {

        html += `

          <div style="
            padding:12px;
            margin-top:8px;
            background:#f5f8fb;
            border-radius:12px;
            text-align:left;
          ">

            <strong style="
              font-size:12px;
            ">
              ${escapeHtml(
                item.agenda
              )}
            </strong>

            <div style="
              color:#708095;
              font-size:10px;
              margin-top:4px;
            ">
              ${escapeHtml(
                item.tanggal
              )}

              •

              ${escapeHtml(
                item.jam
              )}
            </div>

            <div style="
              margin-top:5px;
              color:#12805c;
              font-size:10px;
              font-weight:900;
            ">
              ✓ ${escapeHtml(
                item.status
              )}
            </div>

          </div>

        `;

      }
    );


    html += `

      <button
        class="secondary-button"
        onclick="closeModal()"
      >
        Tutup
      </button>

    `;


    setModalHtml(
      html
    );

  }

  catch (err) {

    showToast(
      err.message
    );

    closeModal();

  }

}


/* =========================================================
   MODAL HELPERS
========================================================= */

function showLoadingModal(
  title
) {

  setModalHtml(`

    <div class="modal-handle"></div>

    <button
      class="modal-close"
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

    <p>
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


  if (modal) {

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

  document
    .getElementById(
      "featureModal"
    )
    .classList
    .add(
      "hidden"
    );

}


function closeModalFromOverlay(
  event
) {

  if (
    event.target.id ===
    "featureModal"
  ) {

    closeModal();

  }

}


function showAllMenu() {

  if (
    currentUser &&
    (
      currentUser.role ===
        "Admin"
      ||
      currentUser.role ===
        "Pengurus"
    )
  ) {

    openUserCenter();

  }

  else {

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


  if (
    !card
  ) {
    return;
  }


  if (!agenda) {

    card.innerHTML = `
      <div style="
        grid-column:1/-1;
        padding:14px;
        color:#708095;
      ">
        Belum ada agenda aktif.
      </div>
    `;

    return;

  }


  const parts =
    agenda.tanggal
      .split(" ");


  card.innerHTML = `

    <div class="agenda-date">

      <strong>
        ${escapeHtml(
          parts[0] || "-"
        )}
      </strong>

      <span>
        ${escapeHtml(
          (
            parts[1] || ""
          )
          .substring(
            0,
            3
          )
          .toUpperCase()
        )}
      </span>

    </div>


    <div class="agenda-info">

      <div class="agenda-badge">
        ${escapeHtml(
          agenda.moda
        )}
      </div>

      <h4>
        ${escapeHtml(
          agenda.nama
        )}
      </h4>

      <p>
        📍
        ${escapeHtml(
          agenda.lokasi
        )}
      </p>

      <p>
        🕐
        ${escapeHtml(
          agenda.jam
        )}
      </p>

    </div>


    <button
      class="agenda-arrow"
      onclick="
        openFeature(
          'Agenda MGMP'
        )
      "
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
    !list ||
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
        ${escapeHtml(
          item.kategori ||
          "UMUM"
        )}
      </div>

      <h4>
        ${escapeHtml(
          item.judul
        )}
      </h4>

      <p>
        ${escapeHtml(
          item.isi
        )}
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
        item.classList.remove(
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
      currentUser.nama +
      " • " +
      currentUser.role +
      " • " +
      (
        currentUser.jabatan ||
        ""
      )
    );

    return;

  }


  openFeature(
    name
  );

}


/* =========================================================
   LOGOUT
========================================================= */

async function logout() {

  try {

    await apiRequest(
      "logout",
      {
        token:
          sessionToken
      }
    );

  }

  catch (e) {}


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


  showLogin();

}


/* =========================================================
   TOAST
========================================================= */

let toastTimer;


function showToast(
  message
) {

  const toast =
    document.getElementById(
      "toast"
    );


  if (!toast) {

    alert(message);

    return;

  }


  toast.textContent =
    message;


  toast.classList.remove(
    "hidden"
  );


  clearTimeout(
    toastTimer
  );


  toastTimer =
    setTimeout(
      () => {
        toast.classList.add(
          "hidden"
        );
      },
      3500
    );

}


/* =========================================================
   HELPERS
========================================================= */

function valueOf(id) {

  return document
    .getElementById(id)
    .value
    .trim();

}


function setText(
  id,
  value
) {

  const el =
    document.getElementById(
      id
    );


  if (el) {

    el.textContent =
      value || "";

  }

}


function escapeHtml(text) {

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


/* =========================================================
   START
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  async () => {

    if (
      sessionToken
    ) {

      try {

        await loadDashboard();

        if (
          currentUser
        ) {

          showDashboard();

          setTimeout(
            setupRoleInterface,
            100
          );

          return;

        }

      }

      catch (e) {

        console.log(e);

      }

    }


    showLogin();

  }
);
