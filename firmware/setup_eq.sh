#!/bin/bash
# One-time EQ setup for ThePod — run once on the Pi while it has internet
set -e

echo "[EQ] Installing alsaequal..."
sudo apt-get update -qq && sudo apt-get install -y libasound2-plugin-equal

echo "[EQ] Writing /etc/asound.conf..."
sudo tee /etc/asound.conf > /dev/null <<'EOF'
pcm.equal {
    type equal;
    slave.pcm "plughw:2,0";
}

ctl.equal {
    type equal;
}
EOF

echo "[EQ] Patching MPD to use equal device..."
sudo sed -i 's/device "hw:2,0"/device "equal"/' /etc/mpd.conf

echo "[EQ] Restarting MPD and ThePod..."
sudo systemctl restart mpd
sleep 2
sudo systemctl restart thepod

echo "[EQ] Done. Run 'amixer -D equal' to verify EQ controls are present."
