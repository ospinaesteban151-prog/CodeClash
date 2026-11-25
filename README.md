# CodeClash

Plataforma privada para duelos de programación y SQL entre amigos. Está construida sobre la aplicación y SQLite existentes: el arranque aplica extensiones de esquema compatibles y mantiene los usuarios, desafíos, partidas y envíos guardados.

## Requisitos e inicio

- Node.js 22.9 o superior.
- Python 3 para evaluación SQL.
- Judge0 CE para evaluar Programming PvP.

```sh
npm install
cp .env.example .env
# Configura Judge0 según la sección siguiente.
npm start
```

Abre `http://localhost:3000`. `npm run dev` inicia el modo de desarrollo y `npm test` ejecuta pruebas de integración. Los datos de la aplicación se conservan en `.data/codeclash.db`; **no borres ese archivo para actualizar**. La extensión de tablas y columnas se realiza automáticamente al iniciar. Para ejecutar las pruebas, se usa una SQLite temporal independiente.

## Variables de entorno

- `PORT`: puerto HTTP y Socket.IO (predeterminado `3000`).
- `APP_URL`: origen público usado para construir enlaces de invitación.
- `JUDGE0_URL`: URL base de Judge0 CE. Sin esta variable, Programming PvP muestra un error claro y rechaza envíos sin declarar resultados.
- `JUDGE0_TOKEN`: token opcional si el proveedor de Judge0 lo exige.
- `CODECLASH_DATA_DIR`: directorio alternativo para la SQLite; no lo cambies en el despliegue normal si quieres conservar `.data/codeclash.db`.

Judge0 se invoca en el backend por cada caso, con límites de 2 segundos de CPU y 128 MB de memoria. La integración utiliza los IDs de lenguaje CE: JavaScript 63, Java 62, Python 71 y C# 51. Para producción, apunta `JUDGE0_URL` a una instancia aislada que restrinja red y permisos.

## Competición

El catálogo inicial contiene 12 ejercicios de programación y 10 de SQL, en tres dificultades. El cliente usa Monaco con los bundles locales y Socket.IO autenticado mediante la cookie de sesión. Las salas requieren autorización de ambos participantes; la preparación, el inicio, la presencia, las reconexiones (período de gracia de 30 segundos) y los resultados se gestionan desde el servidor. El código fuente nunca se comparte con el oponente.

«Ejecutar» usa los ejemplos públicos. «Enviar solución» verifica los casos privados en el backend y fija un ganador mediante una actualización atómica. Judge0 ejecuta el código fuera del proceso de la aplicación. SQL crea una base efímera por envío, bloquea DML/DDL/ATTACH/PRAGMA y mata el proceso de evaluación si excede 3 segundos. Los resultados públicos de ejecución SQL se muestran como tabla.

El historial registra ganador, participantes, ejercicio, hora, tiempo de resolución y estado de cada intento. Los resultados ocultos de los casos privados y el código fuente no se devuelven en el historial.

## Pruebas

`npm test` inicia un servidor aislado con una base temporal y dos usuarios distintos. Comprueba el catálogo, creación y aceptación de una invitación, conexión y reconexión Socket.IO, cuenta regresiva, bloqueo de escritura SQL, valida los ejemplos solucionados de los 10 ejercicios SQL, envío incorrecto, aceptación de una solución, ganador y persistencia en historial/resultados. También comprueba el error de configuración cuando Judge0 no está disponible. La suite no modifica la SQLite existente.

## Despliegue

Publica detrás de HTTPS, configura `APP_URL` con el dominio real y conserva `.data` en almacenamiento persistente y respaldado. Si se ejecutan varias instancias, hace falta trasladar el estado temporal de desconexión y temporizadores a un almacén compartido y configurar el adaptador distribuido de Socket.IO. La persistencia actual es SQLite de una sola instancia.
