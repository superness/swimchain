const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

// Monorepo workspace paths
const swimchainJs = path.resolve(__dirname, '../swimchain-js');
const swimchainReact = path.resolve(__dirname, '../swimchain-react');

const config = {
  server: {
    port: 8082,
  },
  watchFolders: [swimchainJs, swimchainReact],
  resolver: {
    extraNodeModules: {
      '@swimchain/core': swimchainJs,
      '@swimchain/react': swimchainReact,
    },
    // Resolve React Native modules from this package
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(__dirname, '../node_modules'),
    ],
  },
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
