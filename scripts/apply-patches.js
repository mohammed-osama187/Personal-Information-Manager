const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'android-custom-plugins', 'local-notifications');
const destDir = path.join(__dirname, '..', 'node_modules', '@capacitor', 'local-notifications', 'android', 'src', 'main', 'java', 'com', 'capacitorjs', 'plugins', 'localnotifications');

if (fs.existsSync(srcDir) && fs.existsSync(destDir)) {
    const files = ['LocalNotificationManager.java', 'LocalNotificationsPlugin.java'];
    files.forEach(file => {
        const src = path.join(srcDir, file);
        const dest = path.join(destDir, file);
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, dest);
            console.log(`[FlowTick Patches] Successfully patched ${file}`);
        }
    });
} else {
    console.log('[FlowTick Patches] Skipping patch (destination or source not found).');
}
