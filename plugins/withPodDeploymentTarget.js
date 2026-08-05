const { withPodfile } = require('expo/config-plugins');

// A few pods (react-native-svg's resource bundle, async-storage's resource
// bundle) hardcode an old IPHONEOS_DEPLOYMENT_TARGET in their own podspec
// that CocoaPods honors ahead of the Podfile's `platform :ios` line — recent
// Xcode refuses to build below 15.0. expo-build-properties' deploymentTarget
// only patches the app target + Podfile platform line, not per-pod-target
// build settings, so it doesn't reach these. Force every Pods target here.
const MIN_DEPLOYMENT_TARGET = '16.4';

module.exports = function withPodDeploymentTarget(config) {
  return withPodfile(config, (config) => {
    const marker = '# @generated withPodDeploymentTarget';
    if (config.modResults.contents.includes(marker)) return config;

    const snippet = `
  ${marker}
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |build_configuration|
      build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${MIN_DEPLOYMENT_TARGET}'
    end
  end
`;

    const anchor = /post_install do \|installer\|/;
    if (!anchor.test(config.modResults.contents)) {
      throw new Error('withPodDeploymentTarget: could not find `post_install do |installer|` in Podfile');
    }
    config.modResults.contents = config.modResults.contents.replace(
      anchor,
      (match) => `${match}\n${snippet}`
    );
    return config;
  });
};
