/* ============================================
   PORTAL KOM 3
   FRONTEND STARTER

   Untuk sementara:
   MODE DEMO

   Login:
   admin
   admin123

   Nanti kita hubungkan ke Google Apps Script API.
============================================ */


const APP_CONFIG = {

  demoMode: true,

  apiUrl: ""

};


let currentUser = null;



/* ============================================
   PAGE HELPERS
============================================ */


function hideAllPages() {

  const pages = [

    "loginPage",
    "registerPage",
    "dashboardPage"

  ];


  pages.forEach(

    id => {

      document
        .getElementById(id)
        .classList
        .add("hidden");

    }

  );

}



function showLogin() {

  hideAllPages();


  document
    .getElementById("loginPage")
    .classList
    .remove("hidden");


  window.scrollTo({

    top: 0,

    behavior: "smooth"

  });

}



function showRegister() {

  hideAllPages();


  document
    .getElementById("registerPage")
    .classList
    .remove("hidden");


  window.scrollTo({

    top: 0,

    behavior: "smooth"

  });

}



function showDashboard() {

  hideAllPages();


  document
    .getElementById("dashboardPage")
    .classList
    .remove("hidden");


  updateDashboard();


  window.scrollTo({

    top: 0

  });

}



/* ============================================
   PASSWORD
============================================ */


function togglePassword() {

  const input =
    document.getElementById(
      "loginPassword"
    );


  if (
    input.type === "password"
  ) {

    input.type =
      "text";

  }

  else {

    input.type =
      "password";

  }

}



/* ============================================
   LOGIN
============================================ */


function handleLogin(event) {

  event.preventDefault();


  const username =

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
    !username ||
    !password
  ) {

    showToast(
      "Silakan isi username/email dan password."
    );

    return;

  }


  /*
   =========================================
   DEMO MODE
   =========================================
  */


  if (
    APP_CONFIG.demoMode
  ) {


    if (

      username.toLowerCase()
      === "admin"

      &&

      password
      === "admin123"

    ) {


      currentUser = {

        id:
          "KOM3-ENG-001",

        nama:
          "Admin Portal KOM 3",

        sekolah:
          "MGMP Bahasa Inggris Komisariat 3",

        role:
          "Admin",

        points:
          125

      };


      if (
        document
          .getElementById(
            "rememberMe"
          )
          .checked
      ) {

        localStorage.setItem(

          "kom3_demo_login",

          "true"

        );

      }


      localStorage.setItem(

        "kom3_demo_user",

        JSON.stringify(
          currentUser
        )

      );


      showToast(
        "Login berhasil. Selamat datang di Portal KOM 3."
      );


      setTimeout(

        showDashboard,

        350

      );


      return;

    }


    showToast(

      "Login demo: gunakan username admin dan password admin123."

    );


    return;

  }


  /*
   NANTI:
   Login asli melalui Apps Script API.
  */

}



/* ============================================
   REGISTER
============================================ */


function handleRegister(event) {

  event.preventDefault();


  const nama =

    document
      .getElementById(
        "regName"
      )
      .value
      .trim();


  const sekolah =

    document
      .getElementById(
        "regSchool"
      )
      .value
      .trim();


  const email =

    document
      .getElementById(
        "regEmail"
      )
      .value
      .trim();


  const username =

    document
      .getElementById(
        "regUsername"
      )
      .value
      .trim();


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
      "Lengkapi data wajib terlebih dahulu."
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


  /*
   Untuk sementara hanya demo frontend.
  */


  showToast(

    "Form pendaftaran sudah siap. Setelah backend Apps Script terhubung, data akan langsung masuk ke Google Sheets."

  );


  setTimeout(

    showLogin,

    1500

  );

}



/* ============================================
   DASHBOARD
============================================ */


function updateDashboard() {

  if (
    !currentUser
  ) {

    const storedUser =

      localStorage.getItem(
        "kom3_demo_user"
      );


    if (
      storedUser
    ) {

      currentUser =
        JSON.parse(
          storedUser
        );

    }

  }


  if (
    !currentUser
  ) {

    return;

  }


  document
    .getElementById(
      "dashboardName"
    )
    .textContent =
    currentUser.nama;


  document
    .getElementById(
      "dashboardSchool"
    )
    .textContent =
    currentUser.sekolah;


  document
    .getElementById(
      "dashboardRole"
    )
    .textContent =
    currentUser.role.toUpperCase();

}



/* ============================================
   QUICK MENU
============================================ */


function openFeature(name) {

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



function closeModalFromOverlay(event) {

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



/* ============================================
   BOTTOM NAV
============================================ */


function setNav(
  element,
  name
) {


  document
    .querySelectorAll(
      ".nav-item"
    )
    .forEach(

      item => {

        item
          .classList
          .remove(
            "active"
          );

      }

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



/* ============================================
   TOAST
============================================ */


let toastTimer = null;


function showToast(message) {

  const toast =

    document
      .getElementById(
        "toast"
      );


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



/* ============================================
   LOGOUT
============================================ */


function logout() {

  currentUser = null;


  localStorage.removeItem(
    "kom3_demo_login"
  );


  localStorage.removeItem(
    "kom3_demo_user"
  );


  showLogin();


  showToast(
    "Anda telah keluar dari Portal KOM 3."
  );

}



/* ============================================
   INITIAL APP
============================================ */


document
  .addEventListener(

    "DOMContentLoaded",

    () => {


      const remembered =

        localStorage.getItem(
          "kom3_demo_login"
        );


      const storedUser =

        localStorage.getItem(
          "kom3_demo_user"
        );


      if (

        remembered === "true"

        &&

        storedUser

      ) {


        currentUser =

          JSON.parse(
            storedUser
          );


        showDashboard();

      }

      else {

        showLogin();

      }

    }

  );
