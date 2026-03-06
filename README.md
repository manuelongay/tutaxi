# tuTaxi 🚕

App de ride-sharing donde el pasajero propone la tarifa.

## Estructura
```
tutaxi/
├── index.html              ← Entrada principal (redirige a webapp)
├── app/
│   ├── webapp.html         ← App usuario/conductor
│   └── admin.html          ← Panel administrativo
├── assets/
│   ├── css/
│   │   ├── main.css        ← Estilos compartidos
│   │   ├── webapp.css      ← Estilos de la app
│   │   └── admin.css       ← Estilos del admin
│   └── js/
│       ├── db.js           ← Capa de datos (cambiar aquí para migrar a Firebase)
│       ├── webapp.js       ← Lógica de la app
│       └── admin.js        ← Lógica del admin
└── firebase/
    └── config.js           ← Configuración Firebase (próximamente)
```

## Cómo usar localmente
Abre `app/webapp.html` en tu navegador.
Para el admin: abre `app/admin.html` (usuario: admin / contraseña: admin123)

## Tecnologías
- Leaflet.js — Mapas
- OpenStreetMap — Tiles gratuitos
- OSRM — Rutas gratuitas
- Nominatim — Geocodificación gratuita
- localStorage → Firebase (próximamente)
