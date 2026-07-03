// react-native-maps es 100% nativo: no tiene build para web y su propio
// package.json no declara un entry point alternativo para ese target.
// Expo Router bundlea todas las variantes de una ruta (map.tsx y
// map.web.tsx) al armar el árbol de rutas, así que aunque map.web.tsx no
// importe react-native-maps, Metro igual intenta resolverlo para web y
// rompe el build. La solución estándar es interceptar la resolución acá:
// cuando el target sea "web" y se pida "react-native-maps", devolvemos un
// módulo vacío en vez de dejar que Metro intente transformarlo.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-maps') {
    return { type: 'empty' };
  }
  if (upstreamResolveRequest) {
    return upstreamResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
