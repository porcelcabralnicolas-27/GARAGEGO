// GarageGo — configuración de Metro.
//
// Única razón por la que existe este archivo: el backoffice vive en `admin-panel/`, que es un
// proyecto Vite independiente con su propio `node_modules` (react y react-dom incluidos). Metro
// vigila `projectRoot`, así que sin esto rastrearía ese árbol entero al arrancar: crawl más lento
// y, sobre todo, una segunda copia de react/react-dom en el file map.
//
// Tres detalles que no son obvios:
//  · El blockList por defecto de Expo es un ARRAY de RegExp (excluye .expo/types, .expo/web/cache,
//    __tests__, android/build, .gradle, ios/Pods). Se concatena; reemplazarlo los perdería.
//  · Metro combina todos los patrones en un solo RegExp y falla con "Cannot combine blockList
//    patterns, because they have different flags" si difieren. Los de Expo no llevan flags, así
//    que este tampoco (nada de /i).
//  · La clase [\/] cubre las dos separaciones: en Windows las rutas del file map vienen con \.

const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const current = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(current) ? current : current ? [current] : []),
  /[\\/]admin-panel[\\/]/,
];

module.exports = config;
