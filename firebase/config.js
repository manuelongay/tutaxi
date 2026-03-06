/* ============================================================
   tuTaxi — firebase/config.js
   Configuración de Firebase
   ============================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
  apiKey:            "AIzaSyBT48rx-jST_-Tsm65XQ-iwZMLnzVhX_FE",
  authDomain:        "tutaxi-f8e7e.firebaseapp.com",
  databaseURL:       "https://tutaxi-f8e7e-default-rtdb.firebaseio.com",
  projectId:         "tutaxi-f8e7e",
  storageBucket:     "tutaxi-f8e7e.firebasestorage.app",
  messagingSenderId: "710035138200",
  appId:             "1:710035138200:web:1c4ed6292b63e5f4c752ed"
};

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

export { db };
