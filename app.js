/* ==================================================
   PORTAL KOM 3
   FRONTEND GITHUB + APPS SCRIPT API
================================================== */


const APP_CONFIG = {

  apiUrl:
    "https://script.google.com/macros/s/AKfycbzAZZn-ZT12OhGoAkULfvS_gtP29fUSvrrEME6xNJXaY2Wn9UFtBQLwOLC6pw1cusHLug/exec"

};


let currentUser = null;

let sessionToken =
  localStorage.getItem(
    "kom3_token"
  ) || "";


/* ==================================================
 API REQUEST
================================================== */


async function apiRequest(
  action,
  payload = {}
) {

  if (
    !APP_CONFIG.apiUrl
    ||
    APP_CONFIG.apiUrl.indexOf(
      "PASTE_URL"
    ) >= 0
  ) {

    throw new Error(
      "URL Apps Script belum dimasukkan di app.js."
    );

  }


  const body = {

    action:
      action,

    ...payload

  };


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
          JSON.stringify(
            body
          )

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
      "Response server tidak valid."
    );

  }

}


/* ==================================================
 PAGE
================================================== */


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


/* ==================================================
 PASSWORD
================================================== */


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


/* ==================================================
 LOGIN
================================================== */


async function handleLogin(
  event
) {

  event.preventDefault();


  const user =
    document
      .getElementById(
        "loginUser"
      )
      .value
      .trim();


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
      "Silakan isi username/email dan password."
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

          user:
            user,

          password:
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


    showToast(
      "Selamat datang, " +
      currentUser.nama +
      "."
    );

  }

  catch (err) {

    showToast(
      err.message
    );

  }

}


/* ==================================================
 REGISTER
================================================== */


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
    password !== password2
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

          nama:
            nama,

          nip:
            nip,

          sekolah:
            sekolah,

          email:
            email,

          wa:
            wa,

          username:
            username,

          password:
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


/* ==================================================
 DASHBOARD
================================================== */


async function loadDashboard() {

  if (
    !sessionToken
  ) {

    return;

  }


  try {

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

  catch (err) {

    console.error(
      err
    );

  }

}


/* ==================================================
 PROFILE DISPLAY
================================================== */


function updateProfileDisplay(
  user
) {

  const name =
    document.getElementById(
      "dashboardName"
    );


  const school =
    document.getElementById(
      "dashboardSchool"
    );


  const role =
    document.getElementById(
      "dashboardRole"
    );


  if (name) {

    name.textContent =
      user.nama;

  }


  if (school) {

    school.textContent =
      user.sekolah;

  }


  if (role) {

    role.textContent =
      String(
        user.role
      )
      .toUpperCase();

  }


  /*
   MEMBER ID
  */


  const memberIdEl =
    document.querySelector(
      ".member-id strong"
    );


  if (memberIdEl) {

    memberIdEl.textContent =
      user.id;

  }

}


/* ==================================================
 STATS
================================================== */


function updateStats(
  stats
) {

  /*
   Untuk versi awal,
   kartu visual masih menggunakan
   struktur HTML yang sudah ada.

   Data real poin/absensi akan kita
   aktifkan pada tahap berikutnya.
  */


  const pointEl =
    document.querySelector(
      ".points-value strong"
    );


  if (pointEl) {

    pointEl.textContent =
      stats.points || 0;

  }

}


/* ==================================================
 AGENDA
================================================== */


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


  if (
    !agenda
  ) {

    card.innerHTML = `

      <div style="
        grid-column:1/-1;
        padding:12px;
        color:#708095;
        font-size:12px;
      ">

        Belum ada agenda aktif.

      </div>

    `;

    return;

  }


  const parts =
    agenda.tanggal
      .split(" ");


  const tanggal =
    parts[0] || "-";


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
        📍 ${escapeHtml(agenda.lokasi)}
      </p>

      <p>
        🕐 ${escapeHtml(agenda.jam)}
      </p>

    </div>


    <button
      class="agenda-arrow"
      onclick="openFeature('Agenda MGMP')"
    >
      ›
    </button>

  `;

}


/* ==================================================
 PENGUMUMAN
================================================== */


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

        <p>
          Informasi terbaru MGMP
          akan muncul di sini.
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


/* ==================================================
 FEATURE
================================================== */


function openFeature(
  name
) {

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
    event.target.id
    === "featureModal"
  ) {

    closeModal();

  }

}


function showAllMenu() {

  openFeature(
    "Semua Menu Portal KOM 3"
  );

}


/* ==================================================
 NAV
================================================== */


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
    name !== "Home"
  ) {

    openFeature(
      name
    );

  }

}


/* ==================================================
 LOGOUT
================================================== */


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


/* ==================================================
 TOAST
================================================== */


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


/* ==================================================
 HELPERS
================================================== */


function valueOf(
  id
) {

  return document
    .getElementById(id)
    .value
    .trim();

}


function escapeHtml(
  text
) {

  return String(
    text ?? ""
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


/* ==================================================
 START APP
================================================== */


document.addEventListener(

  "DOMContentLoaded",

  async () => {


    if (
      sessionToken
    ) {


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

        }

        catch (e) {}

      }


      await loadDashboard();


      if (
        currentUser
      ) {

        showDashboard();

        return;

      }

    }


    showLogin();

  }

);
